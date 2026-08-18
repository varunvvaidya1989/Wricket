begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

select is(
  (select count(*) from public.sport_feature_flags flag
   join public.sports sport on sport.id = flag.sport_id
   where flag.feature_key = 'cloud_competitions'
     and sport.code in ('TENNIS', 'BADMINTON', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL')),
  5::bigint,
  'every supported non-cricket sport has a cloud competition flag');

select is(
  (select count(*) from public.sport_feature_flags flag
   join public.sports sport on sport.id = flag.sport_id
   where flag.feature_key = 'cloud_competitions'
     and sport.code in ('TENNIS', 'BADMINTON', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL')
     and not flag.enabled and flag.rollout_percentage = 0),
  5::bigint,
  'every supported cloud competition rollout is disabled at zero percent');

select is((select enabled from public.sport_feature_flags flag join public.sports sport on sport.id = flag.sport_id where flag.feature_key = 'cloud_competitions' and sport.code = 'TENNIS'), false, 'tennis rollout is disabled');
select is((select enabled from public.sport_feature_flags flag join public.sports sport on sport.id = flag.sport_id where flag.feature_key = 'cloud_competitions' and sport.code = 'BADMINTON'), false, 'badminton rollout is disabled');
select is((select enabled from public.sport_feature_flags flag join public.sports sport on sport.id = flag.sport_id where flag.feature_key = 'cloud_competitions' and sport.code = 'PADEL'), false, 'padel rollout is disabled');
select is((select enabled from public.sport_feature_flags flag join public.sports sport on sport.id = flag.sport_id where flag.feature_key = 'cloud_competitions' and sport.code = 'TABLE_TENNIS'), false, 'table tennis rollout is disabled');
select is((select enabled from public.sport_feature_flags flag join public.sports sport on sport.id = flag.sport_id where flag.feature_key = 'cloud_competitions' and sport.code = 'PICKLEBALL'), false, 'pickleball rollout is disabled');

select * from finish();
rollback;
