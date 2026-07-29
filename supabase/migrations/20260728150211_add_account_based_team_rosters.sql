create table public.team_account_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  account_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  role text not null check (role in ('CAPTAIN', 'PLAYER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REMOVED')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, account_id)
);

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  role text not null check (role in ('CAPTAIN', 'PLAYER')),
  token_hash bytea not null unique,
  invited_email text,
  max_uses integer not null default 1 check (max_uses between 1 and 50),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create unique index players_one_profile_identity_idx
on public.players(profile_id) where profile_id is not null;
create index team_account_members_account_idx on public.team_account_members(account_id);
create index team_invitations_team_idx on public.team_invitations(team_id, expires_at);

alter table public.team_account_members enable row level security;
alter table public.team_invitations enable row level security;

create or replace function app_private.can_manage_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams team
    left join public.tournament_members tournament_member
      on tournament_member.tournament_id = team.tournament_id
      and tournament_member.account_id = (select auth.uid())
      and tournament_member.status = 'ACTIVE'
      and tournament_member.role in ('OWNER', 'ADMIN')
    left join public.team_account_members team_member
      on team_member.team_id = team.id
      and team_member.account_id = (select auth.uid())
      and team_member.status = 'ACTIVE'
      and team_member.role = 'CAPTAIN'
    where team.id = p_team_id
      and (tournament_member.id is not null or team_member.account_id is not null)
  );
$$;

create policy "team_account_members_read"
on public.team_account_members for select
to authenticated
using (
  account_id = (select auth.uid())
  or (select app_private.can_manage_team(team_id))
);

create policy "team_invitations_manage"
on public.team_invitations for select
to authenticated
using ((select app_private.can_manage_team(team_id)));

create policy "captains_update_team"
on public.teams for update
to authenticated
using ((select app_private.can_manage_team(id)))
with check ((select app_private.can_manage_team(id)));

create policy "captains_manage_roster"
on public.team_players for all
to authenticated
using ((select app_private.can_manage_team(team_id)))
with check ((select app_private.can_manage_team(team_id)));

