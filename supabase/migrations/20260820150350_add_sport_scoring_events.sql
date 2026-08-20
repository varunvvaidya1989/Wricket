-- Phase 5: authoritative append-only scoring for non-cricket fixtures and rubbers.

create table public.sport_scoring_matches (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  competition_id uuid references public.sport_competitions(id) on delete cascade,
  fixture_id uuid references public.sport_fixtures(id) on delete cascade,
  fixture_match_id uuid unique references public.sport_fixture_matches(id) on delete cascade,
  entrant_a_id uuid references public.sport_competition_entries(id) on delete restrict,
  entrant_b_id uuid references public.sport_competition_entries(id) on delete restrict,
  match_format text not null check (match_format in ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES')),
  side_a_players jsonb not null check (jsonb_typeof(side_a_players) = 'array' and jsonb_array_length(side_a_players) between 1 and 2),
  side_b_players jsonb not null check (jsonb_typeof(side_b_players) = 'array' and jsonb_array_length(side_b_players) between 1 and 2),
  rules_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(rules_snapshot) = 'object'),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'LIVE', 'COMPLETED', 'ABANDONED')),
  current_sequence integer not null default 0 check (current_sequence >= 0),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((fixture_id is null) = (competition_id is null) or fixture_id is not null)
);

create table public.sport_scoring_events (
  id uuid primary key default gen_random_uuid(),
  scoring_match_id uuid not null references public.sport_scoring_matches(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  client_event_id uuid not null,
  kind text not null check (kind in ('POINT', 'SERVICE_CHANGED', 'END_CHANGED', 'OPTION_SET', 'RETIREMENT', 'WALKOVER', 'ABANDONED', 'CORRECTION', 'UNDO', 'COMPLETED')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  reverses_client_event_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (scoring_match_id, sequence),
  unique (scoring_match_id, client_event_id)
);

create table public.sport_scoring_leases (
  scoring_match_id uuid primary key references public.sport_scoring_matches(id) on delete cascade,
  device_id text not null check (length(trim(device_id)) between 8 and 160),
  lease_token uuid not null default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.sport_fixture_results (
  fixture_id uuid primary key references public.sport_fixtures(id) on delete cascade,
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  winner_entry_id uuid references public.sport_competition_entries(id) on delete restrict,
  scoring_match_id uuid unique references public.sport_scoring_matches(id) on delete restrict,
  completed_at timestamptz not null default now(),
  foreign key (fixture_id, competition_id) references public.sport_fixtures(id, competition_id) on delete cascade
);

alter table public.sport_scoring_matches enable row level security;
alter table public.sport_scoring_events enable row level security;
alter table public.sport_scoring_leases enable row level security;
alter table public.sport_fixture_results enable row level security;
create policy "sport_scoring_matches_read_authorized" on public.sport_scoring_matches for select to authenticated
  using (competition_id is null or (select app_private.can_read_sport_competition(competition_id)));
create policy "sport_scoring_events_read_authorized" on public.sport_scoring_events for select to authenticated
  using (exists (select 1 from public.sport_scoring_matches match where match.id = scoring_match_id and (match.competition_id is null or app_private.can_read_sport_competition(match.competition_id))));
create policy "sport_fixture_results_read_authorized" on public.sport_fixture_results for select to authenticated
  using ((select app_private.can_read_sport_competition(competition_id)));
revoke all on public.sport_scoring_matches, public.sport_scoring_events, public.sport_scoring_leases, public.sport_fixture_results from public, anon, authenticated;
grant select on public.sport_scoring_matches, public.sport_scoring_events, public.sport_fixture_results to authenticated;

create or replace function app_private.can_score_sport_scoring_match(p_scoring_match_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.sport_scoring_matches match where match.id = p_scoring_match_id and (
    match.competition_id is not null and app_private.can_manage_sport_competition(match.competition_id)
    or match.fixture_id is not null and exists (select 1 from public.sport_fixture_officials official where official.fixture_id = match.fixture_id and official.account_id = (select auth.uid()))
  ))
$$;

create or replace function app_private.create_sport_scoring_match(
  p_fixture_id uuid, p_fixture_match_id uuid, p_match_format text, p_side_a_players jsonb, p_side_b_players jsonb, p_rules_snapshot jsonb
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare fixture public.sport_fixtures%rowtype;
declare rubber public.sport_fixture_matches%rowtype;
declare competition public.sport_competitions%rowtype;
declare match_id_value uuid;
begin
  select * into fixture from public.sport_fixtures where id = p_fixture_id;
  if not found then raise exception 'Fixture was not found'; end if;
  select * into competition from public.sport_competitions where id = fixture.competition_id;
  if not app_private.can_manage_sport_competition(competition.id) and not exists (select 1 from public.sport_fixture_officials official where official.fixture_id = fixture.id and official.account_id = (select auth.uid())) then raise exception 'Only an assigned official or competition manager can prepare scoring'; end if;
  if p_fixture_match_id is not null then
    select * into rubber from public.sport_fixture_matches where id = p_fixture_match_id and fixture_id = fixture.id;
    if not found then raise exception 'Team-tie rubber was not found'; end if;
    if not exists (select 1 from public.sport_fixture_match_lineups where fixture_match_id = rubber.id and entry_id = fixture.entrant_a_id and status = 'LOCKED') or not exists (select 1 from public.sport_fixture_match_lineups where fixture_match_id = rubber.id and entry_id = fixture.entrant_b_id and status = 'LOCKED') then raise exception 'Locked lineups are required before scoring a team-tie rubber'; end if;
    p_match_format := rubber.match_format;
  end if;
  if upper(trim(p_match_format)) not in ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES') or jsonb_typeof(p_side_a_players) <> 'array' or jsonb_typeof(p_side_b_players) <> 'array' or jsonb_typeof(p_rules_snapshot) <> 'object' then raise exception 'Invalid sport scoring match setup'; end if;
  if jsonb_array_length(p_side_a_players) <> (case when upper(trim(p_match_format)) = 'SINGLES' then 1 else 2 end) or jsonb_array_length(p_side_b_players) <> (case when upper(trim(p_match_format)) = 'SINGLES' then 1 else 2 end) then raise exception 'Scoring sides must match the selected singles or doubles format'; end if;
  insert into public.sport_scoring_matches(sport_id, competition_id, fixture_id, fixture_match_id, entrant_a_id, entrant_b_id, match_format, side_a_players, side_b_players, rules_snapshot, created_by)
  values (competition.sport_id, competition.id, fixture.id, rubber.id, fixture.entrant_a_id, fixture.entrant_b_id, upper(trim(p_match_format)), p_side_a_players, p_side_b_players, p_rules_snapshot, (select auth.uid())) returning id into match_id_value;
  perform app_private.write_sport_audit(competition.sport_id, 'FIXTURE', fixture.id, 'SPORT_SCORING_PREPARED', jsonb_build_object('scoring_match_id', match_id_value, 'fixture_match_id', p_fixture_match_id));
  return match_id_value;
end;
$$;

create or replace function app_private.acquire_sport_scoring_lease(p_scoring_match_id uuid, p_device_id text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare lease public.sport_scoring_leases%rowtype;
begin
  if not app_private.can_score_sport_scoring_match(p_scoring_match_id) then raise exception 'Only an assigned official or competition manager can score this match'; end if;
  select * into lease from public.sport_scoring_leases where scoring_match_id = p_scoring_match_id for update;
  if found and lease.expires_at > now() and (lease.account_id <> (select auth.uid()) or lease.device_id <> trim(p_device_id)) then raise exception 'Another scoring device currently holds this match'; end if;
  insert into public.sport_scoring_leases(scoring_match_id, device_id, account_id, expires_at) values (p_scoring_match_id, trim(p_device_id), (select auth.uid()), now() + interval '10 minutes') on conflict (scoring_match_id) do update set device_id = excluded.device_id, account_id = excluded.account_id, lease_token = gen_random_uuid(), expires_at = excluded.expires_at, updated_at = now() returning * into lease;
  update public.sport_scoring_matches set status = case when status = 'SCHEDULED' then 'LIVE' else status end, updated_at = now() where id = p_scoring_match_id;
  return jsonb_build_object('lease_token', lease.lease_token, 'expires_at', lease.expires_at);
end;
$$;

create or replace function app_private.append_sport_scoring_event(
  p_scoring_match_id uuid, p_client_event_id uuid, p_expected_sequence integer, p_lease_token uuid, p_kind text, p_payload jsonb, p_reverses_client_event_id uuid default null
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
  if not found or not app_private.can_score_sport_scoring_match(p_scoring_match_id) then raise exception 'Only an assigned official or competition manager can score this match'; end if;
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
  if upper(trim(p_kind)) = 'COMPLETED' then
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

create or replace function public.create_sport_scoring_match(p_fixture_id uuid, p_fixture_match_id uuid, p_match_format text, p_side_a_players jsonb, p_side_b_players jsonb, p_rules_snapshot jsonb)
returns uuid language sql security definer set search_path = public
as $$ select app_private.create_sport_scoring_match(p_fixture_id, p_fixture_match_id, p_match_format, p_side_a_players, p_side_b_players, p_rules_snapshot) $$;
create or replace function public.acquire_sport_scoring_lease(p_scoring_match_id uuid, p_device_id text)
returns jsonb language sql security definer set search_path = public
as $$ select app_private.acquire_sport_scoring_lease(p_scoring_match_id, p_device_id) $$;
create or replace function public.append_sport_scoring_event(p_scoring_match_id uuid, p_client_event_id uuid, p_expected_sequence integer, p_lease_token uuid, p_kind text, p_payload jsonb, p_reverses_client_event_id uuid default null)
returns jsonb language sql security definer set search_path = public
as $$ select app_private.append_sport_scoring_event(p_scoring_match_id, p_client_event_id, p_expected_sequence, p_lease_token, p_kind, p_payload, p_reverses_client_event_id) $$;
revoke all on function app_private.can_score_sport_scoring_match(uuid), app_private.create_sport_scoring_match(uuid, uuid, text, jsonb, jsonb, jsonb), app_private.acquire_sport_scoring_lease(uuid, text), app_private.append_sport_scoring_event(uuid, uuid, integer, uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.create_sport_scoring_match(uuid, uuid, text, jsonb, jsonb, jsonb), public.acquire_sport_scoring_lease(uuid, text), public.append_sport_scoring_event(uuid, uuid, integer, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.create_sport_scoring_match(uuid, uuid, text, jsonb, jsonb, jsonb), public.acquire_sport_scoring_lease(uuid, text), public.append_sport_scoring_event(uuid, uuid, integer, uuid, text, jsonb, uuid) to authenticated;
