-- Every player in a non-cricket scoring match is a SportStage sport profile.
-- Display names remain immutable snapshots; profile ids remain the identity.

create table public.sport_scoring_match_players (
  scoring_match_id uuid not null references public.sport_scoring_matches(id) on delete cascade,
  side smallint not null check (side in (0, 1)),
  player_order smallint not null check (player_order in (0, 1)),
  sport_profile_id uuid not null references public.sport_profiles(id) on delete restrict,
  account_id uuid not null references public.profiles(id) on delete restrict,
  display_name_snapshot text not null check (length(trim(display_name_snapshot)) between 2 and 120),
  created_at timestamptz not null default now(),
  primary key (scoring_match_id, side, player_order),
  unique (scoring_match_id, sport_profile_id)
);

create index sport_scoring_match_players_account_idx
  on public.sport_scoring_match_players(account_id, scoring_match_id);

create unique index sport_scoring_matches_one_fixture_scoring_idx
  on public.sport_scoring_matches(fixture_id)
  where fixture_id is not null and fixture_match_id is null;

alter table public.sport_scoring_match_players enable row level security;
create policy "sport_scoring_match_players_read_authorized"
  on public.sport_scoring_match_players for select to authenticated
  using (exists (
    select 1 from public.sport_scoring_matches match
    where match.id = scoring_match_id
      and (match.competition_id is null or app_private.can_read_sport_competition(match.competition_id))
  ));
revoke all on public.sport_scoring_match_players from public, anon, authenticated;
grant select on public.sport_scoring_match_players to authenticated;

create or replace function app_private.can_read_sport_scoring_match(p_scoring_match_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.sport_scoring_matches match
    where match.id = p_scoring_match_id
      and (
        (match.competition_id is not null and app_private.can_read_sport_competition(match.competition_id))
        or match.created_by = (select auth.uid())
        or exists (
          select 1 from public.sport_scoring_match_players player
          where player.scoring_match_id = match.id and player.account_id = (select auth.uid())
        )
      )
  )
$$;

drop policy "sport_scoring_matches_read_authorized" on public.sport_scoring_matches;
create policy "sport_scoring_matches_read_authorized"
  on public.sport_scoring_matches for select to authenticated
  using ((select app_private.can_read_sport_scoring_match(id)));
drop policy "sport_scoring_events_read_authorized" on public.sport_scoring_events;
create policy "sport_scoring_events_read_authorized"
  on public.sport_scoring_events for select to authenticated
  using ((select app_private.can_read_sport_scoring_match(scoring_match_id)));
drop policy "sport_scoring_match_players_read_authorized" on public.sport_scoring_match_players;
create policy "sport_scoring_match_players_read_authorized"
  on public.sport_scoring_match_players for select to authenticated
  using ((select app_private.can_read_sport_scoring_match(scoring_match_id)));

create or replace function app_private.add_sport_scoring_match_players(
  p_scoring_match_id uuid,
  p_sport_id uuid,
  p_side_a_profile_ids uuid[],
  p_side_b_profile_ids uuid[],
  p_expected_players integer
)
returns void language plpgsql security definer set search_path = public
as $$
declare all_profile_ids uuid[] := p_side_a_profile_ids || p_side_b_profile_ids;
begin
  if cardinality(p_side_a_profile_ids) <> p_expected_players
    or cardinality(p_side_b_profile_ids) <> p_expected_players
    or cardinality(all_profile_ids) <> (
      select count(distinct profile_id) from unnest(all_profile_ids) profile_id
    ) then
    raise exception 'Choose the required number of distinct SportStage players for both sides';
  end if;

  if exists (
    select 1 from unnest(all_profile_ids) requested(profile_id)
    where not exists (
      select 1 from public.sport_profiles profile
      where profile.id = requested.profile_id
        and profile.sport_id = p_sport_id
        and profile.status = 'ACTIVE'
    )
  ) then
    raise exception 'Every player needs an active SportStage profile for this sport';
  end if;

  insert into public.sport_scoring_match_players(
    scoring_match_id, side, player_order, sport_profile_id, account_id, display_name_snapshot
  )
  select p_scoring_match_id, selected.side, selected.ordinality - 1,
    profile.id, profile.account_id, profile.display_name
  from (
    select 0::smallint as side, profile_id, ordinality
    from unnest(p_side_a_profile_ids) with ordinality requested(profile_id, ordinality)
    union all
    select 1::smallint, profile_id, ordinality
    from unnest(p_side_b_profile_ids) with ordinality requested(profile_id, ordinality)
  ) selected
  join public.sport_profiles profile on profile.id = selected.profile_id;
