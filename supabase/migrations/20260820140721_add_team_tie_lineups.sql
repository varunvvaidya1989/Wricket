-- Phase 4: captain-submitted team-tie lineups. The server accepts players only
-- from the locked tournament-squad snapshot, never from a mutable club roster.

alter table public.sport_fixture_matches
  drop constraint sport_fixture_matches_match_format_check,
  add constraint sport_fixture_matches_match_format_check
    check (match_format in ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES'));

create table public.sport_competition_team_tie_rules (
  competition_id uuid primary key references public.sport_competitions(id) on delete cascade,
  max_rubbers_per_player integer not null default 2 check (max_rubbers_per_player > 0),
  allow_singles_and_doubles boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sport_competition_team_tie_rules(competition_id)
select id from public.sport_competitions where kind = 'TOURNAMENT'
on conflict (competition_id) do nothing;

create table public.sport_fixture_match_lineups (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  fixture_id uuid not null,
  fixture_match_id uuid not null,
  entry_id uuid not null references public.sport_competition_entries(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  foreign key (fixture_id, competition_id)
    references public.sport_fixtures(id, competition_id) on delete cascade,
  foreign key (fixture_match_id) references public.sport_fixture_matches(id) on delete cascade,
  unique (fixture_match_id, entry_id)
);

create table public.sport_fixture_match_lineup_players (
  lineup_id uuid not null references public.sport_fixture_match_lineups(id) on delete cascade,
  sport_profile_id uuid not null references public.sport_profiles(id) on delete restrict,
  display_order integer not null check (display_order >= 0),
  display_name_snapshot text not null check (length(trim(display_name_snapshot)) between 2 and 120),
  primary key (lineup_id, sport_profile_id),
  unique (lineup_id, display_order)
);

create index sport_fixture_match_lineups_fixture_idx
  on public.sport_fixture_match_lineups(fixture_id, entry_id);

alter table public.sport_competition_team_tie_rules enable row level security;
alter table public.sport_fixture_match_lineups enable row level security;
alter table public.sport_fixture_match_lineup_players enable row level security;

create policy "sport_competition_team_tie_rules_read_authorized"
  on public.sport_competition_team_tie_rules for select to authenticated
  using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_fixture_match_lineups_read_authorized"
  on public.sport_fixture_match_lineups for select to authenticated
  using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_fixture_match_lineup_players_read_authorized"
  on public.sport_fixture_match_lineup_players for select to authenticated
  using (exists (
    select 1 from public.sport_fixture_match_lineups lineup
    where lineup.id = lineup_id
      and app_private.can_read_sport_competition(lineup.competition_id)
  ));

revoke all on public.sport_competition_team_tie_rules,
  public.sport_fixture_match_lineups,
  public.sport_fixture_match_lineup_players from public, anon, authenticated;
grant select on public.sport_competition_team_tie_rules,
  public.sport_fixture_match_lineups,
  public.sport_fixture_match_lineup_players to authenticated;

create or replace function app_private.submit_sport_team_tie_lineup(
  p_fixture_match_id uuid, p_entry_id uuid, p_player_profile_ids uuid[], p_expected_version integer
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare selected_match public.sport_fixture_matches%rowtype;
declare selected_fixture public.sport_fixtures%rowtype;
declare selected_competition public.sport_competitions%rowtype;
declare selected_entry public.sport_competition_entries%rowtype;
declare selected_squad public.sport_tournament_squads%rowtype;
declare selected_rules public.sport_competition_team_tie_rules%rowtype;
  declare lineup_id_value uuid;
  declare current_version integer;
declare required_players integer;
declare selected_count integer;
declare existing_count integer;
declare player_profile_id uuid;
begin
  select * into selected_match from public.sport_fixture_matches where id = p_fixture_match_id;
  if not found then raise exception 'Team-tie match was not found'; end if;
  select * into selected_competition from public.sport_competitions
    where id = selected_match.competition_id and kind = 'TOURNAMENT';
  if not found then raise exception 'Team-tie lineups are available only in tournaments'; end if;
  select * into selected_fixture from public.sport_fixtures where id = selected_match.fixture_id for update;
  if selected_fixture.status = 'CANCELLED' then raise exception 'Cancelled team ties cannot receive lineups'; end if;
  select * into selected_entry from public.sport_competition_entries
    where id = p_entry_id and competition_id = selected_match.competition_id and entry_kind = 'SQUAD';
  if not found or p_entry_id not in (selected_fixture.entrant_a_id, selected_fixture.entrant_b_id) then
    raise exception 'Choose one of this team tie''s squad entrants';
  end if;
  if selected_entry.status <> 'APPROVED' then raise exception 'Only approved squads can submit a lineup'; end if;
  select * into selected_squad from public.sport_tournament_squads where entry_id = selected_entry.id;
  if selected_squad.roster_locked_at is null then raise exception 'The squad roster must be locked before lineup submission'; end if;
  if selected_squad.captain_account_id <> (select auth.uid()) then
    raise exception 'Only the registered squad captain can submit this lineup';
  end if;
  select * into selected_rules from public.sport_competition_team_tie_rules where competition_id = selected_match.competition_id;
  if not found then raise exception 'Team-tie rules were not found'; end if;
  required_players := case when selected_match.match_format = 'SINGLES' then 1 else 2 end;
  selected_count := coalesce(cardinality(p_player_profile_ids), 0);
  if selected_count <> required_players or selected_count <> (select count(distinct id) from unnest(p_player_profile_ids) id) then
    raise exception 'This % lineup requires exactly % distinct player(s)', lower(selected_match.match_format), required_players;
  end if;
  if exists (
    select 1 from unnest(p_player_profile_ids) requested(id)
    where not exists (
      select 1 from public.sport_squad_members member
      where member.squad_entry_id = selected_squad.entry_id
        and member.sport_profile_id = requested.id and member.status = 'APPROVED'
    )
  ) then raise exception 'Every lineup player must belong to the locked approved squad'; end if;

  select id into lineup_id_value from public.sport_fixture_match_lineups
    where fixture_match_id = selected_match.id and entry_id = selected_entry.id for update;
  if lineup_id_value is null then
    if p_expected_version <> 0 then raise exception 'Lineup version is out of date'; end if;
  else
    select version into current_version from public.sport_fixture_match_lineups where id = lineup_id_value;
    if current_version <> p_expected_version then raise exception 'Lineup version is out of date'; end if;
  end if;
  foreach player_profile_id in array p_player_profile_ids loop
    select count(*) into existing_count
    from public.sport_fixture_match_lineup_players player
    join public.sport_fixture_match_lineups lineup on lineup.id = player.lineup_id
    where lineup.fixture_id = selected_fixture.id and lineup.entry_id = selected_entry.id
      and player.sport_profile_id = player_profile_id
      and player.lineup_id <> coalesce(lineup_id_value, '00000000-0000-0000-0000-000000000000'::uuid);
    if existing_count >= selected_rules.max_rubbers_per_player then
      raise exception 'A player cannot contest more than % rubbers in this team tie', selected_rules.max_rubbers_per_player;
    end if;
    if not selected_rules.allow_singles_and_doubles and exists (
      select 1 from public.sport_fixture_match_lineup_players player
      join public.sport_fixture_match_lineups lineup on lineup.id = player.lineup_id
      join public.sport_fixture_matches other_match on other_match.id = lineup.fixture_match_id
      where lineup.fixture_id = selected_fixture.id and lineup.entry_id = selected_entry.id
        and player.sport_profile_id = player_profile_id and other_match.match_format <> selected_match.match_format
        and lineup.fixture_match_id <> selected_match.id
    ) then raise exception 'A player cannot be selected for both singles and doubles in this team tie'; end if;
  end loop;

  if lineup_id_value is null then
    insert into public.sport_fixture_match_lineups(
      competition_id, fixture_id, fixture_match_id, entry_id, submitted_by, snapshot
    ) values (
      selected_match.competition_id, selected_fixture.id, selected_match.id, selected_entry.id,
      (select auth.uid()), jsonb_build_object('format', selected_match.match_format, 'submitted_at', now())
    ) returning id into lineup_id_value;
  else
    update public.sport_fixture_match_lineups set submitted_by = (select auth.uid()), submitted_at = now(),
      version = version + 1, snapshot = jsonb_build_object('format', selected_match.match_format, 'submitted_at', now())
    where id = lineup_id_value;
    delete from public.sport_fixture_match_lineup_players where lineup_id = lineup_id_value;
  end if;
  insert into public.sport_fixture_match_lineup_players(
    lineup_id, sport_profile_id, display_order, display_name_snapshot
  )
  select lineup_id_value, requested.id, requested.ordinality - 1, profile.display_name
  from unnest(p_player_profile_ids) with ordinality requested(id, ordinality)
  join public.sport_profiles profile on profile.id = requested.id;
  perform app_private.write_sport_audit(selected_competition.sport_id, 'FIXTURE', selected_fixture.id,
    'TEAM_TIE_LINEUP_SUBMITTED', jsonb_build_object('fixture_match_id', selected_match.id, 'entry_id', selected_entry.id));
  return lineup_id_value;
end;
$$;

create or replace function public.submit_sport_team_tie_lineup(
  p_fixture_match_id uuid, p_entry_id uuid, p_player_profile_ids uuid[], p_expected_version integer
)
returns uuid language sql security definer set search_path = public
as $$ select app_private.submit_sport_team_tie_lineup(p_fixture_match_id, p_entry_id, p_player_profile_ids, p_expected_version) $$;

revoke all on function app_private.submit_sport_team_tie_lineup(uuid, uuid, uuid[], integer) from public, anon, authenticated;
revoke all on function public.submit_sport_team_tie_lineup(uuid, uuid, uuid[], integer) from public, anon;
grant execute on function public.submit_sport_team_tie_lineup(uuid, uuid, uuid[], integer) to authenticated;
