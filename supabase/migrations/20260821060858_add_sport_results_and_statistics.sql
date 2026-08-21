-- Phase 6: deterministic projections from authoritative scoring results.

create table public.sport_points_rule_history (
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  version integer not null,
  win_points integer not null,
  draw_points integer not null,
  loss_points integer not null,
  walkover_points integer not null,
  changed_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  primary key (competition_id, version)
);

insert into public.sport_points_rule_history(competition_id, version, win_points, draw_points, loss_points, walkover_points, changed_by)
select competition_id, version, win_points, draw_points, loss_points, walkover_points, updated_by
from public.sport_competition_points_rules on conflict do nothing;

create or replace function app_private.snapshot_sport_points_rule()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.sport_points_rule_history(competition_id, version, win_points, draw_points, loss_points, walkover_points, changed_by)
  values (new.competition_id, new.version, new.win_points, new.draw_points, new.loss_points, new.walkover_points, new.updated_by)
  on conflict do nothing;
  return new;
end;
$$;
create trigger sport_points_rule_snapshot after insert or update on public.sport_competition_points_rules
for each row execute function app_private.snapshot_sport_points_rule();

create table public.sport_competition_standings (
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  entry_id uuid not null references public.sport_competition_entries(id) on delete cascade,
  points_rule_version integer not null,
  played integer not null default 0,
  won integer not null default 0,
  drawn integer not null default 0,
  lost integer not null default 0,
  points integer not null default 0,
  rubbers_won integer not null default 0,
  rubbers_lost integer not null default 0,
  rank integer,
  computed_at timestamptz not null default now(),
  primary key (competition_id, entry_id)
);

