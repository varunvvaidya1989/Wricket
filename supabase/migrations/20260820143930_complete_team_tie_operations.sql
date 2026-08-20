-- Phase 4 completion: templates, restricted lineup visibility, controlled
-- overrides, immutable starts, and majority-based team-tie progression.

alter table public.sport_audit_events
  drop constraint sport_audit_events_resource_type_check,
  add constraint sport_audit_events_resource_type_check
    check (resource_type in ('CLUB', 'TEAM', 'COMPETITION', 'ENTRY', 'FIXTURE', 'LINEUP'));

alter table public.sport_competition_team_tie_rules
  add column lineup_submission_deadline timestamptz,
  add column lineup_reveal_policy text not null default 'AFTER_BOTH_SUBMITTED'
    check (lineup_reveal_policy in ('IMMEDIATE', 'AFTER_BOTH_SUBMITTED', 'AT_DEADLINE')),
  add column require_lineup_approval boolean not null default false;

alter table public.sport_fixture_match_lineups
  add column status text not null default 'APPROVED'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'LOCKED')),
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_reason text,
  add column locked_at timestamptz,
  add column locked_snapshot jsonb check (locked_snapshot is null or jsonb_typeof(locked_snapshot) = 'object'),
  add column overridden_by uuid references public.profiles(id) on delete set null,
  add column override_reason text;

update public.sport_fixture_match_lineups
set reviewed_by = coalesce(reviewed_by, submitted_by), reviewed_at = coalesce(reviewed_at, submitted_at)
where status = 'APPROVED' and reviewed_at is null;

alter table public.sport_fixture_match_lineups
  add constraint sport_fixture_match_lineups_review_check check (
    (status not in ('APPROVED', 'REJECTED', 'LOCKED')) or reviewed_at is not null
  );

create table public.sport_team_tie_templates (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  rubbers jsonb not null check (jsonb_typeof(rubbers) = 'array' and jsonb_array_length(rubbers) > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, name)
);

create table public.sport_fixture_match_rules (
  fixture_match_id uuid primary key references public.sport_fixture_matches(id) on delete cascade,
  required_eligibility jsonb not null default '[]'::jsonb
    check (jsonb_typeof(required_eligibility) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sport_team_tie_states (
  fixture_id uuid primary key references public.sport_fixtures(id) on delete cascade,
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED', 'IN_PROGRESS', 'CLINCHED', 'COMPLETED')),
  started_at timestamptz,
  clinched_at timestamptz,
  winner_entry_id uuid references public.sport_competition_entries(id) on delete restrict,
  updated_at timestamptz not null default now(),
  foreign key (fixture_id, competition_id) references public.sport_fixtures(id, competition_id) on delete cascade
);

create table public.sport_fixture_match_results (
  fixture_match_id uuid primary key references public.sport_fixture_matches(id) on delete cascade,
  fixture_id uuid not null references public.sport_fixtures(id) on delete cascade,
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  winner_entry_id uuid references public.sport_competition_entries(id) on delete restrict,
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'VOID')),
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz,
  reason text,
  foreign key (fixture_id, competition_id) references public.sport_fixtures(id, competition_id) on delete cascade,
  check ((status = 'COMPLETED') = (winner_entry_id is not null))
);

create index sport_fixture_match_results_fixture_idx on public.sport_fixture_match_results(fixture_id, status);

alter table public.sport_team_tie_templates enable row level security;
alter table public.sport_fixture_match_rules enable row level security;
alter table public.sport_team_tie_states enable row level security;
alter table public.sport_fixture_match_results enable row level security;

create policy "sport_team_tie_templates_read_authorized" on public.sport_team_tie_templates for select to authenticated
  using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_fixture_match_rules_read_authorized" on public.sport_fixture_match_rules for select to authenticated
  using (exists (select 1 from public.sport_fixture_matches item where item.id = fixture_match_id and app_private.can_read_sport_competition(item.competition_id)));
create policy "sport_team_tie_states_read_authorized" on public.sport_team_tie_states for select to authenticated
  using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_fixture_match_results_read_authorized" on public.sport_fixture_match_results for select to authenticated
  using ((select app_private.can_read_sport_competition(competition_id)));
