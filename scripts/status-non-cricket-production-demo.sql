select jsonb_build_object(
  'batch', 'non_cricket_demo_2026_v1',
  'target_account', 'e9b888ec-f819-4ae1-b6af-914b8613ca4e',
  'sports', (
    with competition_coverage as (
      select sport_id, count(*) competition_count,
        count(*) filter (where lifecycle = 'LIVE') live_count,
        count(*) filter (where lifecycle = 'COMPLETED') completed_count,
        count(*) filter (where kind = 'LEAGUE') league_count
      from public.sport_competitions
      where owner_account_id = 'e9b888ec-f819-4ae1-b6af-914b8613ca4e'
        and rules ->> 'mock_seed_batch' = 'non_cricket_demo_2026_v1'
      group by sport_id
    ), match_coverage as (
      select match.sport_id, count(distinct match.id) match_count,
        count(distinct match.id) filter (where match.status = 'LIVE') live_match_count,
        count(distinct match.id) filter (where match.status = 'COMPLETED') completed_match_count,
        count(event.id) event_count
      from public.sport_scoring_matches match
      left join public.sport_scoring_events event on event.scoring_match_id = match.id
      where match.created_by = 'e9b888ec-f819-4ae1-b6af-914b8613ca4e'
        and match.rules_snapshot ->> 'mock_seed_batch' = 'non_cricket_demo_2026_v1'
      group by match.sport_id
    )
    select jsonb_object_agg(sport.code, jsonb_build_object(
      'competitions', coalesce(competition.competition_count, 0),
      'live_competitions', coalesce(competition.live_count, 0),
      'completed_competitions', coalesce(competition.completed_count, 0),
      'leagues', coalesce(competition.league_count, 0),
      'matches', coalesce(match.match_count, 0),
      'live_matches', coalesce(match.live_match_count, 0),
      'completed_matches', coalesce(match.completed_match_count, 0),
      'events', coalesce(match.event_count, 0)
    ))
    from public.sports sport
    left join competition_coverage competition on competition.sport_id = sport.id
    left join match_coverage match on match.sport_id = sport.id
    where sport.code in ('TENNIS','BADMINTON','PADEL','TABLE_TENNIS','PICKLEBALL')
  ),
  'mock_accounts', (
    select count(*) from auth.users
    where raw_app_meta_data ->> 'mock_seed_batch' = 'non_cricket_demo_2026_v1'
  )
) as demo_status;
