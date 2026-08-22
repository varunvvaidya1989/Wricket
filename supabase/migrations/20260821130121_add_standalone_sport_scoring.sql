-- Allow the same append-only scoring protocol to power standalone sport matches.
-- Tournament scoring remains governed by its existing manager/official checks.
create or replace function app_private.can_score_sport_scoring_match(p_scoring_match_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.sport_scoring_matches match
    where match.id = p_scoring_match_id
      and (
        (match.competition_id is not null and app_private.can_manage_sport_competition(match.competition_id))
        or (match.fixture_id is not null and exists (
          select 1
          from public.sport_fixture_officials official
          where official.fixture_id = match.fixture_id
            and official.account_id = (select auth.uid())
        ))
        or (match.competition_id is null and match.fixture_id is null and match.created_by = (select auth.uid()))
      )
  )
$$;

create or replace function app_private.create_standalone_sport_scoring_match(
  p_sport_code text,
  p_match_format text,
  p_side_a_players jsonb,
  p_side_b_players jsonb,
  p_rules_snapshot jsonb
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare selected_sport public.sports%rowtype;
declare match_id_value uuid;
declare normalized_format text := upper(trim(p_match_format));
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;

  select * into selected_sport
  from public.sports sport
  where sport.code = upper(trim(p_sport_code));
  if not found then raise exception 'Sport was not found'; end if;

  if not exists (
    select 1
    from public.account_sports account_sport
    where account_sport.account_id = (select auth.uid())
      and account_sport.sport_id = selected_sport.id
      and account_sport.access_status = 'ACTIVE'
  ) then raise exception 'This sport is not available to your account'; end if;

  if normalized_format not in ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES')
    or jsonb_typeof(p_side_a_players) <> 'array'
    or jsonb_typeof(p_side_b_players) <> 'array'
    or jsonb_typeof(p_rules_snapshot) <> 'object' then
    raise exception 'Invalid sport scoring match setup';
  end if;

  if jsonb_array_length(p_side_a_players) <> (case when normalized_format = 'SINGLES' then 1 else 2 end)
    or jsonb_array_length(p_side_b_players) <> (case when normalized_format = 'SINGLES' then 1 else 2 end) then
    raise exception 'Scoring sides must match the selected singles or doubles format';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_side_a_players || p_side_b_players) player
    where jsonb_typeof(player) <> 'string'
      or length(trim(player #>> '{}')) not between 1 and 40
  ) then raise exception 'Each scoring player must have a name between 1 and 40 characters'; end if;

  insert into public.sport_scoring_matches(
    sport_id, match_format, side_a_players, side_b_players, rules_snapshot, created_by
  ) values (
    selected_sport.id,
    normalized_format,
    p_side_a_players,
    p_side_b_players,
    p_rules_snapshot,
    (select auth.uid())
  ) returning id into match_id_value;

  return match_id_value;
end;
$$;

create or replace function app_private.append_sport_scoring_event(
  p_scoring_match_id uuid,
  p_client_event_id uuid,
  p_expected_sequence integer,
  p_lease_token uuid,
  p_kind text,
  p_payload jsonb,
  p_reverses_client_event_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare match public.sport_scoring_matches%rowtype;
declare lease public.sport_scoring_leases%rowtype;
declare existing public.sport_scoring_events%rowtype;
declare next_sequence integer;
declare winner_id uuid;
begin
  select * into existing from public.sport_scoring_events where scoring_match_id = p_scoring_match_id and client_event_id = p_client_event_id;
  if found then return jsonb_build_object('duplicate', true, 'sequence', existing.sequence); end if;
  select * into match from public.sport_scoring_matches where id = p_scoring_match_id for update;
  if not found or not app_private.can_score_sport_scoring_match(p_scoring_match_id) then raise exception 'Only an assigned official, competition manager, or standalone match creator can score this match'; end if;
  select * into lease from public.sport_scoring_leases where scoring_match_id = match.id for update;
  if not found or lease.lease_token <> p_lease_token or lease.account_id <> (select auth.uid()) or lease.expires_at <= now() then raise exception 'Scoring lease expired or belongs to another device'; end if;
  if match.current_sequence <> p_expected_sequence then raise exception 'Score changed; reconcile before submitting more events'; end if;
  if match.status in ('COMPLETED', 'ABANDONED') then raise exception 'Completed or abandoned matches cannot receive new scoring events'; end if;
  if upper(trim(p_kind)) not in ('POINT', 'SERVICE_CHANGED', 'END_CHANGED', 'OPTION_SET', 'RETIREMENT', 'WALKOVER', 'ABANDONED', 'CORRECTION', 'UNDO', 'COMPLETED') or jsonb_typeof(p_payload) <> 'object' then raise exception 'Unsupported scoring event'; end if;
  if p_reverses_client_event_id is not null and not exists (select 1 from public.sport_scoring_events where scoring_match_id = match.id and client_event_id = p_reverses_client_event_id) then raise exception 'Correction references an unknown scoring event'; end if;
  next_sequence := match.current_sequence + 1;
  insert into public.sport_scoring_events(scoring_match_id, sequence, client_event_id, kind, payload, reverses_client_event_id, created_by) values (match.id, next_sequence, p_client_event_id, upper(trim(p_kind)), p_payload, p_reverses_client_event_id, (select auth.uid()));
  update public.sport_scoring_leases set expires_at = now() + interval '10 minutes', updated_at = now() where scoring_match_id = match.id;
  update public.sport_scoring_matches set current_sequence = next_sequence, status = case when upper(trim(p_kind)) = 'COMPLETED' then 'COMPLETED' when upper(trim(p_kind)) = 'ABANDONED' then 'ABANDONED' else status end, completed_at = case when upper(trim(p_kind)) = 'COMPLETED' then now() else completed_at end, completed_by = case when upper(trim(p_kind)) = 'COMPLETED' then (select auth.uid()) else completed_by end, updated_at = now() where id = match.id;
  if upper(trim(p_kind)) = 'COMPLETED' and match.fixture_id is not null then
    winner_id := nullif(p_payload->>'winner_entry_id', '')::uuid;
    if winner_id not in (match.entrant_a_id, match.entrant_b_id) then raise exception 'Completion must name a fixture entrant as winner'; end if;
    if match.fixture_match_id is not null then
      if exists (select 1 from public.sport_fixture_match_results where fixture_match_id = match.fixture_match_id and status = 'COMPLETED') then raise exception 'This rubber result was already propagated'; end if;
      perform app_private.record_sport_team_tie_rubber_result(match.fixture_match_id, winner_id, 'Authoritative scoring completion');
    else
      insert into public.sport_fixture_results(fixture_id, competition_id, winner_entry_id, scoring_match_id) values (match.fixture_id, match.competition_id, winner_id, match.id) on conflict (fixture_id) do nothing;
    end if;
  end if;
  return jsonb_build_object('duplicate', false, 'sequence', next_sequence);
end;
$$;

create or replace function public.create_standalone_sport_scoring_match(
  p_sport_code text,
  p_match_format text,
  p_side_a_players jsonb,
  p_side_b_players jsonb,
  p_rules_snapshot jsonb
)
returns uuid language sql security invoker set search_path = public
as $$
  select app_private.create_standalone_sport_scoring_match(
    p_sport_code,
    p_match_format,
    p_side_a_players,
    p_side_b_players,
    p_rules_snapshot
  )
$$;

create or replace function public.append_sport_scoring_event(
  p_scoring_match_id uuid,
  p_client_event_id uuid,
  p_expected_sequence integer,
  p_lease_token uuid,
  p_kind text,
  p_payload jsonb,
  p_reverses_client_event_id uuid default null
)
returns jsonb language sql security invoker set search_path = public
as $$
  select app_private.append_sport_scoring_event(
    p_scoring_match_id,
    p_client_event_id,
    p_expected_sequence,
    p_lease_token,
    p_kind,
    p_payload,
    p_reverses_client_event_id
  )
$$;

revoke all on function app_private.create_standalone_sport_scoring_match(text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_standalone_sport_scoring_match(text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_standalone_sport_scoring_match(text, text, jsonb, jsonb, jsonb) to authenticated;
