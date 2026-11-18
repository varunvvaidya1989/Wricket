-- Keep shared sport history and ownership intact. Automatic deletion is only
-- available once restrictive references have been resolved through their
-- existing management flows. Check before removing any media.
create function app_private.assert_account_deletion_ready(p_confirmation text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  account_id_value uuid := auth.uid();
  reference_record record;
  has_reference boolean;
begin
  if account_id_value is null or not exists (
    select 1 from public.profiles where id = account_id_value
  ) then raise exception 'ACCOUNT_DELETION_SIGN_IN'; end if;
  if p_confirmation is distinct from 'DELETE' then
    raise exception 'ACCOUNT_DELETION_CONFIRMATION';
  end if;

  -- Inspect actual FK constraints, including future restrictive references.
  -- Identifiers originate from pg_catalog; only the current uid is a value.
  for reference_record in
    select namespace.nspname as schema_name, relation.relname as table_name,
      attribute.attname as column_name, constraint_record.confrelid as target
    from pg_catalog.pg_constraint constraint_record
    join pg_catalog.pg_class relation on relation.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attnum = constraint_record.conkey[1]
    where constraint_record.contype = 'f'
      and constraint_record.confdeltype in ('r', 'a')
      and cardinality(constraint_record.conkey) = 1
      and namespace.nspname = 'public'
      and constraint_record.confrelid in ('public.profiles'::regclass, 'public.sport_profiles'::regclass)
      and relation.relname not in ('tournaments', 'match_moments', 'moment_comments', 'tournament_scorers')
  loop
    if reference_record.target = 'public.profiles'::regclass then
      execute format('select exists(select 1 from %I.%I where %I = $1)',
        reference_record.schema_name, reference_record.table_name, reference_record.column_name)
        into has_reference using account_id_value;
    else
      execute format('select exists(select 1 from %I.%I record join public.sport_profiles profile on profile.id = record.%I where profile.account_id = $1)',
        reference_record.schema_name, reference_record.table_name, reference_record.column_name)
        into has_reference using account_id_value;
    end if;
    if has_reference then raise exception 'ACCOUNT_DELETION_SHARED_RECORDS'; end if;
  end loop;

  -- A sponsor logo cannot be removed until its existing sponsor record has
  -- been unlinked. Never bypass the Storage policy or remove another asset.
  if exists (
    select 1 from storage.objects object
    join public.tournament_sponsors sponsor on sponsor.logo_path = object.name
    where object.bucket_id = 'sponsor-logos' and object.owner_id = account_id_value::text
  ) then raise exception 'ACCOUNT_DELETION_SPONSOR_MEDIA'; end if;
end $$;
revoke all on function app_private.assert_account_deletion_ready(text) from public, anon, authenticated;

create function app_private.list_my_account_deletion_media(p_confirmation text)
returns table(bucket_id text, storage_path text)
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.assert_account_deletion_ready(p_confirmation);
  return query
    select object.bucket_id, object.name from storage.objects object
    where object.owner_id = auth.uid()::text
      or (object.bucket_id = 'profile-media' and (storage.foldername(object.name))[1] = auth.uid()::text)
      or (object.bucket_id = 'match-moments' and exists (
        select 1 from public.moment_media media
        join public.match_moments moment on moment.id = media.moment_id
        left join public.tournaments tournament on tournament.id = moment.tournament_id
        where media.storage_path = object.name
          and (moment.author_id = auth.uid() or tournament.created_by = auth.uid())
      ))
    order by object.bucket_id, object.name;
end $$;

create function public.list_my_account_deletion_media(p_confirmation text)
returns table(bucket_id text, storage_path text)
language sql security invoker set search_path = '' as $$
  select * from app_private.list_my_account_deletion_media(p_confirmation)
$$;
revoke all on function app_private.list_my_account_deletion_media(text) from public, anon;
revoke all on function public.list_my_account_deletion_media(text) from public, anon;
grant execute on function app_private.list_my_account_deletion_media(text) to authenticated;
grant execute on function public.list_my_account_deletion_media(text) to authenticated;

create or replace function app_private.delete_my_sportstage_account(p_confirmation text)
returns void language plpgsql security definer set search_path = '' as $$
declare account_id_value uuid := auth.uid();
declare tournament_record record;
begin
  perform app_private.assert_account_deletion_ready(p_confirmation);
  -- The API removes actual files. This read-only guard catches denied removals,
  -- truncated manifests and uploads racing with the deletion request.
  if exists (select 1 from app_private.list_my_account_deletion_media(p_confirmation)) then
    raise exception 'ACCOUNT_DELETION_MEDIA_REMAINS';
  end if;
  for tournament_record in select id from public.tournaments where created_by = account_id_value loop
    perform app_private.delete_owned_tournament(tournament_record.id);
  end loop;
  delete from public.moment_comments where author_id = account_id_value;
  delete from public.match_moments where author_id = account_id_value;
  delete from public.tournament_scorers where assigned_by = account_id_value;
  delete from auth.users where id = account_id_value;
end $$;
revoke all on function app_private.delete_my_sportstage_account(text) from public, anon;
grant execute on function app_private.delete_my_sportstage_account(text) to authenticated;

-- A deleted account's still-unexpired JWT must not recreate Storage files.
-- Restrictive policies combine with existing bucket-specific permissions.
create policy account_required_for_storage on storage.objects as restrictive
for all to authenticated
using (exists (select 1 from public.profiles where id = (select auth.uid())))
with check (exists (select 1 from public.profiles where id = (select auth.uid())));
