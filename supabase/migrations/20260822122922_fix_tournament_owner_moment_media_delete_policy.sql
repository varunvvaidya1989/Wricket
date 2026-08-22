-- The prior policy's unqualified `name` bound to the joined tournaments table,
-- so owners could only remove a moment asset when its path matched the tournament name.
drop policy if exists "moment_objects_delete_tournament_owner" on storage.objects;

create policy "moment_objects_delete_tournament_owner"
on storage.objects for delete to authenticated
using (
  bucket_id = 'match-moments'
  and exists (
    select 1
    from public.moment_media media
    join public.match_moments moment on moment.id = media.moment_id
    join public.tournaments tournament on tournament.id = moment.tournament_id
    where media.storage_path = objects.name
      and tournament.created_by = (select auth.uid())
  )
);
