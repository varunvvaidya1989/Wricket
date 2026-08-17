-- Phase 2 follow-up: cast conditional membership states to the enum explicitly.

create or replace function app_private.end_sport_club_membership(
  p_membership_id uuid,
  p_remove boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare selected_membership public.sport_club_memberships%rowtype;
declare selected_profile public.sport_profiles%rowtype;
declare selected_club public.sport_clubs%rowtype;
declare removing boolean;
begin
  select * into selected_membership from public.sport_club_memberships
  where id = p_membership_id for update;
  if not found or selected_membership.status <> 'ACTIVE' then
    raise exception 'Active club membership was not found';
  end if;
  select * into selected_profile from public.sport_profiles where id = selected_membership.sport_profile_id;
  select * into selected_club from public.sport_clubs where id = selected_membership.club_id;
  removing := coalesce(p_remove, false);
  if removing then
    if not app_private.can_manage_sport_club(selected_club.id) then
      raise exception 'Only a club owner or manager can remove players';
    end if;
    if selected_profile.account_id = selected_club.owner_account_id then
      raise exception 'Transfer club ownership before removing the owner';
    end if;
  elsif selected_profile.account_id <> (select auth.uid()) then
    raise exception 'Players can leave only their own club membership';
  elsif selected_profile.account_id = selected_club.owner_account_id then
    raise exception 'Transfer club ownership before leaving the club';
  end if;
  if exists (
    select 1 from public.sport_team_memberships team_member
    where team_member.club_membership_id = selected_membership.id and team_member.status = 'ACTIVE'
  ) then raise exception 'Remove or leave active club teams before ending club membership'; end if;
  update public.sport_club_access set status = 'REVOKED', updated_at = now()
  where club_id = selected_club.id and account_id = selected_profile.account_id and status = 'ACTIVE';
  update public.sport_club_memberships set
    status = case when removing
      then 'REMOVED'::public.sport_membership_status
      else 'LEFT'::public.sport_membership_status end,
    ended_at = now(), updated_at = now()
  where id = p_membership_id;
  perform app_private.write_sport_audit(
    selected_club.sport_id, 'CLUB', selected_club.id,
    case when removing then 'CLUB_MEMBER_REMOVED' else 'CLUB_MEMBER_LEFT' end,
    jsonb_build_object('membership_id', p_membership_id)
  );
end;
$$;

create or replace function app_private.end_sport_team_membership(
  p_membership_id uuid,
  p_remove boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare selected_membership public.sport_team_memberships%rowtype;
declare selected_team public.sport_teams%rowtype;
declare selected_club public.sport_clubs%rowtype;
declare member_account_id uuid;
declare removing boolean;
begin
  select * into selected_membership from public.sport_team_memberships
  where id = p_membership_id and status = 'ACTIVE' for update;
  if not found then raise exception 'Active team membership was not found'; end if;
  select * into selected_team from public.sport_teams where id = selected_membership.team_id;
  select * into selected_club from public.sport_clubs where id = selected_team.club_id;
  select account_id into member_account_id from public.sport_profiles
  where id = selected_membership.sport_profile_id;
  removing := coalesce(p_remove, false);
  if removing then
    if not app_private.can_manage_sport_team(selected_team.id) then
      raise exception 'Only a team owner, captain, or club manager can remove players';
    end if;
    if member_account_id = selected_team.owner_account_id then
      raise exception 'Transfer team ownership before removing the owner';
    end if;
  elsif member_account_id <> (select auth.uid()) then
    raise exception 'Players can leave only their own team membership';
  elsif member_account_id = selected_team.owner_account_id then
    raise exception 'Transfer team ownership before leaving the team';
  end if;
  update public.sport_team_access set status = 'REVOKED', updated_at = now()
  where team_id = selected_team.id and account_id = member_account_id and status = 'ACTIVE';
  update public.sport_team_memberships set
    status = case when removing
      then 'REMOVED'::public.sport_membership_status
      else 'LEFT'::public.sport_membership_status end,
    ended_at = now(), updated_at = now()
  where id = p_membership_id;
  perform app_private.write_sport_audit(
    selected_club.sport_id, 'TEAM', selected_team.id,
    case when removing then 'TEAM_MEMBER_REMOVED' else 'TEAM_MEMBER_LEFT' end,
    jsonb_build_object('membership_id', p_membership_id)
  );
end;
$$;

revoke all on function app_private.end_sport_club_membership(uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.end_sport_team_membership(uuid, boolean) from public, anon, authenticated;
