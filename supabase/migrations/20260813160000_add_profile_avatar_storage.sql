insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media',
  'profile-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "profile_media_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "profile_media_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-media'
  and owner_id = (select auth.uid()::text)
);

create policy "profile_media_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-media'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'profile-media'
  and owner_id = (select auth.uid()::text)
);

create policy "profile_media_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-media'
  and owner_id = (select auth.uid()::text)
);

create or replace function app_private.delete_profile_avatar_media()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  delete from storage.objects
  where bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = old.id::text;
  return old;
end;
$$;

create trigger delete_profile_avatar_media_before_profile
before delete on public.profiles
for each row execute function app_private.delete_profile_avatar_media();

revoke all on function app_private.delete_profile_avatar_media() from public, anon, authenticated;