revoke all on public.sport_team_tie_templates, public.sport_fixture_match_rules,
  public.sport_team_tie_states, public.sport_fixture_match_results from public, anon, authenticated;
grant select on public.sport_team_tie_templates, public.sport_fixture_match_rules,
  public.sport_team_tie_states, public.sport_fixture_match_results to authenticated;

create or replace function app_private.can_control_sport_team_tie(p_fixture_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.sport_fixtures fixture
    where fixture.id = p_fixture_id and (
      app_private.can_manage_sport_competition(fixture.competition_id)
      or exists (
        select 1 from public.sport_fixture_officials official
        where official.fixture_id = fixture.id and official.account_id = (select auth.uid())
      )
    )
  )
$$;

create or replace function app_private.write_sport_team_tie_matches(p_fixture_id uuid, p_matches jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare selected_fixture public.sport_fixtures%rowtype;
begin
  select * into selected_fixture from public.sport_fixtures where id = p_fixture_id;
  if not found then raise exception 'Team tie was not found'; end if;
  if jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) < 1 then
    raise exception 'A team tie must contain at least one match';
  end if;
  if exists (select 1 from jsonb_array_elements(p_matches) item where
    upper(trim(coalesce(item->>'format', ''))) not in ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES')
    or length(trim(coalesce(item->>'label', ''))) > 80
    or (item ? 'eligibility' and jsonb_typeof(item->'eligibility') <> 'array')) then
    raise exception 'Every team-tie match needs a supported format, label, and optional eligibility array';
  end if;
  delete from public.sport_fixture_matches where fixture_id = selected_fixture.id;
  insert into public.sport_fixture_matches(competition_id, fixture_id, display_order, match_format, label)
  select selected_fixture.competition_id, selected_fixture.id, (item.ordinality - 1)::integer,
    upper(trim(item.value->>'format')), coalesce(nullif(trim(item.value->>'label'), ''), 'Match ' || item.ordinality)
  from jsonb_array_elements(p_matches) with ordinality item(value, ordinality);
  insert into public.sport_fixture_match_rules(fixture_match_id, required_eligibility)
  select match.id, coalesce(item.value->'eligibility', '[]'::jsonb)
  from jsonb_array_elements(p_matches) with ordinality item(value, ordinality)
  join public.sport_fixture_matches match on match.fixture_id = selected_fixture.id
    and match.display_order = item.ordinality - 1;
end;
$$;

