-- Upcoming discovery shared by cricket and the five racket sports.

create table public.sportstage_upcoming_snapshots (
  discovery_id text primary key,
  source_kind text not null check (source_kind in ('CRICKET_MATCH', 'SPORT_FIXTURE')),
  source_id uuid not null,
  sport_id uuid not null references public.sports(id) on delete restrict,
  sport_code text not null,
  competition_id uuid not null,
  competition_name text not null,
  participant_a text not null,
  participant_b text not null,
  match_format text not null,
  scheduled_at timestamptz not null,
  venue text,
  share_slug text not null unique,
  refreshed_at timestamptz not null default now()
);

create index sportstage_upcoming_schedule_idx
  on public.sportstage_upcoming_snapshots(scheduled_at, sport_code);

alter table public.sportstage_upcoming_snapshots enable row level security;
create policy "sportstage_upcoming_snapshots_read"
  on public.sportstage_upcoming_snapshots
  for select
  to anon, authenticated
  using (true);

revoke all on public.sportstage_upcoming_snapshots from public, anon, authenticated;
grant select on public.sportstage_upcoming_snapshots to anon, authenticated;

create or replace function app_private.rebuild_sportstage_upcoming_snapshots()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.sportstage_upcoming_snapshots;

  insert into public.sportstage_upcoming_snapshots(
    discovery_id, source_kind, source_id, sport_id, sport_code,
    competition_id, competition_name, participant_a, participant_b,
    match_format, scheduled_at, venue, share_slug, refreshed_at
  )
  select
    'sport:' || fixture.id::text,
    'SPORT_FIXTURE',
    fixture.id,
    competition.sport_id,
    sport.code,
    competition.id,
    competition.name,
    coalesce(squad_a.name_snapshot, player_a.display_name_snapshot, entry_a.snapshot->>'name', 'Entrant'),
    coalesce(squad_b.name_snapshot, player_b.display_name_snapshot, entry_b.snapshot->>'name', 'Entrant'),
    competition.match_format,
    fixture.scheduled_at,
    coalesce(venue.name, fixture.court),
    lower(sport.code) || '-fixture-' || replace(fixture.id::text, '-', ''),
    now()
  from public.sport_fixtures as fixture
  join public.sport_competitions as competition on competition.id = fixture.competition_id
  join public.sports as sport on sport.id = competition.sport_id
  join public.sport_competition_entries as entry_a on entry_a.id = fixture.entrant_a_id
  join public.sport_competition_entries as entry_b on entry_b.id = fixture.entrant_b_id
  left join public.sport_tournament_squads as squad_a on squad_a.entry_id = entry_a.id
  left join public.sport_tournament_squads as squad_b on squad_b.entry_id = entry_b.id
  left join public.sport_league_players as player_a on player_a.entry_id = entry_a.id
  left join public.sport_league_players as player_b on player_b.entry_id = entry_b.id
  left join public.sport_competition_venues as venue on venue.id = fixture.venue_id
  where competition.visibility = 'PUBLIC'
    and competition.lifecycle in ('PUBLISHED', 'LIVE')
    and fixture.status = 'SCHEDULED'
    and fixture.scheduled_at > now()
    and sport.code in ('TENNIS', 'BADMINTON', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL');

  insert into public.sportstage_upcoming_snapshots(
    discovery_id, source_kind, source_id, sport_id, sport_code,
    competition_id, competition_name, participant_a, participant_b,
    match_format, scheduled_at, venue, share_slug, refreshed_at
  )
  select
    'cricket:' || match.id::text,
    'CRICKET_MATCH',
    match.id,
    sport.id,
    sport.code,
    coalesce(match.tournament_id, match.id),
    coalesce(tournament.name, 'Friendly match'),
    team_a.name,
    team_b.name,
    match.format,
    match.scheduled_at,
    coalesce(match.venue, match.field_name),
    'cricket-upcoming-' || replace(match.id::text, '-', ''),
    now()
  from public.matches as match
  join public.teams as team_a on team_a.id = match.team_a_id
  join public.teams as team_b on team_b.id = match.team_b_id
  join public.sports as sport on sport.code = 'CRICKET'
  left join public.tournaments as tournament on tournament.id = match.tournament_id
  where match.visibility = 'PUBLIC'
    and match.status = 'SCHEDULED'
    and match.scheduled_at > now()
    and (match.tournament_id is null or tournament.visibility = 'PUBLIC');
end;
$$;

create or replace function app_private.rebuild_sportstage_upcoming_snapshots_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.rebuild_sportstage_upcoming_snapshots();
  return null;
end;
$$;

create trigger sportstage_upcoming_sport_fixture_changed
after insert or update or delete on public.sport_fixtures
for each statement execute function app_private.rebuild_sportstage_upcoming_snapshots_trigger();
create trigger sportstage_upcoming_sport_competition_changed
after update on public.sport_competitions
for each statement execute function app_private.rebuild_sportstage_upcoming_snapshots_trigger();
create trigger sportstage_upcoming_sport_entry_changed
after update on public.sport_competition_entries
for each statement execute function app_private.rebuild_sportstage_upcoming_snapshots_trigger();
create trigger sportstage_upcoming_squad_changed
after insert or update or delete on public.sport_tournament_squads
for each statement execute function app_private.rebuild_sportstage_upcoming_snapshots_trigger();
create trigger sportstage_upcoming_league_player_changed
after insert or update or delete on public.sport_league_players
for each statement execute function app_private.rebuild_sportstage_upcoming_snapshots_trigger();
create trigger sportstage_upcoming_cricket_match_changed
after insert or update or delete on public.matches
for each statement execute function app_private.rebuild_sportstage_upcoming_snapshots_trigger();
create trigger sportstage_upcoming_cricket_team_changed
after update on public.teams
for each statement execute function app_private.rebuild_sportstage_upcoming_snapshots_trigger();
create trigger sportstage_upcoming_cricket_tournament_changed
after update on public.tournaments
for each statement execute function app_private.rebuild_sportstage_upcoming_snapshots_trigger();

create or replace function public.discover_sportstage_upcoming(
  p_limit integer default 30,
  p_sport_code text default null
)
returns setof public.sportstage_upcoming_snapshots
language sql
stable
security invoker
set search_path = ''
as $$
  select snapshot.*
  from public.sportstage_upcoming_snapshots as snapshot
  where snapshot.scheduled_at > now()
    and (p_sport_code is null or snapshot.sport_code = upper(trim(p_sport_code)))
  order by snapshot.scheduled_at, snapshot.discovery_id
  limit least(greatest(p_limit, 1), 50)
$$;

revoke all on function app_private.rebuild_sportstage_upcoming_snapshots(),
  app_private.rebuild_sportstage_upcoming_snapshots_trigger()
from public, anon, authenticated;
revoke all on function public.discover_sportstage_upcoming(integer, text)
from public, anon, authenticated;
grant execute on function public.discover_sportstage_upcoming(integer, text)
to anon, authenticated;

create or replace function app_private.list_my_sport_following_feed(
  p_limit integer default 30,
  p_before timestamptz default null
)
returns setof public.sport_public_live_snapshots
language sql
stable
security definer
set search_path = ''
as $$
  select snapshot.*
  from public.sport_public_live_snapshots as snapshot
  join public.sport_scoring_matches as scoring_match on scoring_match.id = snapshot.scoring_match_id
  where (p_before is null or snapshot.refreshed_at < p_before)
    and snapshot.status = 'LIVE'
    and (
      exists (
        select 1 from public.sport_follows as follow
        where follow.account_id = (select auth.uid())
          and follow.resource_type = 'MATCH'
          and follow.resource_id = snapshot.scoring_match_id
      )
      or exists (
        select 1 from public.sport_follows as follow
        where follow.account_id = (select auth.uid())
          and follow.resource_type = 'COMPETITION'
          and follow.resource_id = snapshot.competition_id
      )
      or exists (
        select 1
        from public.sport_follows as follow
        join public.sport_tournament_squads as squad on squad.source_team_id = follow.resource_id
        where follow.account_id = (select auth.uid())
          and follow.resource_type = 'TEAM'
          and squad.entry_id in (scoring_match.entrant_a_id, scoring_match.entrant_b_id)
      )
      or exists (
        select 1
        from public.sport_follows as follow
        join public.sport_teams as team on team.club_id = follow.resource_id
        join public.sport_tournament_squads as squad on squad.source_team_id = team.id
        where follow.account_id = (select auth.uid())
          and follow.resource_type = 'CLUB'
          and squad.entry_id in (scoring_match.entrant_a_id, scoring_match.entrant_b_id)
      )
      or exists (
        select 1
        from public.sport_follows as follow
        where follow.account_id = (select auth.uid())
          and follow.resource_type = 'PLAYER'
          and (
            exists (
              select 1 from public.sport_league_players as player
              where player.sport_profile_id = follow.resource_id
                and player.entry_id in (scoring_match.entrant_a_id, scoring_match.entrant_b_id)
            )
            or exists (
              select 1
              from public.sport_tournament_squads as squad
              join public.sport_squad_members as member on member.squad_entry_id = squad.entry_id
              where member.sport_profile_id = follow.resource_id
                and squad.entry_id in (scoring_match.entrant_a_id, scoring_match.entrant_b_id)
            )
          )
      )
    )
  order by snapshot.refreshed_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

select app_private.rebuild_sportstage_upcoming_snapshots();
