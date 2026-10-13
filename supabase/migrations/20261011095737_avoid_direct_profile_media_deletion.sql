-- Storage metadata must never be deleted directly: that leaves orphaned files
-- and the platform now rejects even a DELETE that would affect zero rows.
-- A server deleting an account with media must remove its files via Storage API first.
create or replace function app_private.delete_profile_avatar_media()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from storage.objects where bucket_id='profile-media'
    and (storage.foldername(name))[1]=old.id::text) then
    raise exception 'Remove profile media through the Storage API before deleting this account';
  end if;
  return old;
end $$;
revoke all on function app_private.delete_profile_avatar_media() from public,anon,authenticated;
