begin;

do $$
declare
  target_account constant uuid := 'e9b888ec-f819-4ae1-b6af-914b8613ca4e';
  marker constant text := 'non_cricket_demo_2026_v1';
begin
  if not exists (select 1 from public.profiles where id = target_account) then
    raise exception 'Target production account was not found';
  end if;

  create temporary table _demo_competitions(id uuid primary key) on commit drop;
  create temporary table _demo_matches(id uuid primary key) on commit drop;
  create temporary table _demo_clubs(id uuid primary key) on commit drop;
  create temporary table _demo_fixtures(id uuid primary key) on commit drop;
  create temporary table _demo_accounts(id uuid primary key) on commit drop;

  insert into _demo_accounts
  select id from auth.users where raw_app_meta_data ->> 'mock_seed_batch' = marker;

  insert into _demo_competitions
  select id from public.sport_competitions
  where owner_account_id = target_account
    and (
      rules ->> 'mock_seed_batch' = marker
      or description like '%[SportStage demo:' || marker || ']%'
    );

  insert into _demo_matches
  select distinct match.id
  from public.sport_scoring_matches match
  left join public.sport_scoring_match_players player on player.scoring_match_id = match.id
  where (match.created_by = target_account and match.rules_snapshot ->> 'mock_seed_batch' = marker)
     or player.account_id in (select id from _demo_accounts);

  insert into _demo_clubs
  select id from public.sport_clubs
  where owner_account_id = target_account and short_name = 'SSD1';

  insert into _demo_fixtures
  select id from public.sport_fixtures
  where competition_id in (select id from _demo_competitions);

  delete from public.sport_notifications
  where resource_id in (select id from _demo_competitions)
     or resource_id in (select id from _demo_matches)
     or account_id in (select id from _demo_accounts);
  delete from public.sport_follows
  where resource_id in (select id from _demo_competitions)
     or resource_id in (select id from _demo_matches)
     or account_id in (select id from _demo_accounts);
  delete from public.sport_operational_events
  where resource_id in (select id from _demo_competitions)
     or resource_id in (select id from _demo_matches)
     or actor_account_id in (select id from _demo_accounts);
  delete from public.sport_audit_events
  where resource_id in (select id from _demo_competitions)
     or resource_id in (select id from _demo_fixtures)
     or actor_account_id in (select id from _demo_accounts)
     or payload ->> 'mock_seed_batch' = marker;
  delete from public.sportstage_upcoming_snapshots
  where competition_id in (select id from _demo_competitions)
     or source_id in (select id from _demo_fixtures);
  delete from public.sport_public_live_snapshots
  where scoring_match_id in (select id from _demo_matches);
  delete from public.sport_fixture_results
  where competition_id in (select id from _demo_competitions)
     or scoring_match_id in (select id from _demo_matches);
  delete from public.sport_fixture_match_results
  where competition_id in (select id from _demo_competitions);
  delete from public.sport_scoring_matches where id in (select id from _demo_matches);
  delete from public.sport_competitions where id in (select id from _demo_competitions);
  delete from public.sport_team_memberships
  where team_id in (select team.id from public.sport_teams team where team.club_id in (select id from _demo_clubs));
  delete from public.sport_clubs where id in (select id from _demo_clubs);
  if exists (
    select 1 from storage.objects object
    where (storage.foldername(object.name))[1] in (select id::text from _demo_accounts)
  ) then
    raise exception 'Mock accounts unexpectedly own storage objects; remove them through the Storage API before cleanup';
  end if;
  alter table public.profiles disable trigger delete_profile_avatar_media_before_profile;
  delete from auth.users where id in (select id from _demo_accounts);
  alter table public.profiles enable trigger delete_profile_avatar_media_before_profile;
end
$$;

select jsonb_build_object(
  'batch', 'non_cricket_demo_2026_v1',
  'remaining_competitions', (select count(*) from public.sport_competitions where rules ->> 'mock_seed_batch' = 'non_cricket_demo_2026_v1'),
  'remaining_matches', (select count(*) from public.sport_scoring_matches where rules_snapshot ->> 'mock_seed_batch' = 'non_cricket_demo_2026_v1'),
  'remaining_mock_accounts', (select count(*) from auth.users where raw_app_meta_data ->> 'mock_seed_batch' = 'non_cricket_demo_2026_v1')
) as cleanup_result;

commit;