end;
$$;

create or replace function app_private.validate_sport_scoring_completion()
returns trigger language plpgsql security definer set search_path = public
as $$
declare selected_match public.sport_scoring_matches%rowtype;
declare winner_entry_id_value uuid;
begin
  if new.kind <> 'COMPLETED' then return new; end if;
  select * into selected_match from public.sport_scoring_matches where id = new.scoring_match_id;
  if selected_match.fixture_id is null then return new; end if;
  winner_entry_id_value := nullif(new.payload->>'winner_entry_id', '')::uuid;
  if winner_entry_id_value is null
    or winner_entry_id_value not in (selected_match.entrant_a_id, selected_match.entrant_b_id) then
    raise exception 'Competition completion must name one of the fixture entrants as winner';
  end if;
  return new;
end;
$$;

create trigger validate_sport_scoring_completion
before insert on public.sport_scoring_events
for each row execute function app_private.validate_sport_scoring_completion();

drop function if exists public.create_standalone_sport_scoring_match(text, text, jsonb, jsonb, jsonb);
drop function if exists app_private.create_standalone_sport_scoring_match(text, text, jsonb, jsonb, jsonb);

create or replace function app_private.create_standalone_sport_scoring_match(
  p_sport_code text,
  p_match_format text,
  p_side_a_profile_ids uuid[],
  p_side_b_profile_ids uuid[],
  p_rules_snapshot jsonb
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare selected_sport public.sports%rowtype;
declare match_id_value uuid;
declare normalized_format text := upper(trim(p_match_format));
declare expected_players integer;
declare side_a_names jsonb;
declare side_b_names jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  select * into selected_sport from public.sports where code = upper(trim(p_sport_code));
  if not found then raise exception 'Sport was not found'; end if;
  if not exists (
    select 1 from public.account_sports
    where account_id = (select auth.uid()) and sport_id = selected_sport.id and access_status = 'ACTIVE'
  ) then raise exception 'This sport is not available to your account'; end if;
  if normalized_format not in ('SINGLES', 'DOUBLES') or jsonb_typeof(p_rules_snapshot) <> 'object' then
    raise exception 'Invalid sport scoring match setup';
  end if;
  expected_players := case when normalized_format = 'SINGLES' then 1 else 2 end;

  select jsonb_agg(profile.display_name order by requested.ordinality)
  into side_a_names
  from unnest(p_side_a_profile_ids) with ordinality requested(profile_id, ordinality)
  join public.sport_profiles profile on profile.id = requested.profile_id;
  select jsonb_agg(profile.display_name order by requested.ordinality)
  into side_b_names
  from unnest(p_side_b_profile_ids) with ordinality requested(profile_id, ordinality)
  join public.sport_profiles profile on profile.id = requested.profile_id;

  insert into public.sport_scoring_matches(
    sport_id, match_format, side_a_players, side_b_players, rules_snapshot, created_by
  ) values (
    selected_sport.id, normalized_format, coalesce(side_a_names, '[]'::jsonb),
    coalesce(side_b_names, '[]'::jsonb), p_rules_snapshot, (select auth.uid())
  ) returning id into match_id_value;

  perform app_private.add_sport_scoring_match_players(
    match_id_value, selected_sport.id, p_side_a_profile_ids, p_side_b_profile_ids, expected_players
  );
  return match_id_value;
end;
$$;

create or replace function app_private.prepare_sport_fixture_scoring(
  p_fixture_id uuid,
  p_fixture_match_id uuid,
  p_rules_snapshot jsonb
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare selected_fixture public.sport_fixtures%rowtype;
declare selected_competition public.sport_competitions%rowtype;
declare selected_match public.sport_fixture_matches%rowtype;
declare match_id_value uuid;
declare match_format_value text;
declare expected_players integer;
declare side_a_ids uuid[];
declare side_b_ids uuid[];
declare side_a_names jsonb;
declare side_b_names jsonb;
begin
  select * into selected_fixture from public.sport_fixtures where id = p_fixture_id;
  if not found or selected_fixture.status = 'CANCELLED' then raise exception 'Fixture is unavailable'; end if;
  select * into selected_competition from public.sport_competitions where id = selected_fixture.competition_id;
  if not app_private.can_manage_sport_competition(selected_competition.id) and not exists (
    select 1 from public.sport_fixture_officials
    where fixture_id = selected_fixture.id and account_id = (select auth.uid())
  ) then raise exception 'Only an assigned official or competition manager can prepare scoring'; end if;
  if jsonb_typeof(p_rules_snapshot) <> 'object' then raise exception 'Scoring rules are required'; end if;

  if selected_competition.kind = 'TOURNAMENT' then
    select * into selected_match from public.sport_fixture_matches
    where id = p_fixture_match_id and fixture_id = selected_fixture.id;
    if not found then raise exception 'Choose a tournament rubber'; end if;
    match_format_value := selected_match.match_format;
    select array_agg(player.sport_profile_id order by player.display_order),
      jsonb_agg(player.display_name_snapshot order by player.display_order)
    into side_a_ids, side_a_names
    from public.sport_fixture_match_lineups lineup
    join public.sport_fixture_match_lineup_players player on player.lineup_id = lineup.id
    where lineup.fixture_match_id = selected_match.id
      and lineup.entry_id = selected_fixture.entrant_a_id and lineup.status = 'LOCKED';
    select array_agg(player.sport_profile_id order by player.display_order),
      jsonb_agg(player.display_name_snapshot order by player.display_order)
    into side_b_ids, side_b_names
    from public.sport_fixture_match_lineups lineup
    join public.sport_fixture_match_lineup_players player on player.lineup_id = lineup.id
    where lineup.fixture_match_id = selected_match.id
      and lineup.entry_id = selected_fixture.entrant_b_id and lineup.status = 'LOCKED';
  else
    if p_fixture_match_id is not null then raise exception 'League fixtures do not have rubbers'; end if;
    match_format_value := 'SINGLES';
    select array[player.sport_profile_id], jsonb_build_array(player.display_name_snapshot)
    into side_a_ids, side_a_names from public.sport_league_players player
    where player.entry_id = selected_fixture.entrant_a_id;
    select array[player.sport_profile_id], jsonb_build_array(player.display_name_snapshot)
    into side_b_ids, side_b_names from public.sport_league_players player
    where player.entry_id = selected_fixture.entrant_b_id;
  end if;

  expected_players := case when match_format_value = 'SINGLES' then 1 else 2 end;
  if cardinality(side_a_ids) <> expected_players or cardinality(side_b_ids) <> expected_players then
    raise exception 'Both sides need locked account-backed lineups before scoring';
  end if;

  select id into match_id_value from public.sport_scoring_matches
  where fixture_id = selected_fixture.id
    and fixture_match_id is not distinct from p_fixture_match_id;
  if match_id_value is not null then return match_id_value; end if;

  insert into public.sport_scoring_matches(
    sport_id, competition_id, fixture_id, fixture_match_id, entrant_a_id, entrant_b_id,
    match_format, side_a_players, side_b_players, rules_snapshot, created_by
  ) values (
    selected_competition.sport_id, selected_competition.id, selected_fixture.id,
    p_fixture_match_id, selected_fixture.entrant_a_id, selected_fixture.entrant_b_id,
    match_format_value, side_a_names, side_b_names, p_rules_snapshot, (select auth.uid())
  ) returning id into match_id_value;
  perform app_private.add_sport_scoring_match_players(
    match_id_value, selected_competition.sport_id, side_a_ids, side_b_ids, expected_players
  );
  perform app_private.write_sport_audit(
    selected_competition.sport_id, 'FIXTURE', selected_fixture.id, 'SPORT_SCORING_PREPARED',
    jsonb_build_object('scoring_match_id', match_id_value, 'fixture_match_id', p_fixture_match_id)
  );
  return match_id_value;
end;
$$;

create or replace function public.create_standalone_sport_scoring_match(
  p_sport_code text, p_match_format text, p_side_a_profile_ids uuid[],
  p_side_b_profile_ids uuid[], p_rules_snapshot jsonb
)
returns uuid language sql security invoker set search_path = public
as $$ select app_private.create_standalone_sport_scoring_match(
  p_sport_code, p_match_format, p_side_a_profile_ids, p_side_b_profile_ids, p_rules_snapshot
) $$;

create or replace function public.prepare_sport_fixture_scoring(
  p_fixture_id uuid, p_fixture_match_id uuid, p_rules_snapshot jsonb
)
returns uuid language sql security invoker set search_path = public
as $$ select app_private.prepare_sport_fixture_scoring(p_fixture_id, p_fixture_match_id, p_rules_snapshot) $$;

revoke all on function app_private.add_sport_scoring_match_players(uuid, uuid, uuid[], uuid[], integer),
  app_private.can_read_sport_scoring_match(uuid),
  app_private.validate_sport_scoring_completion(),
  app_private.create_standalone_sport_scoring_match(text, text, uuid[], uuid[], jsonb),
  app_private.prepare_sport_fixture_scoring(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_standalone_sport_scoring_match(text, text, uuid[], uuid[], jsonb),
  public.prepare_sport_fixture_scoring(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_standalone_sport_scoring_match(text, text, uuid[], uuid[], jsonb),
  public.prepare_sport_fixture_scoring(uuid, uuid, jsonb) to authenticated;

-- Explicitly restore every implemented non-cricket sport and cloud surface.
update public.sports
set availability_status = 'AVAILABLE',
    app_route = case code
      when 'BADMINTON' then '/badminton'
      when 'TENNIS' then '/tennis'
      when 'PADEL' then '/padel'
      when 'TABLE_TENNIS' then '/table-tennis'
      when 'PICKLEBALL' then '/pickleball'
    end,
    updated_at = now()
where code in ('BADMINTON', 'TENNIS', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL');

update public.account_sports account_sport
set access_status = 'ACTIVE', updated_at = now()
from public.sports sport
where sport.id = account_sport.sport_id
  and sport.code in ('BADMINTON', 'TENNIS', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL')
  and account_sport.access_status = 'COMING_SOON';

update public.sport_feature_flags
set enabled = true, rollout_percentage = 100, updated_at = now()
where feature_key = 'cloud_competitions'
  and sport_id in (
    select id from public.sports
    where code in ('BADMINTON', 'TENNIS', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL')
  );

update public.sport_feature_flags
set enabled = true, rollout_percentage = 100, updated_at = now()
where feature_key in ('offline_scoring', 'public_live', 'follows_and_insights')
  and sport_id is null;

update public.sport_rollout_plans plan
set current_stage = 100, updated_at = now()
from public.sports sport
where sport.id = plan.sport_id
  and sport.code in ('BADMINTON', 'TENNIS', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL')
  and plan.feature_key in ('cloud_competitions', 'offline_scoring', 'public_live', 'follows_and_insights');

do $$
begin
  if (
    select count(*)
    from public.sports
    where code in ('BADMINTON', 'TENNIS', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL')
      and availability_status = 'AVAILABLE'
      and app_route is not null
  ) <> 5 then
    raise exception 'One or more implemented non-cricket sports remain unavailable';
  end if;

  if (
    select count(*)
    from public.sport_feature_flags flag
    join public.sports sport on sport.id = flag.sport_id
    where flag.feature_key = 'cloud_competitions'
      and sport.code in ('BADMINTON', 'TENNIS', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL')
      and flag.enabled
      and flag.rollout_percentage = 100
  ) <> 5 then
    raise exception 'Cloud competitions are not fully active for every implemented non-cricket sport';
  end if;

  if (
    select count(*)
    from public.sport_feature_flags
    where feature_key in ('offline_scoring', 'public_live', 'follows_and_insights')
      and sport_id is null
      and enabled
      and rollout_percentage = 100
  ) <> 3 then
    raise exception 'One or more shared non-cricket sport surfaces remain disabled';
  end if;
end;
$$;