create or replace function app_private.upsert_sport_team_tie_lineup(
  p_fixture_match_id uuid, p_entry_id uuid, p_player_profile_ids uuid[], p_expected_version integer,
  p_override boolean default false, p_reason text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare selected_match public.sport_fixture_matches%rowtype;
declare selected_fixture public.sport_fixtures%rowtype;
declare selected_competition public.sport_competitions%rowtype;
declare selected_squad public.sport_tournament_squads%rowtype;
declare selected_rules public.sport_competition_team_tie_rules%rowtype;
declare lineup_id_value uuid;
declare current_version integer;
declare player_profile_id uuid;
declare required_players integer;
declare new_status text;
begin
  select match.* into selected_match from public.sport_fixture_matches match where match.id = p_fixture_match_id;
  if not found then raise exception 'Team-tie match was not found'; end if;
  select * into selected_fixture from public.sport_fixtures where id = selected_match.fixture_id for update;
  select * into selected_competition from public.sport_competitions where id = selected_match.competition_id and kind = 'TOURNAMENT';
  if not found or selected_fixture.status = 'CANCELLED' then raise exception 'This team tie cannot receive lineups'; end if;
  select * into selected_squad from public.sport_tournament_squads where entry_id = p_entry_id and competition_id = selected_competition.id;
  if not found or p_entry_id not in (selected_fixture.entrant_a_id, selected_fixture.entrant_b_id) then raise exception 'Choose one of this team tie''s squad entrants'; end if;
  if selected_squad.roster_locked_at is null then raise exception 'The squad roster must be locked before lineup submission'; end if;
  select * into selected_rules from public.sport_competition_team_tie_rules where competition_id = selected_competition.id;
  if not found then raise exception 'Team-tie rules were not found'; end if;
  if not p_override and selected_squad.captain_account_id <> (select auth.uid()) then raise exception 'Only the registered squad captain can submit this lineup'; end if;
  if p_override and (not app_private.can_control_sport_team_tie(selected_fixture.id) or nullif(trim(p_reason), '') is null) then raise exception 'An owner or official override requires an audit reason'; end if;
  if not p_override and selected_rules.lineup_submission_deadline is not null and now() > selected_rules.lineup_submission_deadline then raise exception 'The lineup submission deadline has passed'; end if;
  required_players := case when selected_match.match_format = 'SINGLES' then 1 else 2 end;
  if coalesce(cardinality(p_player_profile_ids), 0) <> required_players or cardinality(p_player_profile_ids) <> (select count(distinct id) from unnest(p_player_profile_ids) id) then
    raise exception 'This % lineup requires exactly % distinct player(s)', lower(selected_match.match_format), required_players;
  end if;
  if exists (select 1 from unnest(p_player_profile_ids) requested(id) where not exists (
    select 1 from public.sport_squad_members member
    left join public.sport_fixture_match_rules rule on rule.fixture_match_id = selected_match.id
    where member.squad_entry_id = selected_squad.entry_id and member.sport_profile_id = requested.id
      and member.status = 'APPROVED' and member.eligibility @> coalesce(rule.required_eligibility, '[]'::jsonb)
  )) then raise exception 'Every lineup player must be an eligible member of the locked approved squad'; end if;
  select id, version into lineup_id_value, current_version from public.sport_fixture_match_lineups
    where fixture_match_id = selected_match.id and entry_id = p_entry_id for update;
  if lineup_id_value is null and p_expected_version <> 0 then raise exception 'Lineup version is out of date'; end if;
  if lineup_id_value is not null and (current_version <> p_expected_version or exists (select 1 from public.sport_fixture_match_lineups where id = lineup_id_value and status = 'LOCKED')) then raise exception 'Lineup is locked or version is out of date'; end if;
  foreach player_profile_id in array p_player_profile_ids loop
    if (select count(*) from public.sport_fixture_match_lineup_players player join public.sport_fixture_match_lineups lineup on lineup.id = player.lineup_id where lineup.fixture_id = selected_fixture.id and lineup.entry_id = p_entry_id and player.sport_profile_id = player_profile_id and lineup.id <> coalesce(lineup_id_value, '00000000-0000-0000-0000-000000000000'::uuid)) >= selected_rules.max_rubbers_per_player then raise exception 'A player cannot contest more than % rubbers in this team tie', selected_rules.max_rubbers_per_player; end if;
    if not selected_rules.allow_singles_and_doubles and exists (select 1 from public.sport_fixture_match_lineup_players player join public.sport_fixture_match_lineups lineup on lineup.id = player.lineup_id join public.sport_fixture_matches other_match on other_match.id = lineup.fixture_match_id where lineup.fixture_id = selected_fixture.id and lineup.entry_id = p_entry_id and player.sport_profile_id = player_profile_id and other_match.match_format <> selected_match.match_format and lineup.id <> coalesce(lineup_id_value, '00000000-0000-0000-0000-000000000000'::uuid)) then raise exception 'A player cannot be selected for both singles and doubles in this team tie'; end if;
    if selected_fixture.scheduled_at is not null and exists (select 1 from public.sport_fixture_match_lineup_players player join public.sport_fixture_match_lineups lineup on lineup.id = player.lineup_id join public.sport_fixtures other_fixture on other_fixture.id = lineup.fixture_id where player.sport_profile_id = player_profile_id and other_fixture.id <> selected_fixture.id and other_fixture.status = 'SCHEDULED' and other_fixture.scheduled_at is not null and tstzrange(other_fixture.scheduled_at, other_fixture.scheduled_at + make_interval(mins => coalesce(other_fixture.duration_minutes, 60)), '[)') && tstzrange(selected_fixture.scheduled_at, selected_fixture.scheduled_at + make_interval(mins => coalesce(selected_fixture.duration_minutes, 60)), '[)')) then raise exception 'A lineup player has a schedule conflict'; end if;
  end loop;
  new_status := case when p_override or not selected_rules.require_lineup_approval then 'APPROVED' else 'PENDING' end;
  if lineup_id_value is null then
    insert into public.sport_fixture_match_lineups(competition_id, fixture_id, fixture_match_id, entry_id, submitted_by, status, reviewed_by, reviewed_at, override_reason, overridden_by, snapshot)
    values (selected_competition.id, selected_fixture.id, selected_match.id, p_entry_id, (select auth.uid()), new_status,
      case when new_status = 'APPROVED' then (select auth.uid()) end, case when new_status = 'APPROVED' then now() end,
      case when p_override then trim(p_reason) end, case when p_override then (select auth.uid()) end,
      jsonb_build_object('format', selected_match.match_format, 'submitted_at', now())) returning id into lineup_id_value;
  else
    update public.sport_fixture_match_lineups set submitted_by = (select auth.uid()), submitted_at = now(), version = version + 1, status = new_status,
      reviewed_by = case when new_status = 'APPROVED' then (select auth.uid()) else null end, reviewed_at = case when new_status = 'APPROVED' then now() else null end,
      review_reason = null, overridden_by = case when p_override then (select auth.uid()) else null end, override_reason = case when p_override then trim(p_reason) else null end,
      snapshot = jsonb_build_object('format', selected_match.match_format, 'submitted_at', now()) where id = lineup_id_value;
    delete from public.sport_fixture_match_lineup_players where lineup_id = lineup_id_value;
  end if;
  insert into public.sport_fixture_match_lineup_players(lineup_id, sport_profile_id, display_order, display_name_snapshot)
  select lineup_id_value, requested.id, requested.ordinality - 1, profile.display_name from unnest(p_player_profile_ids) with ordinality requested(id, ordinality) join public.sport_profiles profile on profile.id = requested.id;
  perform app_private.write_sport_audit(selected_competition.sport_id, 'LINEUP', lineup_id_value, case when p_override then 'TEAM_TIE_LINEUP_OVERRIDDEN' else 'TEAM_TIE_LINEUP_SUBMITTED' end, jsonb_build_object('fixture_match_id', selected_match.id, 'entry_id', p_entry_id, 'reason', p_reason));
  return lineup_id_value;
end;
$$;

create or replace function app_private.submit_sport_team_tie_lineup(p_fixture_match_id uuid, p_entry_id uuid, p_player_profile_ids uuid[], p_expected_version integer)
returns uuid language sql security definer set search_path = public
as $$ select app_private.upsert_sport_team_tie_lineup(p_fixture_match_id, p_entry_id, p_player_profile_ids, p_expected_version, false, null) $$;

create or replace function app_private.review_sport_team_tie_lineup(p_lineup_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare lineup public.sport_fixture_match_lineups%rowtype;
declare competition public.sport_competitions%rowtype;
begin
  select * into lineup from public.sport_fixture_match_lineups where id = p_lineup_id for update;
  if not found or not app_private.can_control_sport_team_tie(lineup.fixture_id) then raise exception 'Only an assigned official or competition manager can review this lineup'; end if;
  if lineup.status = 'LOCKED' then raise exception 'Locked lineups cannot be reviewed'; end if;
  if not p_approve and nullif(trim(p_reason), '') is null then raise exception 'A rejection reason is required'; end if;
  update public.sport_fixture_match_lineups set status = case when p_approve then 'APPROVED' else 'REJECTED' end, reviewed_by = (select auth.uid()), reviewed_at = now(), review_reason = case when p_approve then null else trim(p_reason) end where id = lineup.id;
  select * into competition from public.sport_competitions where id = lineup.competition_id;
  perform app_private.write_sport_audit(competition.sport_id, 'LINEUP', lineup.id, case when p_approve then 'TEAM_TIE_LINEUP_APPROVED' else 'TEAM_TIE_LINEUP_REJECTED' end, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function app_private.start_sport_team_tie(p_fixture_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare fixture public.sport_fixtures%rowtype;
declare competition public.sport_competitions%rowtype;
begin
  select * into fixture from public.sport_fixtures where id = p_fixture_id for update;
  if not found or not app_private.can_control_sport_team_tie(p_fixture_id) then raise exception 'Only an assigned official or competition manager can start this team tie'; end if;
  select * into competition from public.sport_competitions where id = fixture.competition_id;
  if competition.lifecycle not in ('PUBLISHED', 'LIVE') or fixture.status = 'CANCELLED' then raise exception 'This team tie cannot be started'; end if;
  if exists (select 1 from public.sport_fixture_matches match where match.fixture_id = fixture.id and (select count(*) from public.sport_fixture_match_lineups lineup where lineup.fixture_match_id = match.id and lineup.entry_id in (fixture.entrant_a_id, fixture.entrant_b_id) and lineup.status = 'APPROVED') <> 2) then raise exception 'Both approved squad lineups are required for every rubber before play begins'; end if;
  update public.sport_fixture_match_lineups lineup set status = 'LOCKED', locked_at = now(), locked_snapshot = jsonb_build_object('format', match.match_format, 'label', match.label, 'players', coalesce((select jsonb_agg(jsonb_build_object('sport_profile_id', player.sport_profile_id, 'display_name', player.display_name_snapshot, 'display_order', player.display_order) order by player.display_order) from public.sport_fixture_match_lineup_players player where player.lineup_id = lineup.id), '[]'::jsonb)) from public.sport_fixture_matches match where match.id = lineup.fixture_match_id and lineup.fixture_id = fixture.id;
  insert into public.sport_team_tie_states(fixture_id, competition_id, status, started_at) values (fixture.id, competition.id, 'IN_PROGRESS', now()) on conflict (fixture_id) do update set status = 'IN_PROGRESS', started_at = coalesce(sport_team_tie_states.started_at, excluded.started_at), updated_at = now();
  perform app_private.write_sport_audit(competition.sport_id, 'FIXTURE', fixture.id, 'TEAM_TIE_STARTED', jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function app_private.record_sport_team_tie_rubber_result(p_fixture_match_id uuid, p_winner_entry_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare match public.sport_fixture_matches%rowtype;
declare fixture public.sport_fixtures%rowtype;
declare competition public.sport_competitions%rowtype;
declare wins_a integer;
declare wins_b integer;
declare completed_count integer;
declare threshold integer;
declare winner uuid;
begin
  select * into match from public.sport_fixture_matches where id = p_fixture_match_id;
  select * into fixture from public.sport_fixtures where id = match.fixture_id for update;
  if not found or not app_private.can_control_sport_team_tie(fixture.id) then raise exception 'Only an assigned official or competition manager can record a rubber outcome'; end if;
  if p_winner_entry_id not in (fixture.entrant_a_id, fixture.entrant_b_id) or nullif(trim(p_reason), '') is null then raise exception 'Choose a tie entrant and provide an audit reason'; end if;
  if not exists (select 1 from public.sport_team_tie_states where fixture_id = fixture.id and status in ('IN_PROGRESS', 'CLINCHED')) then raise exception 'Start and lock the team tie before recording outcomes'; end if;
  insert into public.sport_fixture_match_results(fixture_match_id, fixture_id, competition_id, winner_entry_id, status, recorded_by, recorded_at, reason) values (match.id, fixture.id, fixture.competition_id, p_winner_entry_id, 'COMPLETED', (select auth.uid()), now(), trim(p_reason)) on conflict (fixture_match_id) do update set winner_entry_id = excluded.winner_entry_id, status = 'COMPLETED', recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at, reason = excluded.reason;
  select count(*) filter (where winner_entry_id = fixture.entrant_a_id), count(*) filter (where winner_entry_id = fixture.entrant_b_id), count(*) into wins_a, wins_b, completed_count from public.sport_fixture_match_results where fixture_id = fixture.id and status = 'COMPLETED';
  select count(*) into threshold from public.sport_fixture_matches where fixture_id = fixture.id;
  threshold := floor(threshold / 2.0)::integer + 1;
  winner := case when wins_a >= threshold then fixture.entrant_a_id when wins_b >= threshold then fixture.entrant_b_id else null end;
  update public.sport_team_tie_states set winner_entry_id = coalesce(winner, winner_entry_id), clinched_at = case when winner is not null then coalesce(clinched_at, now()) else clinched_at end, status = case when completed_count = (select count(*) from public.sport_fixture_matches where fixture_id = fixture.id) then 'COMPLETED' when winner is not null then 'CLINCHED' else 'IN_PROGRESS' end, updated_at = now() where fixture_id = fixture.id;
  select * into competition from public.sport_competitions where id = fixture.competition_id;
  perform app_private.write_sport_audit(competition.sport_id, 'FIXTURE', fixture.id, 'TEAM_TIE_RUBBER_OUTCOME_RECORDED', jsonb_build_object('fixture_match_id', match.id, 'winner_entry_id', p_winner_entry_id, 'reason', p_reason));
  return app_private.get_sport_team_tie_state(fixture.id);
end;
$$;

create or replace function app_private.get_sport_team_tie_state(p_fixture_id uuid)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('fixture_id', fixture.id, 'status', coalesce(state.status, 'SCHEDULED'),
    'rubber_count', (select count(*) from public.sport_fixture_matches where fixture_id = fixture.id),
    'majority_threshold', floor((select count(*) from public.sport_fixture_matches where fixture_id = fixture.id) / 2.0)::integer + 1,
    'entrant_a_wins', (select count(*) from public.sport_fixture_match_results where fixture_id = fixture.id and status = 'COMPLETED' and winner_entry_id = fixture.entrant_a_id),
    'entrant_b_wins', (select count(*) from public.sport_fixture_match_results where fixture_id = fixture.id and status = 'COMPLETED' and winner_entry_id = fixture.entrant_b_id),
    'winner_entry_id', state.winner_entry_id, 'started_at', state.started_at, 'clinched_at', state.clinched_at)
  from public.sport_fixtures fixture left join public.sport_team_tie_states state on state.fixture_id = fixture.id
  where fixture.id = p_fixture_id
$$;

create or replace function public.submit_sport_team_tie_lineup(p_fixture_match_id uuid, p_entry_id uuid, p_player_profile_ids uuid[], p_expected_version integer)
returns uuid language sql security definer set search_path = public
as $$ select app_private.submit_sport_team_tie_lineup(p_fixture_match_id, p_entry_id, p_player_profile_ids, p_expected_version) $$;
create or replace function public.override_sport_team_tie_lineup(p_fixture_match_id uuid, p_entry_id uuid, p_player_profile_ids uuid[], p_expected_version integer, p_reason text)
returns uuid language sql security definer set search_path = public
as $$ select app_private.upsert_sport_team_tie_lineup(p_fixture_match_id, p_entry_id, p_player_profile_ids, p_expected_version, true, p_reason) $$;
create or replace function public.review_sport_team_tie_lineup(p_lineup_id uuid, p_approve boolean, p_reason text default null)
returns void language sql security definer set search_path = public
as $$ select app_private.review_sport_team_tie_lineup(p_lineup_id, p_approve, p_reason) $$;
create or replace function public.start_sport_team_tie(p_fixture_id uuid, p_reason text default null)
returns void language sql security definer set search_path = public
as $$ select app_private.start_sport_team_tie(p_fixture_id, p_reason) $$;
create or replace function public.record_sport_team_tie_rubber_result(p_fixture_match_id uuid, p_winner_entry_id uuid, p_reason text)
returns jsonb language sql security definer set search_path = public
as $$ select app_private.record_sport_team_tie_rubber_result(p_fixture_match_id, p_winner_entry_id, p_reason) $$;
create or replace function public.get_sport_team_tie_state(p_fixture_id uuid)
returns jsonb language sql security definer set search_path = public
as $$ select app_private.get_sport_team_tie_state(p_fixture_id) $$;

revoke all on function app_private.can_control_sport_team_tie(uuid), app_private.upsert_sport_team_tie_lineup(uuid, uuid, uuid[], integer, boolean, text), app_private.review_sport_team_tie_lineup(uuid, boolean, text), app_private.start_sport_team_tie(uuid, text), app_private.record_sport_team_tie_rubber_result(uuid, uuid, text), app_private.get_sport_team_tie_state(uuid) from public, anon, authenticated;
revoke all on function public.override_sport_team_tie_lineup(uuid, uuid, uuid[], integer, text), public.review_sport_team_tie_lineup(uuid, boolean, text), public.start_sport_team_tie(uuid, text), public.record_sport_team_tie_rubber_result(uuid, uuid, text), public.get_sport_team_tie_state(uuid) from public, anon;
grant execute on function public.override_sport_team_tie_lineup(uuid, uuid, uuid[], integer, text), public.review_sport_team_tie_lineup(uuid, boolean, text), public.start_sport_team_tie(uuid, text), public.record_sport_team_tie_rubber_result(uuid, uuid, text), public.get_sport_team_tie_state(uuid) to authenticated;

create or replace function app_private.can_read_sport_team_tie_lineup(p_lineup_id uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare lineup public.sport_fixture_match_lineups%rowtype;
declare rules public.sport_competition_team_tie_rules%rowtype;
declare fixture public.sport_fixtures%rowtype;
begin
  select * into lineup from public.sport_fixture_match_lineups where id = p_lineup_id;
  if not found or not app_private.can_read_sport_competition(lineup.competition_id) then return false; end if;
  if app_private.can_control_sport_team_tie(lineup.fixture_id) or exists (select 1 from public.sport_tournament_squads where entry_id = lineup.entry_id and captain_account_id = (select auth.uid())) then return true; end if;
  select * into rules from public.sport_competition_team_tie_rules where competition_id = lineup.competition_id;
  if rules.lineup_reveal_policy = 'IMMEDIATE' then return true; end if;
  if rules.lineup_submission_deadline is not null and now() >= rules.lineup_submission_deadline then return true; end if;
  select * into fixture from public.sport_fixtures where id = lineup.fixture_id;
  return rules.lineup_reveal_policy = 'AFTER_BOTH_SUBMITTED' and
    (select count(*) from public.sport_fixture_match_lineups submitted where submitted.fixture_match_id = lineup.fixture_match_id and submitted.entry_id in (fixture.entrant_a_id, fixture.entrant_b_id) and submitted.status in ('PENDING', 'APPROVED', 'LOCKED')) = 2;
end;
$$;

drop policy "sport_fixture_match_lineups_read_authorized" on public.sport_fixture_match_lineups;
create policy "sport_fixture_match_lineups_read_revealed_or_own" on public.sport_fixture_match_lineups for select to authenticated
  using ((select app_private.can_read_sport_team_tie_lineup(id)));
drop policy "sport_fixture_match_lineup_players_read_authorized" on public.sport_fixture_match_lineup_players;
create policy "sport_fixture_match_lineup_players_read_revealed_or_own" on public.sport_fixture_match_lineup_players for select to authenticated
  using ((select app_private.can_read_sport_team_tie_lineup(lineup_id)));

create or replace function app_private.upsert_sport_team_tie_template(
  p_competition_id uuid, p_template_id uuid, p_name text, p_rubbers jsonb
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare competition public.sport_competitions%rowtype;
declare template_id_value uuid;
begin
  competition := app_private.require_managed_competition(p_competition_id);
  if competition.kind <> 'TOURNAMENT' then raise exception 'Only tournaments support team-tie templates'; end if;
  if jsonb_typeof(p_rubbers) <> 'array' or jsonb_array_length(p_rubbers) < 1 or exists (
    select 1 from jsonb_array_elements(p_rubbers) item where upper(trim(coalesce(item->>'format', ''))) not in ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES') or length(trim(coalesce(item->>'label', ''))) > 80 or (item ? 'eligibility' and jsonb_typeof(item->'eligibility') <> 'array')
  ) then raise exception 'A template requires ordered supported rubbers with optional eligibility arrays'; end if;
  if p_template_id is null then
    insert into public.sport_team_tie_templates(competition_id, name, rubbers, created_by) values (competition.id, trim(p_name), p_rubbers, (select auth.uid())) returning id into template_id_value;
  else
    update public.sport_team_tie_templates set name = trim(p_name), rubbers = p_rubbers, updated_at = now() where id = p_template_id and competition_id = competition.id returning id into template_id_value;
    if template_id_value is null then raise exception 'Team-tie template was not found'; end if;
  end if;
  perform app_private.write_sport_audit(competition.sport_id, 'COMPETITION', competition.id, 'TEAM_TIE_TEMPLATE_SAVED', jsonb_build_object('template_id', template_id_value));
  return template_id_value;
end;
$$;

create or replace function app_private.apply_sport_team_tie_template(
  p_fixture_id uuid, p_template_id uuid, p_expected_schedule_version integer, p_expected_row_version integer
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare fixture public.sport_fixtures%rowtype;
declare competition public.sport_competitions%rowtype;
declare template public.sport_team_tie_templates%rowtype;
declare next_version integer;
begin
  select * into fixture from public.sport_fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Team tie was not found'; end if;
  competition := app_private.require_managed_competition(fixture.competition_id);
  if competition.kind <> 'TOURNAMENT' or competition.lifecycle not in ('DRAFT', 'REGISTRATION_LOCKED', 'PUBLISHED') or fixture.status = 'CANCELLED' then raise exception 'This team-tie draft is locked'; end if;
  if fixture.row_version <> p_expected_row_version or competition.schedule_version <> p_expected_schedule_version then raise exception 'Schedule changed; reload before saving'; end if;
  if exists (select 1 from public.sport_fixture_match_lineups where fixture_id = fixture.id) or exists (select 1 from public.sport_team_tie_states where fixture_id = fixture.id) then raise exception 'A team tie with submitted lineups cannot change template'; end if;
  select * into template from public.sport_team_tie_templates where id = p_template_id and competition_id = competition.id;
  if not found then raise exception 'Team-tie template was not found'; end if;
  perform app_private.write_sport_team_tie_matches(fixture.id, template.rubbers);
  next_version := competition.schedule_version + 1;
  update public.sport_fixtures set row_version = row_version + 1, updated_at = now() where id = fixture.id;
  update public.sport_competitions set schedule_version = next_version, updated_at = now() where id = competition.id;
  perform app_private.write_sport_audit(competition.sport_id, 'FIXTURE', fixture.id, 'TEAM_TIE_TEMPLATE_APPLIED', jsonb_build_object('template_id', template.id));
  return jsonb_build_object('fixture_id', fixture.id, 'schedule_version', next_version, 'row_version', fixture.row_version + 1);
end;
$$;

create or replace function public.upsert_sport_team_tie_template(p_competition_id uuid, p_template_id uuid, p_name text, p_rubbers jsonb)
returns uuid language sql security definer set search_path = public
as $$ select app_private.upsert_sport_team_tie_template(p_competition_id, p_template_id, p_name, p_rubbers) $$;
create or replace function public.apply_sport_team_tie_template(p_fixture_id uuid, p_template_id uuid, p_expected_schedule_version integer, p_expected_row_version integer)
returns jsonb language sql security definer set search_path = public
as $$ select app_private.apply_sport_team_tie_template(p_fixture_id, p_template_id, p_expected_schedule_version, p_expected_row_version) $$;
revoke all on function app_private.can_read_sport_team_tie_lineup(uuid), app_private.upsert_sport_team_tie_template(uuid, uuid, text, jsonb), app_private.apply_sport_team_tie_template(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.upsert_sport_team_tie_template(uuid, uuid, text, jsonb), public.apply_sport_team_tie_template(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.upsert_sport_team_tie_template(uuid, uuid, text, jsonb), public.apply_sport_team_tie_template(uuid, uuid, integer, integer) to authenticated;

create or replace function app_private.get_sport_team_tie_state(p_fixture_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare competition_id_value uuid;
declare state_value jsonb;
begin
  select competition_id into competition_id_value from public.sport_fixtures where id = p_fixture_id;
  if competition_id_value is null or not app_private.can_read_sport_competition(competition_id_value) then
    raise exception 'Team tie was not found';
  end if;
  select jsonb_build_object('fixture_id', fixture.id, 'status', coalesce(state.status, 'SCHEDULED'),
    'rubber_count', (select count(*) from public.sport_fixture_matches where fixture_id = fixture.id),
    'majority_threshold', floor((select count(*) from public.sport_fixture_matches where fixture_id = fixture.id) / 2.0)::integer + 1,
    'entrant_a_wins', (select count(*) from public.sport_fixture_match_results where fixture_id = fixture.id and status = 'COMPLETED' and winner_entry_id = fixture.entrant_a_id),
    'entrant_b_wins', (select count(*) from public.sport_fixture_match_results where fixture_id = fixture.id and status = 'COMPLETED' and winner_entry_id = fixture.entrant_b_id),
    'winner_entry_id', state.winner_entry_id, 'started_at', state.started_at, 'clinched_at', state.clinched_at)
  into state_value
  from public.sport_fixtures fixture left join public.sport_team_tie_states state on state.fixture_id = fixture.id
  where fixture.id = p_fixture_id;
  return state_value;
end;
$$;
