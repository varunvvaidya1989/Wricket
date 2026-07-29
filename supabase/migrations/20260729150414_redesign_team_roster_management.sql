-- Registered players can belong to many teams. A team has at most one active captain.
with ranked as (
  select team_id, account_id,
    row_number() over (partition by team_id order by joined_at, account_id) as position
  from public.team_account_members
  where role = 'CAPTAIN' and status = 'ACTIVE'
)
update public.team_account_members member
set role = 'PLAYER', updated_at = now()
from ranked
where member.team_id = ranked.team_id
  and member.account_id = ranked.account_id
  and ranked.position > 1;

update public.team_players player
set is_captain = false
where is_captain
  and not exists (
    select 1
    from public.team_account_members member
    where member.team_id = player.team_id
      and member.player_id = player.player_id
      and member.role = 'CAPTAIN'
      and member.status = 'ACTIVE'
  );

create unique index team_one_active_captain_idx
on public.team_account_members(team_id)
where role = 'CAPTAIN' and status = 'ACTIVE';

create unique index team_players_one_captain_idx
on public.team_players(team_id)
where is_captain;

create or replace function app_private.is_tournament_owner_for_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams team
    join public.tournament_members member on member.tournament_id = team.tournament_id
    where team.id = p_team_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
      and member.role in ('OWNER', 'ADMIN')
  )
$$;

create or replace function app_private.is_team_captain(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_account_members member
    where member.team_id = p_team_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
      and member.role = 'CAPTAIN'
  )
$$;

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
  select player.id, player.profile_id, player.display_name, profile.avatar_url, member.role
  from public.players player
  join public.profiles profile on profile.id = player.profile_id
  left join public.team_account_members member
    on member.team_id = p_team_id
    and member.account_id = player.profile_id
    and member.status = 'ACTIVE'
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
  select * into selected_player from public.players
  where id = p_player_id and profile_id is not null;
  if not found then raise exception 'Registered player not found'; end if;

  if p_role = 'CAPTAIN' then
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

  insert into public.team_account_members(team_id, account_id, player_id, role, status)
  values (p_team_id, selected_player.profile_id, selected_player.id, p_role, 'ACTIVE')
  on conflict (team_id, account_id) do update
  set player_id = excluded.player_id, role = excluded.role, status = 'ACTIVE', updated_at = now();

  insert into public.team_players(team_id, player_id, is_captain)
  values (p_team_id, selected_player.id, p_role = 'CAPTAIN')
  on conflict (team_id, player_id) do update set is_captain = excluded.is_captain;
end;
$$;

