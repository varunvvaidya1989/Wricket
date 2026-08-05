create policy "tournament_media_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'tournament-media'
  and owner_id = (select auth.uid())::text
);

create policy "moment_objects_delete_tournament_owner"
on storage.objects for delete to authenticated
using (
  bucket_id = 'match-moments'
  and exists (
    select 1
    from public.moment_media media
    join public.match_moments moment on moment.id = media.moment_id
    join public.tournaments tournament on tournament.id = moment.tournament_id
    where media.storage_path = name
      and tournament.created_by = (select auth.uid())
  )
);

create or replace function app_private.list_owned_tournament_media_paths(p_tournament_id uuid)
returns table(storage_path text)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tournaments tournament
    where tournament.id = p_tournament_id
      and tournament.created_by = (select auth.uid())
  ) then raise exception 'Only the tournament owner can delete tournament media'; end if;

  return query
  select media.storage_path
  from public.moment_media media
  join public.match_moments moment on moment.id = media.moment_id
  where moment.tournament_id = p_tournament_id;
end;
$$;

create or replace function app_private.delete_owned_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare selected_match_ids uuid[];
declare selected_team_ids uuid[];
begin
  if not exists (
    select 1 from public.tournaments tournament
    where tournament.id = p_tournament_id
      and tournament.created_by = (select auth.uid())
  ) then raise exception 'Only the tournament owner can delete this tournament'; end if;

  select coalesce(array_agg(match.id), '{}'::uuid[]) into selected_match_ids
  from public.matches match where match.tournament_id = p_tournament_id;
  select coalesce(array_agg(team.id), '{}'::uuid[]) into selected_team_ids
  from public.teams team where team.tournament_id = p_tournament_id;

  delete from public.audit_logs
  where (entity_type = 'TOURNAMENT' and entity_id = p_tournament_id)
     or (entity_type = 'MATCH' and entity_id = any(selected_match_ids))
     or (entity_type = 'TEAM' and entity_id = any(selected_team_ids));

  -- Remove restrictive team references in a deterministic order. Match events,
  -- snapshots, live scoring leases, XIs, innings and MVP data cascade from matches.
  delete from public.fixture_stages where tournament_id = p_tournament_id;
  delete from public.matches where tournament_id = p_tournament_id;
  delete from public.teams where tournament_id = p_tournament_id;
  delete from public.tournaments where id = p_tournament_id;
end;
$$;

create or replace function public.list_owned_tournament_media_paths(p_tournament_id uuid)
returns table(storage_path text)
language sql security invoker set search_path = public
as $$ select * from app_private.list_owned_tournament_media_paths(p_tournament_id) $$;

create or replace function public.delete_owned_tournament(p_tournament_id uuid)
returns void
language sql security invoker set search_path = public
as $$ select app_private.delete_owned_tournament(p_tournament_id) $$;

revoke all on function app_private.list_owned_tournament_media_paths(uuid) from public, anon;
revoke all on function app_private.delete_owned_tournament(uuid) from public, anon;
revoke all on function public.list_owned_tournament_media_paths(uuid) from public, anon;
revoke all on function public.delete_owned_tournament(uuid) from public, anon;
grant execute on function app_private.list_owned_tournament_media_paths(uuid) to authenticated;
grant execute on function app_private.delete_owned_tournament(uuid) to authenticated;
grant execute on function public.list_owned_tournament_media_paths(uuid) to authenticated;
grant execute on function public.delete_owned_tournament(uuid) to authenticated;