create table public.sport_result_revisions (
  id uuid primary key default gen_random_uuid(),
  scoring_match_id uuid not null references public.sport_scoring_matches(id) on delete cascade,
  previous_winner_entry_id uuid references public.sport_competition_entries(id) on delete restrict,
  revised_winner_entry_id uuid references public.sport_competition_entries(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 3 and 500),
  revised_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.sport_player_statistics (
  sport_profile_id uuid not null references public.sport_profiles(id) on delete cascade,
  sport_id uuid not null references public.sports(id) on delete cascade,
  competition_id uuid references public.sport_competitions(id) on delete cascade,
  match_format text not null check (match_format in ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES')),
  opponent_profile_id uuid references public.sport_profiles(id) on delete set null,
  period_start date not null default date '1970-01-01',
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  retirements integer not null default 0,
  walkovers integer not null default 0,
  display_name_snapshot text not null,
  computed_at timestamptz not null default now(),
  primary key (sport_profile_id, sport_id, competition_id, match_format, opponent_profile_id, period_start)
);

create table public.sport_partnership_statistics (
  sport_id uuid not null references public.sports(id) on delete cascade,
  competition_id uuid references public.sport_competitions(id) on delete cascade,
  player_a_profile_id uuid not null references public.sport_profiles(id) on delete cascade,
  player_b_profile_id uuid not null references public.sport_profiles(id) on delete cascade,
  matches_played integer not null default 0,
  wins integer not null default 0,
  computed_at timestamptz not null default now(),
  primary key (sport_id, competition_id, player_a_profile_id, player_b_profile_id),
  check (player_a_profile_id < player_b_profile_id)
);

create table public.sport_manual_progressions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  source_fixture_id uuid not null references public.sport_fixtures(id) on delete cascade,
  winner_entry_id uuid not null references public.sport_competition_entries(id) on delete restrict,
  target_stage_id uuid references public.sport_competition_stages(id) on delete set null,
  target_slot text not null check (length(trim(target_slot)) between 1 and 80),
  reason text not null check (length(trim(reason)) between 3 and 500),
  advanced_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (source_fixture_id, target_stage_id, target_slot)
);

alter table public.sport_points_rule_history enable row level security;
alter table public.sport_competition_standings enable row level security;
alter table public.sport_result_revisions enable row level security;
alter table public.sport_player_statistics enable row level security;
alter table public.sport_partnership_statistics enable row level security;
alter table public.sport_manual_progressions enable row level security;
create policy "sport_points_history_read" on public.sport_points_rule_history for select to authenticated using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_standings_read" on public.sport_competition_standings for select to authenticated using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_result_revisions_read" on public.sport_result_revisions for select to authenticated using (exists (select 1 from public.sport_scoring_matches match where match.id = scoring_match_id and app_private.can_read_sport_competition(match.competition_id)));
create policy "sport_player_statistics_read" on public.sport_player_statistics for select to authenticated using (competition_id is null or (select app_private.can_read_sport_competition(competition_id)));
create policy "sport_partnership_statistics_read" on public.sport_partnership_statistics for select to authenticated using (competition_id is null or (select app_private.can_read_sport_competition(competition_id)));
create policy "sport_manual_progressions_read" on public.sport_manual_progressions for select to authenticated using ((select app_private.can_read_sport_competition(competition_id)));
revoke all on public.sport_points_rule_history, public.sport_competition_standings, public.sport_result_revisions, public.sport_player_statistics, public.sport_partnership_statistics, public.sport_manual_progressions from public, anon, authenticated;
grant select on public.sport_points_rule_history, public.sport_competition_standings, public.sport_result_revisions, public.sport_player_statistics, public.sport_partnership_statistics, public.sport_manual_progressions to authenticated;

create or replace function app_private.rebuild_sport_competition_projections(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rule public.sport_competition_points_rules%rowtype;
declare standings_count integer;
begin
  if not app_private.can_read_sport_competition(p_competition_id) then raise exception 'Competition was not found'; end if;
  select * into rule from public.sport_competition_points_rules where competition_id = p_competition_id;
  delete from public.sport_competition_standings where competition_id = p_competition_id;
  insert into public.sport_competition_standings(competition_id, entry_id, points_rule_version)
  select p_competition_id, id, rule.version from public.sport_competition_entries where competition_id = p_competition_id and status = 'APPROVED';
  with outcomes as (
    select fixture.id fixture_id, fixture.entrant_a_id, fixture.entrant_b_id, result.winner_entry_id
    from public.sport_fixtures fixture join public.sport_fixture_results result on result.fixture_id = fixture.id
    where fixture.competition_id = p_competition_id
    union all
    select fixture.id, fixture.entrant_a_id, fixture.entrant_b_id, state.winner_entry_id
    from public.sport_fixtures fixture join public.sport_team_tie_states state on state.fixture_id = fixture.id
    where fixture.competition_id = p_competition_id and state.status = 'COMPLETED'
  ), totals as (
    select entry_id, count(*) played,
      count(*) filter (where entry_id = winner_entry_id) won,
      count(*) filter (where winner_entry_id is null) drawn,
      count(*) filter (where winner_entry_id is not null and entry_id <> winner_entry_id) lost
    from outcomes cross join lateral (values (entrant_a_id), (entrant_b_id)) side(entry_id) group by entry_id
  )
  update public.sport_competition_standings standing set played = totals.played, won = totals.won,
    drawn = totals.drawn, lost = totals.lost,
    points = totals.won * rule.win_points + totals.drawn * rule.draw_points + totals.lost * rule.loss_points
  from totals where standing.competition_id = p_competition_id and standing.entry_id = totals.entry_id;
  update public.sport_competition_standings standing set
    rubbers_won = (select count(*) from public.sport_fixture_match_results result join public.sport_fixture_matches match on match.id = result.fixture_match_id where match.competition_id = p_competition_id and result.winner_entry_id = standing.entry_id and result.status = 'COMPLETED'),
    rubbers_lost = (select count(*) from public.sport_fixture_match_results result join public.sport_fixture_matches match on match.id = result.fixture_match_id join public.sport_fixtures fixture on fixture.id = match.fixture_id where match.competition_id = p_competition_id and result.status = 'COMPLETED' and standing.entry_id in (fixture.entrant_a_id, fixture.entrant_b_id) and result.winner_entry_id <> standing.entry_id);
  with ranked as (select entry_id, row_number() over (order by points desc, won desc, (rubbers_won-rubbers_lost) desc, entry_id)::integer rank from public.sport_competition_standings where competition_id = p_competition_id)
  update public.sport_competition_standings standing set rank = ranked.rank, computed_at = now() from ranked where standing.competition_id = p_competition_id and standing.entry_id = ranked.entry_id;
  select count(*) into standings_count from public.sport_competition_standings where competition_id = p_competition_id;
  return jsonb_build_object('competition_id', p_competition_id, 'points_rule_version', rule.version, 'standings_count', standings_count);
end;
$$;

create or replace function app_private.correct_sport_scoring_result(p_scoring_match_id uuid, p_winner_entry_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare match public.sport_scoring_matches%rowtype;
declare previous_winner uuid;
begin
  select * into match from public.sport_scoring_matches where id = p_scoring_match_id for update;
  if not found or not app_private.can_score_sport_scoring_match(match.id) then raise exception 'Only an assigned official or competition manager can correct this result'; end if;
  if match.status <> 'COMPLETED' or p_winner_entry_id not in (match.entrant_a_id, match.entrant_b_id) or nullif(trim(p_reason), '') is null then raise exception 'A completed match, valid winner, and correction reason are required'; end if;
  if match.fixture_match_id is null then select winner_entry_id into previous_winner from public.sport_fixture_results where scoring_match_id = match.id;
  else select winner_entry_id into previous_winner from public.sport_fixture_match_results where fixture_match_id = match.fixture_match_id; end if;
  insert into public.sport_result_revisions(scoring_match_id, previous_winner_entry_id, revised_winner_entry_id, reason, revised_by) values (match.id, previous_winner, p_winner_entry_id, trim(p_reason), (select auth.uid()));
  if match.fixture_match_id is null then update public.sport_fixture_results set winner_entry_id = p_winner_entry_id where scoring_match_id = match.id;
  else update public.sport_fixture_match_results set winner_entry_id = p_winner_entry_id, recorded_by = (select auth.uid()), recorded_at = now(), reason = trim(p_reason) where fixture_match_id = match.fixture_match_id; end if;
  perform app_private.rebuild_sport_competition_projections(match.competition_id);
  return jsonb_build_object('previous_winner_entry_id', previous_winner, 'winner_entry_id', p_winner_entry_id);
end;
$$;

create or replace function app_private.record_sport_manual_progression(p_source_fixture_id uuid, p_target_stage_id uuid, p_target_slot text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare fixture public.sport_fixtures%rowtype; declare winner uuid; declare progression_id uuid;
begin
  select * into fixture from public.sport_fixtures where id = p_source_fixture_id;
  if not found then raise exception 'Source fixture was not found'; end if;
  perform app_private.require_managed_competition(fixture.competition_id);
  winner := coalesce((select winner_entry_id from public.sport_fixture_results where fixture_id = fixture.id), (select winner_entry_id from public.sport_team_tie_states where fixture_id = fixture.id and status = 'COMPLETED'));
  if winner is null or nullif(trim(p_reason), '') is null then raise exception 'A completed winner and progression reason are required'; end if;
  insert into public.sport_manual_progressions(competition_id, source_fixture_id, winner_entry_id, target_stage_id, target_slot, reason, advanced_by) values (fixture.competition_id, fixture.id, winner, p_target_stage_id, trim(p_target_slot), trim(p_reason), (select auth.uid())) returning id into progression_id;
  return progression_id;
end;
$$;

create or replace function public.rebuild_sport_competition_projections(p_competition_id uuid) returns jsonb language sql security definer set search_path = public as $$ select app_private.rebuild_sport_competition_projections(p_competition_id) $$;
create or replace function public.correct_sport_scoring_result(p_scoring_match_id uuid, p_winner_entry_id uuid, p_reason text) returns jsonb language sql security definer set search_path = public as $$ select app_private.correct_sport_scoring_result(p_scoring_match_id, p_winner_entry_id, p_reason) $$;
create or replace function public.record_sport_manual_progression(p_source_fixture_id uuid, p_target_stage_id uuid, p_target_slot text, p_reason text) returns uuid language sql security definer set search_path = public as $$ select app_private.record_sport_manual_progression(p_source_fixture_id, p_target_stage_id, p_target_slot, p_reason) $$;
revoke all on function app_private.snapshot_sport_points_rule(), app_private.rebuild_sport_competition_projections(uuid), app_private.correct_sport_scoring_result(uuid, uuid, text), app_private.record_sport_manual_progression(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.rebuild_sport_competition_projections(uuid), public.correct_sport_scoring_result(uuid, uuid, text), public.record_sport_manual_progression(uuid, uuid, text, text) from public, anon;
grant execute on function public.rebuild_sport_competition_projections(uuid), public.correct_sport_scoring_result(uuid, uuid, text), public.record_sport_manual_progression(uuid, uuid, text, text) to authenticated;

create or replace function app_private.rebuild_sport_player_statistics(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare player_rows integer; declare partnership_rows integer;
begin
  if not app_private.can_read_sport_competition(p_competition_id) then raise exception 'Competition was not found'; end if;
  delete from public.sport_player_statistics where competition_id = p_competition_id;
  delete from public.sport_partnership_statistics where competition_id = p_competition_id;
  with completed as (
    select match.*, coalesce(revision.revised_winner_entry_id, fixture_result.winner_entry_id, rubber_result.winner_entry_id) winner_entry_id
    from public.sport_scoring_matches match
    left join public.sport_fixture_results fixture_result on fixture_result.scoring_match_id = match.id
    left join public.sport_fixture_match_results rubber_result on rubber_result.fixture_match_id = match.fixture_match_id
    left join lateral (select revised_winner_entry_id from public.sport_result_revisions where scoring_match_id = match.id order by created_at desc limit 1) revision on true
    where match.competition_id = p_competition_id and match.status = 'COMPLETED'
  ), participants as (
    select completed.id match_id, completed.sport_id, completed.competition_id, completed.match_format, completed.entrant_a_id own_entry, completed.entrant_b_id opponent_entry, completed.winner_entry_id, player.value #>> '{}' profile_text
    from completed cross join lateral jsonb_array_elements(completed.side_a_players) player
    union all
    select completed.id, completed.sport_id, completed.competition_id, completed.match_format, completed.entrant_b_id, completed.entrant_a_id, completed.winner_entry_id, player.value #>> '{}'
    from completed cross join lateral jsonb_array_elements(completed.side_b_players) player
  ), opponents as (
    select completed.id match_id, completed.entrant_a_id opponent_for, player.value #>> '{}' opponent_text from completed cross join lateral jsonb_array_elements(completed.side_b_players) player
    union all select completed.id, completed.entrant_b_id, player.value #>> '{}' from completed cross join lateral jsonb_array_elements(completed.side_a_players) player
  )
  insert into public.sport_player_statistics(sport_profile_id, sport_id, competition_id, match_format, opponent_profile_id, period_start, matches_played, wins, losses, display_name_snapshot)
  select profile.id, participant.sport_id, participant.competition_id, participant.match_format, opponent.id, date_trunc('year', now())::date,
    count(distinct participant.match_id), count(distinct participant.match_id) filter (where participant.own_entry = participant.winner_entry_id), count(distinct participant.match_id) filter (where participant.own_entry <> participant.winner_entry_id), profile.display_name
  from participants participant join public.sport_profiles profile on profile.id::text = participant.profile_text
  join opponents opponent_row on opponent_row.match_id = participant.match_id and opponent_row.opponent_for = participant.own_entry
  join public.sport_profiles opponent on opponent.id::text = opponent_row.opponent_text
  group by profile.id, participant.sport_id, participant.competition_id, participant.match_format, opponent.id, profile.display_name;
  get diagnostics player_rows = row_count;
  with completed as (
    select match.*, coalesce(revision.revised_winner_entry_id, fixture_result.winner_entry_id, rubber_result.winner_entry_id) winner_entry_id
    from public.sport_scoring_matches match left join public.sport_fixture_results fixture_result on fixture_result.scoring_match_id = match.id
    left join public.sport_fixture_match_results rubber_result on rubber_result.fixture_match_id = match.fixture_match_id
    left join lateral (select revised_winner_entry_id from public.sport_result_revisions where scoring_match_id = match.id order by created_at desc limit 1) revision on true
    where match.competition_id = p_competition_id and match.status = 'COMPLETED' and match.match_format <> 'SINGLES'
  ), pairs as (
    select id match_id, sport_id, competition_id, entrant_a_id own_entry, winner_entry_id, least((side_a_players->>0)::uuid, (side_a_players->>1)::uuid) player_a, greatest((side_a_players->>0)::uuid, (side_a_players->>1)::uuid) player_b from completed
    union all select id, sport_id, competition_id, entrant_b_id, winner_entry_id, least((side_b_players->>0)::uuid, (side_b_players->>1)::uuid), greatest((side_b_players->>0)::uuid, (side_b_players->>1)::uuid) from completed
  )
  insert into public.sport_partnership_statistics(sport_id, competition_id, player_a_profile_id, player_b_profile_id, matches_played, wins)
  select sport_id, competition_id, player_a, player_b, count(*), count(*) filter (where own_entry = winner_entry_id) from pairs group by sport_id, competition_id, player_a, player_b;
  get diagnostics partnership_rows = row_count;
  return jsonb_build_object('player_rows', player_rows, 'partnership_rows', partnership_rows);
end;
$$;

create or replace function public.rebuild_sport_player_statistics(p_competition_id uuid) returns jsonb language sql security definer set search_path = public as $$ select app_private.rebuild_sport_player_statistics(p_competition_id) $$;
revoke all on function app_private.rebuild_sport_player_statistics(uuid) from public, anon, authenticated;
revoke all on function public.rebuild_sport_player_statistics(uuid) from public, anon;
grant execute on function public.rebuild_sport_player_statistics(uuid) to authenticated;
