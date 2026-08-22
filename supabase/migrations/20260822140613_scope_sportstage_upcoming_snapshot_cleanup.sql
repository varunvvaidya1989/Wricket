create or replace function app_private.rebuild_sportstage_upcoming_snapshots()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The API session protects unqualified deletes, including those in triggers.
  delete from public.sportstage_upcoming_snapshots where discovery_id is not null;

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