create or replace function app_private.remove_registered_player(
  p_team_id uuid,
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare selected_member public.team_account_members%rowtype;
begin
  select * into selected_member from public.team_account_members
  where team_id = p_team_id and account_id = p_account_id and status = 'ACTIVE';
  if not found then return; end if;

  if selected_member.role = 'CAPTAIN' then
    if not (select app_private.is_tournament_owner_for_team(p_team_id)) then
      raise exception 'Only the tournament owner can remove the captain';
    end if;
  elsif not (
    (select app_private.is_team_captain(p_team_id))
    or (select app_private.is_tournament_owner_for_team(p_team_id))
  ) then
    raise exception 'You are not authorised to remove this player';
  end if;

  update public.team_account_members
  set status = 'REMOVED', updated_at = now()
  where team_id = p_team_id and account_id = p_account_id;
  delete from public.team_players
  where team_id = p_team_id and player_id = selected_member.player_id;
end;
$$;

-- Player invitations are retired; only owners can create a one-use captain invitation.
create or replace function app_private.create_team_invitation(
  p_team_id uuid,
  p_role text,
  p_invited_email text default null,
  p_max_uses integer default 1,
  p_expires_in_hours integer default 72
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_token text := encode(gen_random_bytes(24), 'hex');
  invitation_id uuid;
  expires_at_value timestamptz;
begin
  if not (select app_private.is_tournament_owner_for_team(p_team_id)) then
    raise exception 'Only the tournament owner can invite a captain';
  end if;
  if p_role <> 'CAPTAIN' then
    raise exception 'Player invitations have been removed; captains add registered players directly';
  end if;
  if exists (
    select 1 from public.team_account_members
    where team_id = p_team_id and role = 'CAPTAIN' and status = 'ACTIVE'
  ) then
    raise exception 'This team already has a captain';
  end if;
  expires_at_value := now() + make_interval(hours => least(greatest(p_expires_in_hours, 1), 720));
  insert into public.team_invitations(
    team_id, role, token_hash, invited_email, max_uses, expires_at, created_by
  ) values (
    p_team_id, 'CAPTAIN', digest(raw_token, 'sha256'),
    nullif(lower(trim(p_invited_email)), ''), 1, expires_at_value, (select auth.uid())
  ) returning id into invitation_id;
  return jsonb_build_object(
    'invitation_id', invitation_id, 'token', raw_token, 'expires_at', expires_at_value
  );
end;
$$;

-- Drop the old implementation so same-tournament and cross-team memberships are allowed.
create or replace function app_private.accept_team_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare selected_invite public.team_invitations%rowtype;
declare selected_team public.teams%rowtype;
declare selected_profile public.profiles%rowtype;
declare selected_player public.players%rowtype;
declare jwt_email text := lower(coalesce((select auth.jwt()->>'email'), ''));
begin
  if (select auth.uid()) is null then raise exception 'Sign in before joining a team'; end if;
  select * into selected_invite from public.team_invitations
  where token_hash = digest(p_token, 'sha256') for update;
  if not found or selected_invite.role <> 'CAPTAIN'
    or selected_invite.revoked_at is not null or selected_invite.expires_at <= now()
    or selected_invite.use_count >= selected_invite.max_uses then
    raise exception 'This captain invitation is invalid, expired, or already used';
  end if;
  if selected_invite.invited_email is not null and selected_invite.invited_email <> jwt_email then
    raise exception 'This invitation was issued to a different account';
  end if;
  if exists (
    select 1 from public.team_account_members
    where team_id = selected_invite.team_id and role = 'CAPTAIN' and status = 'ACTIVE'
      and account_id <> (select auth.uid())
  ) then raise exception 'This team already has a captain'; end if;

  select * into selected_team from public.teams where id = selected_invite.team_id;
  select * into selected_profile from public.profiles where id = (select auth.uid());
  if not found then raise exception 'Complete your profile before joining a team'; end if;
  select * into selected_player from public.players where profile_id = (select auth.uid());
  if not found then
    insert into public.players(profile_id, display_name, created_by)
    values ((select auth.uid()), selected_profile.display_name, (select auth.uid()))
    returning * into selected_player;
  end if;
  insert into public.team_account_members(team_id, account_id, player_id, role, status)
  values (selected_team.id, (select auth.uid()), selected_player.id, 'CAPTAIN', 'ACTIVE')
  on conflict (team_id, account_id) do update
  set player_id = excluded.player_id, role = 'CAPTAIN', status = 'ACTIVE', updated_at = now();
  insert into public.team_players(team_id, player_id, is_captain)
  values (selected_team.id, selected_player.id, true)
  on conflict (team_id, player_id) do update set is_captain = true;
  update public.team_invitations set use_count = use_count + 1 where id = selected_invite.id;
  return jsonb_build_object(
    'team_id', selected_team.id, 'team_name', selected_team.name,
    'role', 'CAPTAIN', 'player_id', selected_player.id
  );
end;
$$;

create or replace function app_private.enforce_tournament_team_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare team_limit integer;
begin
  select planned_team_count into team_limit from public.tournaments where id = new.tournament_id;
  if team_limit is not null and (
    select count(*) from public.teams where tournament_id = new.tournament_id
  ) >= team_limit then
    raise exception 'The tournament already has its planned % teams', team_limit;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_tournament_team_limit on public.teams;
create trigger enforce_tournament_team_limit
before insert on public.teams
for each row execute function app_private.enforce_tournament_team_limit();

create or replace function public.search_registered_players(
  p_query text, p_team_id uuid, p_limit integer default 20
) returns table (
  player_id uuid, account_id uuid, display_name text, avatar_url text, membership_role text
)
language sql security invoker set search_path = public
as $$ select * from app_private.search_registered_players(p_query, p_team_id, p_limit) $$;

create or replace function public.assign_registered_player(
  p_team_id uuid, p_player_id uuid, p_role text
) returns void language sql security invoker set search_path = public
as $$ select app_private.assign_registered_player(p_team_id, p_player_id, p_role) $$;

create or replace function public.remove_registered_player(
  p_team_id uuid, p_account_id uuid
) returns void language sql security invoker set search_path = public
as $$ select app_private.remove_registered_player(p_team_id, p_account_id) $$;

revoke all on function app_private.search_registered_players(text, uuid, integer) from public, anon;
revoke all on function app_private.assign_registered_player(uuid, uuid, text) from public, anon;
revoke all on function app_private.remove_registered_player(uuid, uuid) from public, anon;
revoke all on function public.search_registered_players(text, uuid, integer) from public, anon;
revoke all on function public.assign_registered_player(uuid, uuid, text) from public, anon;
revoke all on function public.remove_registered_player(uuid, uuid) from public, anon;
grant execute on function app_private.search_registered_players(text, uuid, integer) to authenticated;
grant execute on function app_private.assign_registered_player(uuid, uuid, text) to authenticated;
grant execute on function app_private.remove_registered_player(uuid, uuid) to authenticated;
grant execute on function public.search_registered_players(text, uuid, integer) to authenticated;
grant execute on function public.assign_registered_player(uuid, uuid, text) to authenticated;
grant execute on function public.remove_registered_player(uuid, uuid) to authenticated;
