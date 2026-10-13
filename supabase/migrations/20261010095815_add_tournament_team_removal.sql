-- Keep tournament membership references consistent, including direct RLS deletes.
create or replace function app_private.guard_tournament_team_removal()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.tournament_id is null then return old; end if;
  if exists (select 1 from public.matches where team_a_id = old.id or team_b_id = old.id)
    or exists (select 1 from public.fixture_matches where team_a_id = old.id or team_b_id = old.id)
    or exists (
      select 1 from public.knockout_brackets bracket
      join public.fixture_stages stage on stage.id = bracket.stage_id
      where stage.tournament_id = old.tournament_id
        and bracket.rounds::text like '%"' || old.id::text || '"%'
    ) or exists (
      select 1 from public.fixture_stages stage
      where stage.tournament_id = old.tournament_id
        and stage.config::text like '%"' || old.id::text || '"%'
    ) then
    raise exception 'This team is used in fixtures, a bracket or match history. Remove its unplayed fixtures or reset the unstarted plan first. Recorded matches must be retained.';
  end if;
  delete from public.fixture_tie_resolutions resolution
  using public.fixture_groups fixture_group, public.fixture_stages stage
  where resolution.group_id = fixture_group.id and fixture_group.stage_id = stage.id
    and stage.tournament_id = old.tournament_id
    and (old.id = any(resolution.ordered_team_ids) or old.id = any(fixture_group.team_ids));
  update public.fixture_groups fixture_group
  set team_ids = array_remove(fixture_group.team_ids, old.id)
  from public.fixture_stages stage
  where fixture_group.stage_id = stage.id and stage.tournament_id = old.tournament_id
    and old.id = any(fixture_group.team_ids);
  return old;
end;
$$;
revoke all on function app_private.guard_tournament_team_removal() from public, anon, authenticated;
create trigger teams_guard_tournament_removal
before delete on public.teams
for each row execute function app_private.guard_tournament_team_removal();

create or replace function app_private.remove_owned_tournament_team(p_tournament_id uuid, p_team_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare removed_id uuid;
begin
  perform 1 from public.tournaments
  where id = p_tournament_id and created_by = (select auth.uid()) for update;
  if not found then raise exception 'Only the tournament organiser can remove a team'; end if;
  -- The row lock also serialises inserts holding a team foreign-key reference.
  perform 1 from public.teams where id = p_team_id and tournament_id = p_tournament_id for update;
  if not found then raise exception 'This team is no longer entered in this tournament'; end if;
  perform 1 from public.fixture_stages where tournament_id = p_tournament_id for update;
  delete from public.teams where id = p_team_id and tournament_id = p_tournament_id returning id into removed_id;
  return removed_id;
end;
$$;
create or replace function public.remove_owned_tournament_team(p_tournament_id uuid, p_team_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.remove_owned_tournament_team(p_tournament_id, p_team_id); $$;
revoke all on function app_private.remove_owned_tournament_team(uuid,uuid) from public, anon;
revoke all on function public.remove_owned_tournament_team(uuid,uuid) from public, anon;
grant execute on function app_private.remove_owned_tournament_team(uuid,uuid) to authenticated;
grant execute on function public.remove_owned_tournament_team(uuid,uuid) to authenticated;
