create or replace function app_private.search_registered_players(
  p_query text,
  p_team_id uuid,
  p_limit integer default 20
)
returns table (
  player_id uuid,
  account_id uuid,
  display_name text,
  avatar_url text,
  membership_role text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if not (
    (select app_private.is_tournament_owner_for_team(p_team_id))
    or (select app_private.is_team_captain(p_team_id))
  ) then
    raise exception 'You are not authorised to manage this roster';
  end if;

  return query
  select
    player.id,
    player.profile_id,
    player.display_name,
    profile.avatar_url,
    case
      when roster.is_captain then 'CAPTAIN'
      when roster.player_id is not null then 'PLAYER'
      else null
    end
  from public.players player
  left join public.profiles profile on profile.id = player.profile_id
  left join public.team_players roster
    on roster.team_id = p_team_id and roster.player_id = player.id
  where length(trim(p_query)) >= 2
    and player.display_name ilike '%' || trim(p_query) || '%'
  order by
    case when lower(player.display_name) = lower(trim(p_query)) then 0 else 1 end,
    player.display_name
  limit least(greatest(p_limit, 1), 30);
end;
$$;

create or replace function app_private.assign_registered_player(
  p_team_id uuid,
  p_player_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare selected_player public.players%rowtype;
begin
  if p_role not in ('CAPTAIN', 'PLAYER') then raise exception 'Invalid team role'; end if;
  select * into selected_player from public.players where id = p_player_id;
  if not found then raise exception 'Player not found'; end if;

  if p_role = 'CAPTAIN' then
    if selected_player.profile_id is null then
      raise exception 'A captain must first create or link a SportStage account';
    end if;
    if not (select app_private.is_tournament_owner_for_team(p_team_id)) then
      raise exception 'Only the tournament owner can assign a captain';
    end if;
    if exists (
      select 1 from public.team_account_members
      where team_id = p_team_id and role = 'CAPTAIN' and status = 'ACTIVE'
        and account_id <> selected_player.profile_id
    ) then
      raise exception 'This team already has a captain';
    end if;
  elsif not (select app_private.is_team_captain(p_team_id)) then
    raise exception 'Only the team captain can add players';
  end if;

  insert into public.team_players(team_id, player_id, is_captain)
  values (p_team_id, selected_player.id, p_role = 'CAPTAIN')
  on conflict (team_id, player_id) do update set is_captain = excluded.is_captain;

  if selected_player.profile_id is not null then
    insert into public.team_account_members(team_id, account_id, player_id, role, status)
    values (p_team_id, selected_player.profile_id, selected_player.id, p_role, 'ACTIVE')
    on conflict (team_id, account_id) do update
    set player_id = excluded.player_id, role = excluded.role, status = 'ACTIVE', updated_at = now();
  end if;
end;
$$;

create or replace function app_private.remove_team_player(
  p_team_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare selected_player public.players%rowtype;
declare captain_value boolean;
begin
  select is_captain into captain_value from public.team_players
  where team_id = p_team_id and player_id = p_player_id;
  if not found then return; end if;

  if captain_value then
    if not (select app_private.is_tournament_owner_for_team(p_team_id)) then
      raise exception 'Only the tournament owner can remove the captain';
    end if;
  elsif not (
    (select app_private.is_team_captain(p_team_id))
    or (select app_private.is_tournament_owner_for_team(p_team_id))
  ) then
    raise exception 'You are not authorised to remove this player';
  end if;

  select * into selected_player from public.players where id = p_player_id;
  delete from public.team_players where team_id = p_team_id and player_id = p_player_id;
  if selected_player.profile_id is not null then
    update public.team_account_members
    set status = 'REMOVED', updated_at = now()
    where team_id = p_team_id and account_id = selected_player.profile_id;
  end if;
end;
$$;

create or replace function public.remove_team_player(
  p_team_id uuid, p_player_id uuid
) returns void language sql security invoker set search_path = public
as $$ select app_private.remove_team_player(p_team_id, p_player_id) $$;

revoke all on function app_private.remove_team_player(uuid, uuid) from public, anon;
revoke all on function public.remove_team_player(uuid, uuid) from public, anon;
grant execute on function app_private.remove_team_player(uuid, uuid) to authenticated;
grant execute on function public.remove_team_player(uuid, uuid) to authenticated;
