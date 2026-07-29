alter table public.matches
add column if not exists result jsonb;

alter table public.match_innings
add column if not exists total_runs integer not null default 0 check (total_runs >= 0),
add column if not exists total_wickets integer not null default 0 check (total_wickets >= 0),
add column if not exists total_balls integer not null default 0 check (total_balls >= 0);

create or replace function app_private.append_match_lifecycle_event(
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
set search_path = ''
as $$
declare
  selected_match public.matches%rowtype;
  selected_innings public.match_innings%rowtype;
  existing_event public.match_events%rowtype;
  next_sequence bigint;
  next_innings_id uuid;
  current_scoreboard jsonb;
  result_payload jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  if p_kind not in (
    'INNINGS_CLOSED',
    'INNINGS_STARTED',
    'MATCH_COMPLETED',
    'MATCH_ABANDONED'
  ) then
    raise exception 'Unsupported lifecycle event kind: %', p_kind;
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
    return jsonb_build_object(
      'sequence', existing_event.sequence,
      'duplicate', true,
      'innings_id', existing_event.payload->>'innings_id',
      'status', (select status from public.matches where id = p_match_id)
    );
  end if;

  select * into selected_match
  from public.matches
  where id = p_match_id
  for update;
  if not found then raise exception 'Match not found'; end if;
  if selected_match.current_sequence <> p_expected_sequence then
    raise exception 'Sequence conflict: expected %, current %',
      p_expected_sequence, selected_match.current_sequence
      using errcode = '40001';
  end if;
  if selected_match.status in ('COMPLETED', 'ABANDONED') then
    raise exception 'Match lifecycle is already final';
  end if;

  next_sequence := selected_match.current_sequence + 1;

  if p_kind = 'INNINGS_CLOSED' then
    if selected_match.status <> 'IN_PROGRESS' then
      raise exception 'Only an in-progress innings can be closed';
    end if;
    select * into selected_innings
    from public.match_innings
    where id = (p_payload->>'innings_id')::uuid
      and match_id = p_match_id
    for update;
    if not found then raise exception 'Innings not found'; end if;
    if selected_innings.status = 'COMPLETED' then
      raise exception 'Innings is already closed';
    end if;

    select scoreboard into current_scoreboard
    from public.match_snapshots where match_id = p_match_id;
    current_scoreboard := coalesce(current_scoreboard, '{}'::jsonb);

    update public.match_innings
    set
      status = 'COMPLETED',
      total_runs = coalesce((current_scoreboard->>'total_runs')::integer, 0),
      total_wickets = coalesce((current_scoreboard->>'total_wickets')::integer, 0),
      total_balls = coalesce((current_scoreboard->>'legal_balls')::integer, 0),
      updated_at = now()
    where id = selected_innings.id;

    update public.matches
    set status = 'INNINGS_BREAK', updated_at = now()
    where id = p_match_id;

  elsif p_kind = 'INNINGS_STARTED' then
    if selected_match.status not in ('INNINGS_BREAK', 'FOLLOW_ON_DECISION') then
      raise exception 'Match is not ready for another innings';
    end if;
    if (p_payload->>'sequence')::integer not between 2 and 4 then
      raise exception 'Invalid innings sequence';
    end if;
    if (p_payload->>'batting_team_id')::uuid not in (
      selected_match.team_a_id, selected_match.team_b_id
    ) or (p_payload->>'bowling_team_id')::uuid not in (
      selected_match.team_a_id, selected_match.team_b_id
    ) or p_payload->>'batting_team_id' = p_payload->>'bowling_team_id' then
      raise exception 'Invalid innings teams';
    end if;
    if exists (
      select 1 from public.match_innings
      where match_id = p_match_id and status = 'IN_PROGRESS'
    ) then
      raise exception 'Another innings is already in progress';
    end if;

    next_innings_id := (p_payload->>'innings_id')::uuid;
    insert into public.match_innings (
      id, match_id, sequence, batting_team_id, bowling_team_id,
      status, target, is_follow_on
    ) values (
      next_innings_id,
      p_match_id,
      (p_payload->>'sequence')::integer,
      (p_payload->>'batting_team_id')::uuid,
      (p_payload->>'bowling_team_id')::uuid,
      'IN_PROGRESS',
      nullif(p_payload->>'target', '')::integer,
      coalesce((p_payload->>'is_follow_on')::boolean, false)
    );

    update public.matches
    set status = 'IN_PROGRESS', updated_at = now()
    where id = p_match_id;

    insert into public.match_snapshots (
      match_id, latest_sequence, scoreboard, scorecard, updated_at
    ) values (
      p_match_id,
      next_sequence,
      jsonb_build_object(
        'innings_id', next_innings_id,
        'total_runs', 0,
        'total_wickets', 0,
        'legal_balls', 0,
        'updated_at', now()
      ),
      '{}'::jsonb,
      now()
    )
    on conflict (match_id) do update
    set scoreboard = excluded.scoreboard, updated_at = now();

  elsif p_kind = 'MATCH_COMPLETED' then
    if selected_match.status not in ('INNINGS_BREAK', 'FOLLOW_ON_DECISION') then
      raise exception 'Close the current innings before completing the match';
    end if;
    result_payload := p_payload->'result';
    if result_payload is null or jsonb_typeof(result_payload) <> 'object' then
      raise exception 'A match result is required';
    end if;
    if result_payload ? 'winnerTeamId'
      and (result_payload->>'winnerTeamId')::uuid not in (
        selected_match.team_a_id, selected_match.team_b_id
      ) then
      raise exception 'Result winner must be one of the match teams';
    end if;
    update public.matches
    set status = 'COMPLETED', result = result_payload, updated_at = now()
    where id = p_match_id;

  elsif p_kind = 'MATCH_ABANDONED' then
    update public.match_innings
    set status = 'COMPLETED', updated_at = now()
    where match_id = p_match_id and status = 'IN_PROGRESS';
    update public.matches
    set
      status = 'ABANDONED',
      result = jsonb_build_object('kind', 'NO_RESULT'),
      updated_at = now()
    where id = p_match_id;
  end if;

  insert into public.match_events (
    match_id, client_event_id, sequence, kind, payload, scorer_id
  ) values (
    p_match_id, p_client_event_id, next_sequence, p_kind, p_payload, (select auth.uid())
  );

  update public.match_snapshots
  set latest_sequence = next_sequence, updated_at = now()
  where match_id = p_match_id;

  update public.matches
  set current_sequence = next_sequence
  where id = p_match_id;

  update public.scoring_leases
  set expires_at = now() + interval '2 minutes', updated_at = now()
  where match_id = p_match_id and lease_token = p_lease_token;

  return jsonb_build_object(
    'sequence', next_sequence,
    'duplicate', false,
    'innings_id', coalesce(next_innings_id, (p_payload->>'innings_id')::uuid),
    'status', (select status from public.matches where id = p_match_id)
  );
end;
$$;

revoke all on function app_private.append_match_lifecycle_event(
  uuid, text, bigint, text, public.match_event_kind, jsonb
) from public, anon;
grant execute on function app_private.append_match_lifecycle_event(
  uuid, text, bigint, text, public.match_event_kind, jsonb
) to authenticated;

create or replace function public.append_match_lifecycle_event(
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
set search_path = ''
as $$
  select app_private.append_match_lifecycle_event(
    p_match_id,
    p_client_event_id,
    p_expected_sequence,
    p_lease_token,
    p_kind,
    p_payload
  );
$$;

revoke all on function public.append_match_lifecycle_event(
  uuid, text, bigint, text, public.match_event_kind, jsonb
) from public, anon;
grant execute on function public.append_match_lifecycle_event(
  uuid, text, bigint, text, public.match_event_kind, jsonb
) to authenticated;
