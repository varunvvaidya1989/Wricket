alter table public.scoring_leases
add column device_id text,
add constraint scoring_leases_token_key unique (lease_token);

create or replace function app_private.acquire_scoring_lease(
  p_match_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_lease public.scoring_leases%rowtype;
  new_token text := gen_random_uuid()::text;
  new_expiry timestamptz := now() + interval '2 minutes';
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;
  if nullif(trim(p_device_id), '') is null then
    raise exception 'Device ID is required';
  end if;
  if not exists (
    select 1
    from public.matches match
    join public.tournament_members member on member.tournament_id = match.tournament_id
    where match.id = p_match_id
      and member.account_id = (select auth.uid())
      and member.role in ('OWNER', 'ADMIN', 'SCORER')
      and member.status = 'ACTIVE'
      and match.status in ('IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION')
  ) then
    raise exception 'You are not authorised to score this match';
  end if;

  select * into existing_lease
  from public.scoring_leases
  where match_id = p_match_id
  for update;

  if found
    and existing_lease.expires_at > now()
    and (
      existing_lease.account_id <> (select auth.uid())
      or existing_lease.device_id is distinct from p_device_id
    ) then
    raise exception 'Another scorer currently holds this match';
  end if;

  insert into public.scoring_leases(
    match_id, account_id, lease_token, device_id, expires_at, updated_at
  )
  values (
    p_match_id, (select auth.uid()), new_token, p_device_id, new_expiry, now()
  )
  on conflict (match_id) do update
  set
    account_id = excluded.account_id,
    lease_token = excluded.lease_token,
    device_id = excluded.device_id,
    expires_at = excluded.expires_at,
    updated_at = now();

  return jsonb_build_object(
    'lease_token', new_token,
    'expires_at', new_expiry
  );
end;
$$;

create or replace function app_private.append_match_event(
  p_match_id uuid,
  p_client_event_id text,
  p_expected_sequence bigint,
  p_lease_token text,
  p_kind public.match_event_kind,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_match public.matches%rowtype;
  existing_event public.match_events%rowtype;
  next_sequence bigint;
  current_scoreboard jsonb;
  next_scoreboard jsonb;
  runs_delta integer;
  wickets_delta integer;
  legal_balls_delta integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  if not exists (
    select 1 from public.scoring_leases lease
    where lease.match_id = p_match_id
      and lease.account_id = (select auth.uid())
      and lease.lease_token = p_lease_token
      and lease.expires_at > now()
  ) then
    raise exception 'Scoring lease is missing or expired';
  end if;

  select * into existing_event
  from public.match_events
  where match_id = p_match_id and client_event_id = p_client_event_id;

  if found then
    select scoreboard into current_scoreboard
    from public.match_snapshots where match_id = p_match_id;
    return jsonb_build_object(
      'sequence', existing_event.sequence,
      'duplicate', true,
      'scoreboard', coalesce(current_scoreboard, '{}'::jsonb)
    );
  end if;

  select * into selected_match
  from public.matches
  where id = p_match_id
  for update;
  if not found then raise exception 'Match not found'; end if;
  if selected_match.status not in ('IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION') then
    raise exception 'Match is not open for scoring';
  end if;
  if selected_match.current_sequence <> p_expected_sequence then
    raise exception 'Sequence conflict: expected %, current %',
      p_expected_sequence, selected_match.current_sequence
      using errcode = '40001';
  end if;

  next_sequence := selected_match.current_sequence + 1;
  select scoreboard into current_scoreboard
  from public.match_snapshots
  where match_id = p_match_id
  for update;
  current_scoreboard := coalesce(current_scoreboard, '{}'::jsonb);
  next_scoreboard := current_scoreboard;

  if p_kind = 'BALL_RECORDED' then
    runs_delta := coalesce((p_payload->>'runs_bat')::integer, 0)
      + coalesce((p_payload->>'runs_extra')::integer, 0);
    wickets_delta := case when coalesce((p_payload->>'is_wicket')::boolean, false) then 1 else 0 end;
    legal_balls_delta := case when coalesce((p_payload->>'is_legal')::boolean, false) then 1 else 0 end;
    if runs_delta < 0 then raise exception 'Ball runs cannot be negative'; end if;
    next_scoreboard := jsonb_build_object(
      'innings_id', p_payload->>'innings_id',
      'total_runs', coalesce((current_scoreboard->>'total_runs')::integer, 0) + runs_delta,
      'total_wickets', coalesce((current_scoreboard->>'total_wickets')::integer, 0) + wickets_delta,
      'legal_balls', coalesce((current_scoreboard->>'legal_balls')::integer, 0) + legal_balls_delta,
      'last_ball', p_payload,
      'updated_at', now()
    );
  end if;

  insert into public.match_events(
    match_id, client_event_id, sequence, kind, payload, scorer_id
  )
  values (
    p_match_id, p_client_event_id, next_sequence, p_kind, p_payload, (select auth.uid())
  );

  insert into public.match_snapshots(
    match_id, latest_sequence, scoreboard, scorecard, updated_at
  )
  values (p_match_id, next_sequence, next_scoreboard, '{}'::jsonb, now())
  on conflict (match_id) do update
  set
    latest_sequence = excluded.latest_sequence,
    scoreboard = excluded.scoreboard,
    updated_at = now();

  update public.matches
  set current_sequence = next_sequence, updated_at = now()
  where id = p_match_id;

  update public.scoring_leases
  set expires_at = now() + interval '2 minutes', updated_at = now()
  where match_id = p_match_id and lease_token = p_lease_token;

  return jsonb_build_object(
    'sequence', next_sequence,
    'duplicate', false,
    'scoreboard', next_scoreboard
  );
end;
$$;

revoke all on function app_private.acquire_scoring_lease(uuid, text) from public, anon;
grant execute on function app_private.acquire_scoring_lease(uuid, text) to authenticated;
revoke all on function app_private.append_match_event(uuid, text, bigint, text, public.match_event_kind, jsonb)
from public, anon;
grant execute on function app_private.append_match_event(uuid, text, bigint, text, public.match_event_kind, jsonb)
to authenticated;

create or replace function public.acquire_scoring_lease(p_match_id uuid, p_device_id text)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select app_private.acquire_scoring_lease(p_match_id, p_device_id);
$$;

create or replace function public.append_match_event(
  p_match_id uuid,
  p_client_event_id text,
  p_expected_sequence bigint,
  p_lease_token text,
  p_kind public.match_event_kind,
  p_payload jsonb
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select app_private.append_match_event(
    p_match_id,
    p_client_event_id,
    p_expected_sequence,
    p_lease_token,
    p_kind,
    p_payload
  );
$$;

revoke all on function public.acquire_scoring_lease(uuid, text) from public, anon;
grant execute on function public.acquire_scoring_lease(uuid, text) to authenticated;
revoke all on function public.append_match_event(uuid, text, bigint, text, public.match_event_kind, jsonb)
from public, anon;
grant execute on function public.append_match_event(uuid, text, bigint, text, public.match_event_kind, jsonb)
to authenticated;
