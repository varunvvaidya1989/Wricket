-- Phase 2 follow-up: make invitation retries return the existing resource
-- without rewriting state or duplicating audit events.

create or replace function app_private.invite_sport_club_member(
  p_club_id uuid,
  p_sport_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare selected_club public.sport_clubs%rowtype;
declare selected_profile public.sport_profiles%rowtype;
declare selected_membership public.sport_club_memberships%rowtype;
begin
  if not app_private.can_manage_sport_club(p_club_id) then
    raise exception 'Only a club owner or manager can invite players';
  end if;
  select * into selected_club from public.sport_clubs where id = p_club_id;
  select * into selected_profile from public.sport_profiles
  where id = p_sport_profile_id and sport_id = selected_club.sport_id and status = 'ACTIVE';
  if not found then raise exception 'Choose an active SportStage player for this sport'; end if;

  select * into selected_membership from public.sport_club_memberships
  where club_id = p_club_id and sport_profile_id = p_sport_profile_id for update;
  if found and selected_membership.status in ('ACTIVE', 'INVITED') then
    return selected_membership.id;
  elsif found then
    update public.sport_club_memberships set
      status = 'INVITED', display_name_snapshot = selected_profile.display_name,
      avatar_url_snapshot = selected_profile.avatar_url, invited_by = (select auth.uid()),
      accepted_at = null, ended_at = null, updated_at = now()
    where id = selected_membership.id returning * into selected_membership;
  else
    insert into public.sport_club_memberships(
      club_id, sport_profile_id, status, display_name_snapshot, avatar_url_snapshot, invited_by
    ) values (
      p_club_id, p_sport_profile_id, 'INVITED', selected_profile.display_name,
      selected_profile.avatar_url, (select auth.uid())
    ) returning * into selected_membership;
  end if;
  perform app_private.write_sport_audit(
    selected_club.sport_id, 'CLUB', p_club_id, 'CLUB_MEMBER_INVITED',
    jsonb_build_object('membership_id', selected_membership.id, 'sport_profile_id', p_sport_profile_id)
  );
  return selected_membership.id;
end;
$$;

create or replace function app_private.respond_sport_club_invitation(
  p_membership_id uuid,
  p_accept boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare selected_membership public.sport_club_memberships%rowtype;
declare selected_club public.sport_clubs%rowtype;
begin
  select membership.* into selected_membership
  from public.sport_club_memberships membership
  join public.sport_profiles profile on profile.id = membership.sport_profile_id
  where membership.id = p_membership_id and profile.account_id = (select auth.uid())
  for update of membership;
  if not found then raise exception 'Club invitation was not found'; end if;
  select * into selected_club from public.sport_clubs where id = selected_membership.club_id;
  if (p_accept and selected_membership.status = 'ACTIVE')
    or (not p_accept and selected_membership.status = 'REMOVED') then
    return selected_club.id;
  end if;
  if selected_membership.status <> 'INVITED' then raise exception 'Club invitation is no longer pending'; end if;
  update public.sport_club_memberships set
    status = case when p_accept then 'ACTIVE'::public.sport_membership_status else 'REMOVED'::public.sport_membership_status end,
    accepted_at = case when p_accept then now() else null end,
    ended_at = case when p_accept then null else now() end, updated_at = now()
  where id = p_membership_id;
  perform app_private.write_sport_audit(
    selected_club.sport_id, 'CLUB', selected_club.id,
    case when p_accept then 'CLUB_INVITATION_ACCEPTED' else 'CLUB_INVITATION_DECLINED' end,
    jsonb_build_object('membership_id', p_membership_id)
  );
  return selected_club.id;
end;
$$;

create or replace function app_private.invite_sport_team_member(
  p_team_id uuid,
  p_club_membership_id uuid,
  p_eligibility jsonb default '["SINGLES", "DOUBLES"]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare selected_team public.sport_teams%rowtype;
declare selected_club public.sport_clubs%rowtype;
declare selected_club_member public.sport_club_memberships%rowtype;
declare selected_profile public.sport_profiles%rowtype;
declare selected_team_member public.sport_team_memberships%rowtype;
begin
  if not app_private.can_manage_sport_team(p_team_id) then
    raise exception 'Only a team owner, captain, or club manager can invite players';
  end if;
  if jsonb_typeof(p_eligibility) <> 'array' or jsonb_array_length(p_eligibility) not between 1 and 2
    or not (p_eligibility <@ '["SINGLES", "DOUBLES"]'::jsonb) then
    raise exception 'Eligibility must contain singles, doubles, or both';
  end if;
  select * into selected_team from public.sport_teams where id = p_team_id;
  select * into selected_club from public.sport_clubs where id = selected_team.club_id;
  select * into selected_club_member from public.sport_club_memberships
  where id = p_club_membership_id and club_id = selected_team.club_id and status = 'ACTIVE';
  if not found then raise exception 'Choose an active member of the same club'; end if;
  select * into selected_profile from public.sport_profiles
  where id = selected_club_member.sport_profile_id and status = 'ACTIVE';
  select * into selected_team_member from public.sport_team_memberships
  where team_id = p_team_id and sport_profile_id = selected_profile.id for update;
  if found and selected_team_member.status in ('ACTIVE', 'INVITED') then
    return selected_team_member.id;
  elsif found then
    update public.sport_team_memberships set
      club_membership_id = selected_club_member.id, status = 'INVITED', eligibility = p_eligibility,
      display_name_snapshot = selected_profile.display_name, avatar_url_snapshot = selected_profile.avatar_url,
      invited_by = (select auth.uid()), accepted_at = null, ended_at = null, updated_at = now()
    where id = selected_team_member.id returning * into selected_team_member;
  else
    insert into public.sport_team_memberships(
      team_id, sport_profile_id, club_membership_id, status, eligibility,
      display_name_snapshot, avatar_url_snapshot, invited_by
    ) values (
      p_team_id, selected_profile.id, selected_club_member.id, 'INVITED', p_eligibility,
      selected_profile.display_name, selected_profile.avatar_url, (select auth.uid())
    ) returning * into selected_team_member;
  end if;
  perform app_private.write_sport_audit(
    selected_club.sport_id, 'TEAM', p_team_id, 'TEAM_MEMBER_INVITED',
    jsonb_build_object('membership_id', selected_team_member.id, 'eligibility', p_eligibility)
  );
  return selected_team_member.id;
end;
$$;

create or replace function app_private.respond_sport_team_invitation(
  p_membership_id uuid,
  p_accept boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare selected_membership public.sport_team_memberships%rowtype;
declare selected_team public.sport_teams%rowtype;
declare selected_club public.sport_clubs%rowtype;
begin
  select membership.* into selected_membership
  from public.sport_team_memberships membership
  join public.sport_profiles profile on profile.id = membership.sport_profile_id
  where membership.id = p_membership_id and profile.account_id = (select auth.uid())
  for update of membership;
  if not found then raise exception 'Team invitation was not found'; end if;
  select * into selected_team from public.sport_teams where id = selected_membership.team_id;
  if (p_accept and selected_membership.status = 'ACTIVE')
    or (not p_accept and selected_membership.status = 'REMOVED') then
    return selected_team.id;
  end if;
  if selected_membership.status <> 'INVITED' then raise exception 'Team invitation is no longer pending'; end if;
  update public.sport_team_memberships set
    status = case when p_accept then 'ACTIVE'::public.sport_membership_status else 'REMOVED'::public.sport_membership_status end,
    accepted_at = case when p_accept then now() else null end,
    ended_at = case when p_accept then null else now() end, updated_at = now()
  where id = p_membership_id;
  select * into selected_club from public.sport_clubs where id = selected_team.club_id;
  perform app_private.write_sport_audit(
    selected_club.sport_id, 'TEAM', selected_team.id,
    case when p_accept then 'TEAM_INVITATION_ACCEPTED' else 'TEAM_INVITATION_DECLINED' end,
    jsonb_build_object('membership_id', p_membership_id)
  );
  return selected_team.id;
end;
$$;

create or replace function app_private.invite_sport_access(
  p_resource_type text,
  p_resource_id uuid,
  p_account_id uuid,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare access_id_value uuid;
declare selected_sport_id uuid;
declare current_status public.sport_access_status;
begin
  if p_resource_type = 'CLUB' then
    if p_role <> 'MANAGER' or not app_private.can_manage_sport_club(p_resource_id) then
      raise exception 'Only a club owner or manager can assign club managers';
    end if;
    select sport_id into selected_sport_id from public.sport_clubs where id = p_resource_id;
    if not exists (
      select 1 from public.sport_club_memberships membership
      join public.sport_profiles profile on profile.id = membership.sport_profile_id
      where membership.club_id = p_resource_id and membership.status = 'ACTIVE'
        and profile.account_id = p_account_id
    ) then raise exception 'Club managers must be active club members'; end if;
    select id, status into access_id_value, current_status
    from public.sport_club_access
    where club_id = p_resource_id and account_id = p_account_id for update;
    if found and current_status in ('PENDING', 'ACTIVE') then return access_id_value; end if;
    insert into public.sport_club_access(club_id, account_id, role, status, granted_by)
    values (p_resource_id, p_account_id, 'MANAGER', 'PENDING', (select auth.uid()))
    on conflict (club_id, account_id) do update set
      status = 'PENDING', granted_by = excluded.granted_by,
      accepted_at = null, expires_at = null, updated_at = now()
    returning id into access_id_value;
  elsif p_resource_type = 'TEAM' then
    if p_role <> 'CAPTAIN' or not app_private.can_manage_sport_team(p_resource_id) then
      raise exception 'Only a team owner, captain, or club manager can assign captains';
    end if;
    select club.sport_id into selected_sport_id
    from public.sport_teams team join public.sport_clubs club on club.id = team.club_id
    where team.id = p_resource_id;
    if not exists (
      select 1 from public.sport_team_memberships membership
      join public.sport_profiles profile on profile.id = membership.sport_profile_id
      where membership.team_id = p_resource_id and membership.status = 'ACTIVE'
        and profile.account_id = p_account_id
    ) then raise exception 'Captains must be active team members'; end if;
    select id, status into access_id_value, current_status
    from public.sport_team_access
    where team_id = p_resource_id and account_id = p_account_id and role = 'CAPTAIN' for update;
    if found and current_status in ('PENDING', 'ACTIVE') then return access_id_value; end if;
    insert into public.sport_team_access(team_id, account_id, role, status, granted_by)
    values (p_resource_id, p_account_id, 'CAPTAIN', 'PENDING', (select auth.uid()))
    on conflict (team_id, account_id, role) do update set
      status = 'PENDING', granted_by = excluded.granted_by,
      accepted_at = null, expires_at = null, updated_at = now()
    returning id into access_id_value;
  else
    raise exception 'Unsupported access resource type';
  end if;
  perform app_private.write_sport_audit(
    selected_sport_id, p_resource_type, p_resource_id, p_role || '_INVITED',
    jsonb_build_object('access_id', access_id_value, 'account_id', p_account_id)
  );
  return access_id_value;
end;
$$;

create or replace function app_private.respond_sport_access_invitation(
  p_access_type text,
  p_access_id uuid,
  p_accept boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare resource_id_value uuid;
declare selected_sport_id uuid;
declare role_value text;
declare status_value public.sport_access_status;
begin
  if p_access_type = 'CLUB' then
    select club_id, role, status into resource_id_value, role_value, status_value
    from public.sport_club_access
    where id = p_access_id and account_id = (select auth.uid()) for update;
    if not found then raise exception 'Access invitation was not found'; end if;
    select sport_id into selected_sport_id from public.sport_clubs where id = resource_id_value;
    if (p_accept and status_value = 'ACTIVE') or (not p_accept and status_value = 'REVOKED') then
      return resource_id_value;
    end if;
    if status_value <> 'PENDING' then raise exception 'Access invitation is no longer pending'; end if;
    update public.sport_club_access set
      status = case when p_accept then 'ACTIVE'::public.sport_access_status else 'REVOKED'::public.sport_access_status end,
      accepted_at = case when p_accept then now() else null end, updated_at = now()
    where id = p_access_id;
  elsif p_access_type = 'TEAM' then
    select team_id, role, status into resource_id_value, role_value, status_value
    from public.sport_team_access
    where id = p_access_id and account_id = (select auth.uid()) for update;
    if not found then raise exception 'Access invitation was not found'; end if;
    select club.sport_id into selected_sport_id
    from public.sport_teams team join public.sport_clubs club on club.id = team.club_id
    where team.id = resource_id_value;
    if (p_accept and status_value = 'ACTIVE') or (not p_accept and status_value = 'REVOKED') then
      return resource_id_value;
    end if;
    if status_value <> 'PENDING' then raise exception 'Access invitation is no longer pending'; end if;
    update public.sport_team_access set
      status = case when p_accept then 'ACTIVE'::public.sport_access_status else 'REVOKED'::public.sport_access_status end,
      accepted_at = case when p_accept then now() else null end, updated_at = now()
    where id = p_access_id;
  else
    raise exception 'Unsupported access resource type';
  end if;
  perform app_private.write_sport_audit(
    selected_sport_id, p_access_type, resource_id_value,
    role_value || case when p_accept then '_ACCEPTED' else '_DECLINED' end,
    jsonb_build_object('access_id', p_access_id)
  );
  return resource_id_value;
end;
$$;

revoke all on function app_private.invite_sport_club_member(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.respond_sport_club_invitation(uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.invite_sport_team_member(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function app_private.respond_sport_team_invitation(uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.invite_sport_access(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.respond_sport_access_invitation(text, uuid, boolean) from public, anon, authenticated;
