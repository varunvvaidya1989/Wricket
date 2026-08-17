-- Phase 2 follow-up: contextual roster views and access revocation. Kept
-- additive because 20260817140000 is already applied.

drop function public.list_sport_club_roster(uuid);
drop function public.list_sport_team_roster(uuid);
drop function app_private.list_sport_club_roster(uuid);
drop function app_private.list_sport_team_roster(uuid);

create or replace function app_private.list_sport_club_roster(p_club_id uuid)
returns table(
  membership_id uuid,
  sport_profile_id uuid,
  account_id uuid,
  display_name_snapshot text,
  avatar_url_snapshot text,
  status public.sport_membership_status,
  is_manager boolean,
  accepted_at timestamptz,
  ended_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
declare can_manage boolean;
begin
  if not app_private.can_read_sport_club(p_club_id) then raise exception 'Club access is required'; end if;
  can_manage := app_private.can_manage_sport_club(p_club_id);
  return query
  select membership.id, membership.sport_profile_id,
    case when can_manage or profile.account_id = (select auth.uid()) then profile.account_id else null end,
    membership.display_name_snapshot, membership.avatar_url_snapshot,
    membership.status,
    exists (
      select 1 from public.sport_club_access access
      where access.club_id = p_club_id and access.account_id = profile.account_id
        and access.role = 'MANAGER' and access.status = 'ACTIVE'
        and (access.expires_at is null or access.expires_at > now())
    ),
    membership.accepted_at, membership.ended_at
  from public.sport_club_memberships membership
  join public.sport_profiles profile on profile.id = membership.sport_profile_id
  where membership.club_id = p_club_id
  order by membership.created_at;
end;
$$;

create or replace function app_private.list_sport_team_roster(p_team_id uuid)
returns table(
  membership_id uuid,
  sport_profile_id uuid,
  club_membership_id uuid,
  account_id uuid,
  display_name_snapshot text,
  avatar_url_snapshot text,
  status public.sport_membership_status,
  eligibility jsonb,
  is_captain boolean,
  accepted_at timestamptz,
  ended_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
declare can_manage boolean;
begin
  if not app_private.can_read_sport_team(p_team_id) then raise exception 'Team access is required'; end if;
  can_manage := app_private.can_manage_sport_team(p_team_id);
  return query
  select membership.id, membership.sport_profile_id, membership.club_membership_id,
    case when can_manage or profile.account_id = (select auth.uid()) then profile.account_id else null end,
    membership.display_name_snapshot, membership.avatar_url_snapshot,
    membership.status, membership.eligibility,
    exists (
      select 1 from public.sport_team_access access
      where access.team_id = p_team_id and access.account_id = profile.account_id
        and access.role = 'CAPTAIN' and access.status = 'ACTIVE'
        and (access.expires_at is null or access.expires_at > now())
    ),
    membership.accepted_at, membership.ended_at
  from public.sport_team_memberships membership
  join public.sport_profiles profile on profile.id = membership.sport_profile_id
  where membership.team_id = p_team_id
  order by membership.created_at;
end;
$$;

create or replace function app_private.revoke_sport_access(
  p_resource_type text,
  p_resource_id uuid,
  p_account_id uuid,
  p_role text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare selected_sport_id uuid;
declare affected_count integer;
begin
  if p_resource_type = 'CLUB' then
    if p_role <> 'MANAGER' or not app_private.can_manage_sport_club(p_resource_id) then
      raise exception 'Only a club owner or manager can revoke manager access';
    end if;
    if exists (
      select 1 from public.sport_clubs
      where id = p_resource_id and owner_account_id = p_account_id
    ) then raise exception 'Transfer club ownership before revoking the owner'; end if;
    update public.sport_club_access set status = 'REVOKED', updated_at = now()
    where club_id = p_resource_id and account_id = p_account_id
      and role = 'MANAGER' and status in ('PENDING', 'ACTIVE');
    get diagnostics affected_count = row_count;
    select sport_id into selected_sport_id from public.sport_clubs where id = p_resource_id;
  elsif p_resource_type = 'TEAM' then
    if p_role <> 'CAPTAIN' or not app_private.can_manage_sport_team(p_resource_id) then
      raise exception 'Only a team owner, captain, or club manager can revoke captain access';
    end if;
    if exists (
      select 1 from public.sport_teams
      where id = p_resource_id and owner_account_id = p_account_id
    ) then raise exception 'Transfer team ownership before revoking the owner'; end if;
    update public.sport_team_access set status = 'REVOKED', updated_at = now()
    where team_id = p_resource_id and account_id = p_account_id
      and role = 'CAPTAIN' and status in ('PENDING', 'ACTIVE');
    get diagnostics affected_count = row_count;
    select club.sport_id into selected_sport_id
    from public.sport_teams team join public.sport_clubs club on club.id = team.club_id
    where team.id = p_resource_id;
  else
    raise exception 'Unsupported access resource type';
  end if;
  if affected_count = 0 then raise exception 'Active or pending access assignment was not found'; end if;
  perform app_private.write_sport_audit(
    selected_sport_id, p_resource_type, p_resource_id, p_role || '_REVOKED',
    jsonb_build_object('account_id', p_account_id)
  );
end;
$$;

create or replace function public.list_sport_club_roster(p_club_id uuid)
returns table(membership_id uuid, sport_profile_id uuid, account_id uuid, display_name_snapshot text, avatar_url_snapshot text, status public.sport_membership_status, is_manager boolean, accepted_at timestamptz, ended_at timestamptz)
language sql stable security definer set search_path = public
as $$ select * from app_private.list_sport_club_roster(p_club_id) $$;
create or replace function public.list_sport_team_roster(p_team_id uuid)
returns table(membership_id uuid, sport_profile_id uuid, club_membership_id uuid, account_id uuid, display_name_snapshot text, avatar_url_snapshot text, status public.sport_membership_status, eligibility jsonb, is_captain boolean, accepted_at timestamptz, ended_at timestamptz)
language sql stable security definer set search_path = public
as $$ select * from app_private.list_sport_team_roster(p_team_id) $$;
create or replace function public.can_manage_sport_club(p_club_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select app_private.can_manage_sport_club(p_club_id) $$;
create or replace function public.can_manage_sport_team(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select app_private.can_manage_sport_team(p_team_id) $$;
create or replace function public.revoke_sport_access(p_resource_type text, p_resource_id uuid, p_account_id uuid, p_role text)
returns void language sql security definer set search_path = public
as $$ select app_private.revoke_sport_access(p_resource_type, p_resource_id, p_account_id, p_role) $$;

revoke all on function app_private.list_sport_club_roster(uuid) from public, anon, authenticated;
revoke all on function app_private.list_sport_team_roster(uuid) from public, anon, authenticated;
revoke all on function app_private.revoke_sport_access(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.list_sport_club_roster(uuid) from public, anon;
revoke all on function public.list_sport_team_roster(uuid) from public, anon;
revoke all on function public.can_manage_sport_club(uuid) from public, anon;
revoke all on function public.can_manage_sport_team(uuid) from public, anon;
revoke all on function public.revoke_sport_access(text, uuid, uuid, text) from public, anon;
grant execute on function public.list_sport_club_roster(uuid) to authenticated;
grant execute on function public.list_sport_team_roster(uuid) to authenticated;
grant execute on function public.can_manage_sport_club(uuid) to authenticated;
grant execute on function public.can_manage_sport_team(uuid) to authenticated;
grant execute on function public.revoke_sport_access(text, uuid, uuid, text) to authenticated;
