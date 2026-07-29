alter table public.tournaments add column start_at timestamptz;
alter table public.tournaments add column planned_team_count integer;
alter table public.tournaments add column players_per_team integer;
alter table public.tournaments add column description text;
alter table public.tournaments add column social_media_url text;
alter table public.tournaments add column organizer_phone text;
alter table public.tournaments add column banner_url text;
alter table public.tournaments add column logo_url text;

alter table public.tournaments
  add constraint tournaments_planned_team_count_check
  check (planned_team_count between 2 and 64);

alter table public.tournaments
  add constraint tournaments_players_per_team_check
  check (players_per_team between 2 and 25);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tournament-media',
  'tournament-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "tournament_media_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'tournament-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "tournament_media_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'tournament-media'
  and owner_id = (select auth.uid()::text)
);

create policy "tournament_media_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'tournament-media'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'tournament-media'
  and owner_id = (select auth.uid()::text)
);
