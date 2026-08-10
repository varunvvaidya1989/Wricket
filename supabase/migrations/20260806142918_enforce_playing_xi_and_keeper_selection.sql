create or replace function app_private.set_team_player_keeper(
  p_team_id uuid,
  p_player_id uuid,
  p_is_keeper boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    app_private.is_team_captain(p_team_id)
    or app_private.is_tournament_owner_for_team(p_team_id)
  ) then
    raise exception 'Only the tournament owner or team captain can manage wicketkeepers';
  end if;

  update public.team_players
  set is_keeper = p_is_keeper
  where team_id = p_team_id and player_id = p_player_id;
  if not found then raise exception 'Player is not in this team'; end if;
end;
$$;

create or replace function public.set_team_player_keeper(
  p_team_id uuid,
  p_player_id uuid,
  p_is_keeper boolean
)
returns void language sql security invoker set search_path = ''
as $$ select app_private.set_team_player_keeper(p_team_id, p_player_id, p_is_keeper) $$;

revoke all on function app_private.set_team_player_keeper(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_team_player_keeper(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_team_player_keeper(uuid, uuid, boolean) to authenticated;

create or replace function app_private.validate_completed_playing_xi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_id uuid := coalesce(new.match_id, old.match_id);
  v_team_id uuid := coalesce(new.team_id, old.team_id);
  v_required_players integer;
  v_actual_players integer;
  v_keeper_count integer;
  v_captain_count integer;
begin
  -- The RPC finishes by moving the match to IN_PROGRESS. Deferring this
  -- constraint allows it to replace the whole XI atomically first.
  if not exists (
    select 1 from public.matches
    where id = v_match_id and status = 'IN_PROGRESS'
  ) then return null; end if;

  select greatest(1, coalesce((rules ->> 'playersPerSide')::integer, 11))
    into v_required_players
  from public.matches where id = v_match_id;

  select count(*), count(*) filter (where xi.is_keeper), count(*) filter (where xi.is_captain)
    into v_actual_players, v_keeper_count, v_captain_count
  from public.match_xis xi
  where xi.match_id = v_match_id and xi.team_id = v_team_id;

  if v_actual_players <> v_required_players then
    raise exception 'Each Playing XI must contain exactly % players', v_required_players;
  end if;
  if v_keeper_count <> 1 then
    raise exception 'Each Playing XI must contain exactly one wicketkeeper';
  end if;
  if v_captain_count <> 1 then
    raise exception 'Each Playing XI must contain exactly one match captain';
  end if;
  if exists (
    select 1 from public.match_xis xi
    left join public.team_players squad
      on squad.team_id = xi.team_id and squad.player_id = xi.player_id
    where xi.match_id = v_match_id and xi.team_id = v_team_id
      and xi.is_keeper and coalesce(squad.is_keeper, false) = false
  ) then
    raise exception 'The selected wicketkeeper must be marked as a wicketkeeper in the team roster';
  end if;
  return null;
end;
$$;

create constraint trigger validate_completed_playing_xi
after insert or update or delete on public.match_xis
deferrable initially deferred
for each row execute function app_private.validate_completed_playing_xi();

revoke all on function app_private.validate_completed_playing_xi() from public, anon, authenticated;
