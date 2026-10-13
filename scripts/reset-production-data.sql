-- Wipes every user-generated row in production except one retained account.
-- Run only through scripts/reset-production-data.mjs, which substitutes the
-- placeholders, empties Storage first, and swaps COMMIT for ROLLBACK on dry runs.
begin;

do $$
declare
  keep_account constant uuid := '__KEEP_ACCOUNT_ID__';
  enforce_empty_storage constant boolean := __ENFORCE_EMPTY_STORAGE__;
  -- Reference/config tables seeded by migrations, plus the retained account's
  -- own identity rows (other accounts' rows go with the auth.users cascade).
  preserved_tables constant text[] := array[
    'public.sports',
    'public.sport_feature_flags',
    'public.sport_retention_policies',
    'public.sport_rollout_plans',
    'public.profiles',
    'public.account_sports',
    'public.sport_profiles'
  ];
  truncate_targets text;
  leftover_objects bigint;
begin
  if not exists (select 1 from auth.users where id = keep_account) then
    raise exception 'Retained account % was not found', keep_account;
  end if;

  select count(*) into leftover_objects
  from storage.objects object
  where not (object.bucket_id = 'profile-media'
             and (storage.foldername(object.name))[1] = keep_account::text);
  if enforce_empty_storage and leftover_objects > 0 then
    raise exception '% storage objects remain; remove them through the Storage API first', leftover_objects;
  end if;

  -- Enumerate tables dynamically so tables added by later migrations are wiped too.
  -- No CASCADE: if a preserved table references a wiped one, this fails loudly.
  select string_agg(format('%I.%I', schemaname, tablename), ', ' order by schemaname, tablename)
  into truncate_targets
  from pg_tables
  where schemaname in ('public', 'app_private')
    and (schemaname || '.' || tablename) <> all (preserved_tables);

  execute 'truncate table ' || truncate_targets || ' restart identity';

  -- Storage was emptied above (or this is a rolled-back dry run), so the
  -- avatar guard trigger has nothing to protect.
  alter table public.profiles disable trigger delete_profile_avatar_media_before_profile;
  delete from auth.users where id <> keep_account;
  alter table public.profiles enable trigger delete_profile_avatar_media_before_profile;
end
$$;

select jsonb_build_object(
  'retained_account', '__KEEP_ACCOUNT_ID__',
  'auth_users', (select count(*) from auth.users),
  'profiles', (select count(*) from public.profiles),
  'tournaments', (select count(*) from public.tournaments),
  'matches', (select count(*) from public.matches),
  'players', (select count(*) from public.players),
  'sport_competitions', (select count(*) from public.sport_competitions),
  'sport_scoring_matches', (select count(*) from public.sport_scoring_matches),
  'sports', (select count(*) from public.sports),
  'sport_feature_flags', (select count(*) from public.sport_feature_flags)
) as reset_result;

commit;