create or replace function app_private.create_team_invitation(
  p_team_id uuid,
  p_role text,
  p_invited_email text default null,
  p_max_uses integer default 1,
  p_expires_in_hours integer default 168
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
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if not (select app_private.can_manage_team(p_team_id)) then
    raise exception 'You are not authorised to invite members to this team';
  end if;
  if p_role not in ('CAPTAIN', 'PLAYER') then raise exception 'Invalid team role'; end if;
  if p_role = 'CAPTAIN' and not exists (
    select 1 from public.teams team
    join public.tournament_members member on member.tournament_id = team.tournament_id
    where team.id = p_team_id
      and member.account_id = (select auth.uid())
      and member.role in ('OWNER', 'ADMIN')
      and member.status = 'ACTIVE'
  ) then
    raise exception 'Only the tournament organiser can invite a captain';
  end if;
  if p_max_uses not between 1 and 50 then raise exception 'Invite use limit must be between 1 and 50'; end if;
  if p_expires_in_hours not between 1 and 720 then raise exception 'Invite expiry must be between 1 and 720 hours'; end if;

  expires_at_value := now() + make_interval(hours => p_expires_in_hours);
  insert into public.team_invitations(
    team_id, role, token_hash, invited_email, max_uses, expires_at, created_by
  ) values (
    p_team_id, p_role, digest(raw_token, 'sha256'),
    nullif(lower(trim(p_invited_email)), ''), p_max_uses, expires_at_value, (select auth.uid())
  ) returning id into invitation_id;

  return jsonb_build_object(
    'invitation_id', invitation_id,
    'token', raw_token,
    'expires_at', expires_at_value
  );
end;
$$;

create or replace function app_private.preview_team_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare selected_invite public.team_invitations%rowtype;
declare selected_team public.teams%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to view this invitation'; end if;
  select * into selected_invite from public.team_invitations
  where token_hash = digest(p_token, 'sha256')
    and revoked_at is null and expires_at > now() and use_count < max_uses;
  if not found then raise exception 'This invitation is invalid, expired, or already used'; end if;
  select * into selected_team from public.teams where id = selected_invite.team_id;
  return jsonb_build_object(
    'team_id', selected_team.id, 'team_name', selected_team.name,
    'team_short_name', selected_team.short_name, 'role', selected_invite.role,
    'expires_at', selected_invite.expires_at
  );
end;
$$;

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
  if not found or selected_invite.revoked_at is not null
    or selected_invite.expires_at <= now() or selected_invite.use_count >= selected_invite.max_uses then
    raise exception 'This invitation is invalid, expired, or already used';
  end if;
  if selected_invite.invited_email is not null and selected_invite.invited_email <> jwt_email then
    raise exception 'This invitation was issued to a different account';
  end if;
  select * into selected_team from public.teams where id = selected_invite.team_id;
  if exists (
    select 1 from public.team_account_members member
    join public.teams team on team.id = member.team_id
    where member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
      and team.tournament_id = selected_team.tournament_id
      and member.team_id <> selected_team.id
  ) then
    raise exception 'You already belong to another team in this tournament';
  end if;
  select * into selected_profile from public.profiles where id = (select auth.uid());
  if not found then raise exception 'Complete your profile before joining a team'; end if;
  select * into selected_player from public.players where profile_id = (select auth.uid());
  if not found then
    insert into public.players(profile_id, display_name, created_by)
    values ((select auth.uid()), selected_profile.display_name, (select auth.uid()))
    returning * into selected_player;
  end if;

  insert into public.team_account_members(team_id, account_id, player_id, role, status)
  values (selected_team.id, (select auth.uid()), selected_player.id, selected_invite.role, 'ACTIVE')
  on conflict (team_id, account_id) do update
  set player_id = excluded.player_id, role = excluded.role, status = 'ACTIVE', updated_at = now();
  insert into public.team_players(team_id, player_id, is_captain)
  values (selected_team.id, selected_player.id, selected_invite.role = 'CAPTAIN')
  on conflict (team_id, player_id) do update
  set is_captain = excluded.is_captain;
  update public.team_invitations set use_count = use_count + 1 where id = selected_invite.id;

  return jsonb_build_object(
    'team_id', selected_team.id, 'team_name', selected_team.name,
    'role', selected_invite.role, 'player_id', selected_player.id
  );
end;
$$;

create or replace function app_private.revoke_team_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare invite_team_id uuid;
begin
  select team_id into invite_team_id from public.team_invitations where id = p_invitation_id;
  if invite_team_id is null or not (select app_private.can_manage_team(invite_team_id)) then
    raise exception 'You are not authorised to revoke this invitation';
  end if;
  update public.team_invitations set revoked_at = now() where id = p_invitation_id;
end;
$$;

revoke all on public.team_account_members, public.team_invitations from anon;
grant select on public.team_account_members, public.team_invitations to authenticated;
revoke all on function app_private.create_team_invitation(uuid, text, text, integer, integer) from public, anon;
revoke all on function app_private.preview_team_invitation(text) from public, anon;
revoke all on function app_private.accept_team_invitation(text) from public, anon;
revoke all on function app_private.revoke_team_invitation(uuid) from public, anon;
grant execute on function app_private.create_team_invitation(uuid, text, text, integer, integer) to authenticated;
grant execute on function app_private.preview_team_invitation(text) to authenticated;
grant execute on function app_private.accept_team_invitation(text) to authenticated;
grant execute on function app_private.revoke_team_invitation(uuid) to authenticated;

create or replace function public.create_team_invitation(
  p_team_id uuid,
  p_role text,
  p_invited_email text default null,
  p_max_uses integer default 1,
  p_expires_in_hours integer default 168
) returns jsonb
language sql
security invoker
set search_path = public
as $$ select app_private.create_team_invitation(p_team_id, p_role, p_invited_email, p_max_uses, p_expires_in_hours) $$;

create or replace function public.preview_team_invitation(p_token text)
returns jsonb language sql security invoker set search_path = public
as $$ select app_private.preview_team_invitation(p_token) $$;

create or replace function public.accept_team_invitation(p_token text)
returns jsonb language sql security invoker set search_path = public
as $$ select app_private.accept_team_invitation(p_token) $$;

create or replace function public.revoke_team_invitation(p_invitation_id uuid)
returns void language sql security invoker set search_path = public
as $$ select app_private.revoke_team_invitation(p_invitation_id) $$;

revoke all on function public.create_team_invitation(uuid, text, text, integer, integer) from public, anon;
revoke all on function public.preview_team_invitation(text) from public, anon;
revoke all on function public.accept_team_invitation(text) from public, anon;
revoke all on function public.revoke_team_invitation(uuid) from public, anon;
grant execute on function public.create_team_invitation(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.preview_team_invitation(text) to authenticated;
grant execute on function public.accept_team_invitation(text) to authenticated;
grant execute on function public.revoke_team_invitation(uuid) to authenticated;
