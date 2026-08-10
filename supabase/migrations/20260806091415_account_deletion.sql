create or replace function app_private.delete_my_sportstage_account(p_confirmation text)
returns void
language plpgsql security definer set search_path = public, auth, storage
as $$
declare account_id_value uuid := (select auth.uid());
declare tournament_record record;
begin
  if account_id_value is null then raise exception 'Authentication is required'; end if;
  if p_confirmation <> 'DELETE' then raise exception 'Type DELETE to confirm account deletion'; end if;

  -- Owned tournaments carry the bulk of account-owned data and media. Reuse
  -- the existing audited cascade so matches, scores and fixtures are removed.
  for tournament_record in
    select id from public.tournaments where created_by = account_id_value
  loop
    perform app_private.delete_owned_tournament(tournament_record.id);
  end loop;

  -- Remove files belonging to social posts authored in tournaments owned by
  -- other people before deleting their database records.
  delete from storage.objects object
  using public.moment_media media, public.match_moments moment
  where media.storage_path = object.name
    and media.moment_id = moment.id
    and moment.author_id = account_id_value;
  delete from public.moment_comments where author_id = account_id_value;
  delete from public.match_moments where author_id = account_id_value;

  -- These rows use restrictive creator references and must be removed before
  -- the profile/Auth cascade can complete.
  delete from public.tournament_scorers where assigned_by = account_id_value;

  -- auth.users -> profiles cascades memberships, follows, player account
  -- links, claims and other account-scoped rows according to their FKs.
  delete from auth.users where id = account_id_value;
end;
$$;

create or replace function public.delete_my_sportstage_account(p_confirmation text)
returns void language sql security invoker set search_path = public
as $$ select app_private.delete_my_sportstage_account(p_confirmation) $$;

revoke all on function app_private.delete_my_sportstage_account(text) from public, anon;
revoke all on function public.delete_my_sportstage_account(text) from public, anon;
grant execute on function app_private.delete_my_sportstage_account(text) to authenticated;
grant execute on function public.delete_my_sportstage_account(text) to authenticated;
