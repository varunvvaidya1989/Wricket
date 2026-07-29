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
set search_path = ''
as $$
declare
  selected_match public.matches%rowtype;
  existing_event public.match_events%rowtype;
  corrected_event public.match_events%rowtype;
  next_sequence bigint;
  current_scoreboard jsonb;
  next_scoreboard jsonb;
  runs_delta integer := 0;
  wickets_delta integer := 0;
  legal_balls_delta integer := 0;
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
  elsif p_kind = 'SCORE_ADJUSTED' then
    runs_delta := coalesce((p_payload->>'runs')::integer, 0);
    if runs_delta <= 0 then raise exception 'Score adjustment runs must be positive'; end if;
  elsif p_kind = 'BATTER_RETIRED' then
    if coalesce(p_payload->>'retirement_kind', '') not in ('RETIRED_HURT', 'RETIRED_OUT') then
      raise exception 'Unsupported retirement kind';
    end if;
    wickets_delta := case when p_payload->>'retirement_kind' = 'RETIRED_OUT' then 1 else 0 end;
  elsif p_kind = 'BALL_CORRECTED' then
    select * into corrected_event
    from public.match_events
    where match_id = p_match_id
      and client_event_id = p_payload->>'target_client_event_id'
      and kind = 'BALL_RECORDED';
    if not found then raise exception 'Original ball event not found'; end if;
    if exists (
      select 1 from public.match_events
      where match_id = p_match_id
        and kind = 'BALL_CORRECTED'
        and payload->>'target_client_event_id' = p_payload->>'target_client_event_id'
    ) then
      raise exception 'Ball event has already been corrected';
    end if;
    runs_delta := -(
      coalesce((corrected_event.payload->>'runs_bat')::integer, 0)
      + coalesce((corrected_event.payload->>'runs_extra')::integer, 0)
    );
    wickets_delta := case
      when coalesce((corrected_event.payload->>'is_wicket')::boolean, false) then -1 else 0 end;
    legal_balls_delta := case
      when coalesce((corrected_event.payload->>'is_legal')::boolean, false) then -1 else 0 end;
  else
    raise exception 'Unsupported scoring event kind: %', p_kind;
  end if;

  if coalesce((current_scoreboard->>'total_runs')::integer, 0) + runs_delta < 0
    or coalesce((current_scoreboard->>'total_wickets')::integer, 0) + wickets_delta < 0
    or coalesce((current_scoreboard->>'legal_balls')::integer, 0) + legal_balls_delta < 0 then
    raise exception 'Scoring event would produce a negative total';
  end if;

  next_scoreboard := jsonb_build_object(
    'innings_id', coalesce(p_payload->>'innings_id', current_scoreboard->>'innings_id'),
    'total_runs', coalesce((current_scoreboard->>'total_runs')::integer, 0) + runs_delta,
    'total_wickets', coalesce((current_scoreboard->>'total_wickets')::integer, 0) + wickets_delta,
    'legal_balls', coalesce((current_scoreboard->>'legal_balls')::integer, 0) + legal_balls_delta,
    'last_event', jsonb_build_object('kind', p_kind, 'payload', p_payload),
    'updated_at', now()
  );

  insert into public.match_events(
    match_id, client_event_id, sequence, kind, payload, scorer_id
  ) values (
    p_match_id, p_client_event_id, next_sequence, p_kind, p_payload, (select auth.uid())
  );

  insert into public.match_snapshots(
    match_id, latest_sequence, scoreboard, scorecard, updated_at
  ) values (p_match_id, next_sequence, next_scoreboard, '{}'::jsonb, now())
  on conflict (match_id) do update
  set latest_sequence = excluded.latest_sequence,
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

revoke all on function app_private.append_match_event(
  uuid, text, bigint, text, public.match_event_kind, jsonb
) from public, anon;
grant execute on function app_private.append_match_event(
  uuid, text, bigint, text, public.match_event_kind, jsonb
) to authenticated;
