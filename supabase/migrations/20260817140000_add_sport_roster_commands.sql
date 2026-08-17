-- Phase 2: account-backed club and reusable-team roster commands for all
-- non-cricket sports. Clients retain read-only table access and mutate through
-- these audited security-definer commands.

alter table public.sport_team_memberships
add column eligibility jsonb not null default '["SINGLES", "DOUBLES"]'::jsonb
check (
  jsonb_typeof(eligibility) = 'array'
  and jsonb_array_length(eligibility) between 1 and 2
  and eligibility <@ '["SINGLES", "DOUBLES"]'::jsonb
);

-- A sport profile is provisioned only by the account-sport synchronization
-- trigger. This prevents a client from self-activating an unconnected sport.
revoke insert, update, delete on public.sport_profiles from authenticated;

create or replace function app_private.require_active_sport_profile(p_sport_code text)
returns public.sport_profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare selected_profile public.sport_profiles%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;

  select profile.* into selected_profile
  from public.sport_profiles profile
  join public.sports sport on sport.id = profile.sport_id
  join public.account_sports account_sport
    on account_sport.account_id = profile.account_id
    and account_sport.sport_id = profile.sport_id
    and account_sport.access_status = 'ACTIVE'
  where profile.account_id = (select auth.uid())
    and profile.status = 'ACTIVE'
    and sport.code = upper(trim(p_sport_code));

  if not found then raise exception 'An active SportStage profile is required for this sport'; end if;
  return selected_profile;
end;
$$;

create or replace function app_private.write_sport_audit(
  p_sport_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.sport_audit_events(
    sport_id, actor_account_id, resource_type, resource_id, action, payload
  ) values (
    p_sport_id, (select auth.uid()), p_resource_type, p_resource_id, p_action,
    coalesce(p_payload, '{}'::jsonb)
  )
$$;

create or replace function app_private.search_sport_players(
  p_sport_code text,
  p_query text,
  p_limit integer default 20
)
returns table(
  sport_profile_id uuid,
  account_id uuid,
  display_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare requester public.sport_profiles%rowtype;
begin
  requester := app_private.require_active_sport_profile(p_sport_code);
  if length(trim(coalesce(p_query, ''))) < 2 then return; end if;

  return query
  select profile.id, profile.account_id, profile.display_name, profile.avatar_url
  from public.sport_profiles profile
  join public.account_sports account_sport
    on account_sport.account_id = profile.account_id
    and account_sport.sport_id = profile.sport_id
    and account_sport.access_status = 'ACTIVE'
  where profile.sport_id = requester.sport_id
    and profile.status = 'ACTIVE'
    and profile.account_id <> (select auth.uid())
    and profile.display_name ilike '%' || trim(p_query) || '%'
  order by similarity(profile.display_name, trim(p_query)) desc, profile.display_name, profile.id
  limit least(greatest(coalesce(p_limit, 20), 1), 40);
end;
$$;

create or replace function app_private.list_my_sport_club_invitations(p_sport_code text)
returns table(
  membership_id uuid,
  club_id uuid,
  club_name text,
  sport_profile_id uuid,
  display_name_snapshot text,
  avatar_url_snapshot text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare requester public.sport_profiles%rowtype;
begin
  requester := app_private.require_active_sport_profile(p_sport_code);
  return query
  select membership.id, club.id, club.name, membership.sport_profile_id,
    membership.display_name_snapshot, membership.avatar_url_snapshot,
    membership.created_at
  from public.sport_club_memberships membership
  join public.sport_clubs club on club.id = membership.club_id
  where membership.sport_profile_id = requester.id
    and membership.status = 'INVITED'
    and club.sport_id = requester.sport_id
  order by membership.created_at desc;
end;
$$;

create or replace function app_private.list_my_sport_team_invitations(p_sport_code text)
returns table(
  membership_id uuid,
  team_id uuid,
  team_name text,
  club_name text,
  sport_profile_id uuid,
  club_membership_id uuid,
  display_name_snapshot text,
  avatar_url_snapshot text,
  eligibility jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare requester public.sport_profiles%rowtype;
begin
  requester := app_private.require_active_sport_profile(p_sport_code);
  return query
  select membership.id, team.id, team.name, club.name,
    membership.sport_profile_id, membership.club_membership_id,
    membership.display_name_snapshot, membership.avatar_url_snapshot,
    membership.eligibility, membership.created_at
  from public.sport_team_memberships membership
  join public.sport_teams team on team.id = membership.team_id
  join public.sport_clubs club on club.id = team.club_id
  where membership.sport_profile_id = requester.id
    and membership.status = 'INVITED'
    and club.sport_id = requester.sport_id
  order by membership.created_at desc;
end;
$$;

create or replace function app_private.list_sport_club_roster(p_club_id uuid)
returns table(
  membership_id uuid,
  sport_profile_id uuid,
  account_id uuid,
  display_name_snapshot text,
  avatar_url_snapshot text,
  status public.sport_membership_status,
  accepted_at timestamptz,
  ended_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare can_manage boolean;
begin
  if not app_private.can_read_sport_club(p_club_id) then raise exception 'Club access is required'; end if;
  can_manage := app_private.can_manage_sport_club(p_club_id);
  return query
  select membership.id, membership.sport_profile_id,
    case when can_manage or profile.account_id = (select auth.uid()) then profile.account_id else null end,
    membership.display_name_snapshot, membership.avatar_url_snapshot,
    membership.status, membership.accepted_at, membership.ended_at
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
  accepted_at timestamptz,
  ended_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare can_manage boolean;
begin
  if not app_private.can_read_sport_team(p_team_id) then raise exception 'Team access is required'; end if;
  can_manage := app_private.can_manage_sport_team(p_team_id);
  return query
  select membership.id, membership.sport_profile_id, membership.club_membership_id,
    case when can_manage or profile.account_id = (select auth.uid()) then profile.account_id else null end,
    membership.display_name_snapshot, membership.avatar_url_snapshot,
    membership.status, membership.eligibility, membership.accepted_at, membership.ended_at
  from public.sport_team_memberships membership
  join public.sport_profiles profile on profile.id = membership.sport_profile_id
  where membership.team_id = p_team_id
  order by membership.created_at;
end;
$$;

create or replace function app_private.create_sport_club(
  p_sport_code text,
  p_name text,
  p_short_name text default null,
  p_visibility public.sport_resource_visibility default 'PUBLIC'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare requester public.sport_profiles%rowtype;
declare club_id_value uuid;
begin
  requester := app_private.require_active_sport_profile(p_sport_code);
  if length(trim(coalesce(p_name, ''))) not between 2 and 120 then
    raise exception 'Club name must contain 2 to 120 characters';
  end if;
  if p_short_name is not null and length(trim(p_short_name)) not between 2 and 20 then
    raise exception 'Club short name must contain 2 to 20 characters';
  end if;

  insert into public.sport_clubs(
    sport_id, name, short_name, visibility, owner_account_id
  ) values (
    requester.sport_id, trim(p_name), nullif(trim(p_short_name), ''),
    coalesce(p_visibility, 'PUBLIC'), requester.account_id
  ) returning id into club_id_value;

  insert into public.sport_club_memberships(
    club_id, sport_profile_id, status, display_name_snapshot,
    avatar_url_snapshot, invited_by, accepted_at
  ) values (
    club_id_value, requester.id, 'ACTIVE', requester.display_name,
    requester.avatar_url, requester.account_id, now()
  );

  perform app_private.write_sport_audit(
    requester.sport_id, 'CLUB', club_id_value, 'CLUB_CREATED',
    jsonb_build_object('name', trim(p_name))
  );
  return club_id_value;
end;
$$;

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

  select * into selected_membership
  from public.sport_club_memberships
  where club_id = p_club_id and sport_profile_id = p_sport_profile_id
  for update;

  if found and selected_membership.status in ('ACTIVE', 'INVITED') then
    raise exception 'That player is already a member or has a pending invitation';
  elsif found then
    update public.sport_club_memberships set
      status = 'INVITED',
      display_name_snapshot = selected_profile.display_name,
      avatar_url_snapshot = selected_profile.avatar_url,
      invited_by = (select auth.uid()),
      accepted_at = null,
      ended_at = null,
      updated_at = now()
    where id = selected_membership.id
    returning * into selected_membership;
  else
    insert into public.sport_club_memberships(
      club_id, sport_profile_id, status, display_name_snapshot,
      avatar_url_snapshot, invited_by
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
  where membership.id = p_membership_id
    and profile.account_id = (select auth.uid())
  for update of membership;
  if not found then raise exception 'Club invitation was not found'; end if;
  if selected_membership.status <> 'INVITED' then raise exception 'Club invitation is no longer pending'; end if;

  update public.sport_club_memberships set
    status = case when p_accept then 'ACTIVE'::public.sport_membership_status else 'REMOVED'::public.sport_membership_status end,
    accepted_at = case when p_accept then now() else null end,
    ended_at = case when p_accept then null else now() end,
    updated_at = now()
  where id = p_membership_id;

  select * into selected_club from public.sport_clubs where id = selected_membership.club_id;
  perform app_private.write_sport_audit(
    selected_club.sport_id, 'CLUB', selected_club.id,
    case when p_accept then 'CLUB_INVITATION_ACCEPTED' else 'CLUB_INVITATION_DECLINED' end,
    jsonb_build_object('membership_id', p_membership_id)
  );
  return selected_club.id;
end;
$$;

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
    where team_member.club_membership_id = selected_membership.id
      and team_member.status = 'ACTIVE'
  ) then raise exception 'Remove or leave active club teams before ending club membership'; end if;

  update public.sport_club_access set status = 'REVOKED', updated_at = now()
  where club_id = selected_club.id and account_id = selected_profile.account_id and status = 'ACTIVE';
  update public.sport_club_memberships set
    status = case when removing then 'REMOVED' else 'LEFT' end,
    ended_at = now(), updated_at = now()
  where id = p_membership_id;

  perform app_private.write_sport_audit(
    selected_club.sport_id, 'CLUB', selected_club.id,
    case when removing then 'CLUB_MEMBER_REMOVED' else 'CLUB_MEMBER_LEFT' end,
    jsonb_build_object('membership_id', p_membership_id)
  );
end;
$$;

create or replace function app_private.create_sport_team(
  p_club_id uuid,
  p_name text,
  p_short_name text default null,
  p_color_hex text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare selected_club public.sport_clubs%rowtype;
declare requester public.sport_profiles%rowtype;
declare club_membership public.sport_club_memberships%rowtype;
declare team_id_value uuid;
begin
  if not app_private.can_manage_sport_club(p_club_id) then
    raise exception 'Only a club owner or manager can create teams';
  end if;
  select * into selected_club from public.sport_clubs where id = p_club_id;
  select * into requester from public.sport_profiles
  where account_id = (select auth.uid()) and sport_id = selected_club.sport_id and status = 'ACTIVE';
  select * into club_membership from public.sport_club_memberships
  where club_id = p_club_id and sport_profile_id = requester.id and status = 'ACTIVE';
  if not found then raise exception 'Team owner must be an active member of the club'; end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120 then
    raise exception 'Team name must contain 2 to 120 characters';
  end if;

  insert into public.sport_teams(
    club_id, name, short_name, color_hex, owner_account_id
  ) values (
    p_club_id, trim(p_name), nullif(trim(p_short_name), ''),
    nullif(trim(p_color_hex), ''), requester.account_id
  ) returning id into team_id_value;

  insert into public.sport_team_memberships(
    team_id, sport_profile_id, club_membership_id, status,
    display_name_snapshot, avatar_url_snapshot, invited_by, accepted_at
  ) values (
    team_id_value, requester.id, club_membership.id, 'ACTIVE',
    requester.display_name, requester.avatar_url, requester.account_id, now()
  );

  perform app_private.write_sport_audit(
    selected_club.sport_id, 'TEAM', team_id_value, 'TEAM_CREATED',
    jsonb_build_object('club_id', p_club_id, 'name', trim(p_name))
  );
  return team_id_value;
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
  if jsonb_typeof(p_eligibility) <> 'array'
    or jsonb_array_length(p_eligibility) not between 1 and 2
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
    raise exception 'That player is already on the team or has a pending invitation';
  elsif found then
    update public.sport_team_memberships set
      club_membership_id = selected_club_member.id,
      status = 'INVITED', eligibility = p_eligibility,
      display_name_snapshot = selected_profile.display_name,
      avatar_url_snapshot = selected_profile.avatar_url,
      invited_by = (select auth.uid()), accepted_at = null, ended_at = null,
      updated_at = now()
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
  if selected_membership.status <> 'INVITED' then raise exception 'Team invitation is no longer pending'; end if;

  update public.sport_team_memberships set
    status = case when p_accept then 'ACTIVE'::public.sport_membership_status else 'REMOVED'::public.sport_membership_status end,
    accepted_at = case when p_accept then now() else null end,
    ended_at = case when p_accept then null else now() end,
    updated_at = now()
  where id = p_membership_id;

  select * into selected_team from public.sport_teams where id = selected_membership.team_id;
  select * into selected_club from public.sport_clubs where id = selected_team.club_id;
  perform app_private.write_sport_audit(
    selected_club.sport_id, 'TEAM', selected_team.id,
    case when p_accept then 'TEAM_INVITATION_ACCEPTED' else 'TEAM_INVITATION_DECLINED' end,
    jsonb_build_object('membership_id', p_membership_id)
  );
  return selected_team.id;
end;
$$;

create or replace function app_private.update_sport_team_member_eligibility(
  p_membership_id uuid,
  p_eligibility jsonb
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
begin
  if jsonb_typeof(p_eligibility) <> 'array'
    or jsonb_array_length(p_eligibility) not between 1 and 2
    or not (p_eligibility <@ '["SINGLES", "DOUBLES"]'::jsonb) then
    raise exception 'Eligibility must contain singles, doubles, or both';
  end if;
  select * into selected_membership from public.sport_team_memberships
  where id = p_membership_id and status = 'ACTIVE' for update;
  if not found then raise exception 'Active team membership was not found'; end if;
  select account_id into member_account_id from public.sport_profiles
  where id = selected_membership.sport_profile_id;
  if member_account_id <> (select auth.uid())
    and not app_private.can_manage_sport_team(selected_membership.team_id) then
    raise exception 'Only the player or a team manager can change eligibility';
  end if;

  update public.sport_team_memberships set eligibility = p_eligibility, updated_at = now()
  where id = p_membership_id;
  select * into selected_team from public.sport_teams where id = selected_membership.team_id;
  select * into selected_club from public.sport_clubs where id = selected_team.club_id;
  perform app_private.write_sport_audit(
    selected_club.sport_id, 'TEAM', selected_team.id, 'TEAM_MEMBER_ELIGIBILITY_UPDATED',
    jsonb_build_object('membership_id', p_membership_id, 'eligibility', p_eligibility)
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
    status = case when removing then 'REMOVED' else 'LEFT' end,
    ended_at = now(), updated_at = now()
  where id = p_membership_id;
  perform app_private.write_sport_audit(
    selected_club.sport_id, 'TEAM', selected_team.id,
    case when removing then 'TEAM_MEMBER_REMOVED' else 'TEAM_MEMBER_LEFT' end,
    jsonb_build_object('membership_id', p_membership_id)
  );
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

    insert into public.sport_club_access(
      club_id, account_id, role, status, granted_by
    ) values (p_resource_id, p_account_id, 'MANAGER', 'PENDING', (select auth.uid()))
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

    insert into public.sport_team_access(
      team_id, account_id, role, status, granted_by
    ) values (p_resource_id, p_account_id, 'CAPTAIN', 'PENDING', (select auth.uid()))
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
begin
  if p_access_type = 'CLUB' then
    update public.sport_club_access access set
      status = case when p_accept then 'ACTIVE'::public.sport_access_status else 'REVOKED'::public.sport_access_status end,
      accepted_at = case when p_accept then now() else null end,
      updated_at = now()
    where access.id = p_access_id and access.account_id = (select auth.uid())
      and access.status = 'PENDING'
    returning access.club_id, access.role into resource_id_value, role_value;
    select sport_id into selected_sport_id from public.sport_clubs where id = resource_id_value;
  elsif p_access_type = 'TEAM' then
    update public.sport_team_access access set
      status = case when p_accept then 'ACTIVE'::public.sport_access_status else 'REVOKED'::public.sport_access_status end,
      accepted_at = case when p_accept then now() else null end,
      updated_at = now()
    where access.id = p_access_id and access.account_id = (select auth.uid())
      and access.status = 'PENDING'
    returning access.team_id, access.role into resource_id_value, role_value;
    select club.sport_id into selected_sport_id
    from public.sport_teams team join public.sport_clubs club on club.id = team.club_id
    where team.id = resource_id_value;
  else
    raise exception 'Unsupported access resource type';
  end if;
  if resource_id_value is null then raise exception 'Access invitation was not found'; end if;

  perform app_private.write_sport_audit(
    selected_sport_id, p_access_type, resource_id_value,
    role_value || case when p_accept then '_ACCEPTED' else '_DECLINED' end,
    jsonb_build_object('access_id', p_access_id)
  );
  return resource_id_value;
end;
$$;

-- Public wrappers keep app_private command functions out of the exposed API
-- contract. The private functions perform all authentication and authorization.
create or replace function public.search_sport_players(p_sport_code text, p_query text, p_limit integer default 20)
returns table(sport_profile_id uuid, account_id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public
as $$ select * from app_private.search_sport_players(p_sport_code, p_query, p_limit) $$;
create or replace function public.list_my_sport_club_invitations(p_sport_code text)
returns table(membership_id uuid, club_id uuid, club_name text, sport_profile_id uuid, display_name_snapshot text, avatar_url_snapshot text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$ select * from app_private.list_my_sport_club_invitations(p_sport_code) $$;
create or replace function public.list_my_sport_team_invitations(p_sport_code text)
returns table(membership_id uuid, team_id uuid, team_name text, club_name text, sport_profile_id uuid, club_membership_id uuid, display_name_snapshot text, avatar_url_snapshot text, eligibility jsonb, created_at timestamptz)
language sql stable security definer set search_path = public
as $$ select * from app_private.list_my_sport_team_invitations(p_sport_code) $$;
create or replace function public.list_sport_club_roster(p_club_id uuid)
returns table(membership_id uuid, sport_profile_id uuid, account_id uuid, display_name_snapshot text, avatar_url_snapshot text, status public.sport_membership_status, accepted_at timestamptz, ended_at timestamptz)
language sql stable security definer set search_path = public
as $$ select * from app_private.list_sport_club_roster(p_club_id) $$;
create or replace function public.list_sport_team_roster(p_team_id uuid)
returns table(membership_id uuid, sport_profile_id uuid, club_membership_id uuid, account_id uuid, display_name_snapshot text, avatar_url_snapshot text, status public.sport_membership_status, eligibility jsonb, accepted_at timestamptz, ended_at timestamptz)
language sql stable security definer set search_path = public
as $$ select * from app_private.list_sport_team_roster(p_team_id) $$;
create or replace function public.can_manage_sport_club(p_club_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select app_private.can_manage_sport_club(p_club_id) $$;
create or replace function public.can_manage_sport_team(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select app_private.can_manage_sport_team(p_team_id) $$;
create or replace function public.create_sport_club(p_sport_code text, p_name text, p_short_name text default null, p_visibility public.sport_resource_visibility default 'PUBLIC')
returns uuid language sql security definer set search_path = public
as $$ select app_private.create_sport_club(p_sport_code, p_name, p_short_name, p_visibility) $$;
create or replace function public.invite_sport_club_member(p_club_id uuid, p_sport_profile_id uuid)
returns uuid language sql security definer set search_path = public
as $$ select app_private.invite_sport_club_member(p_club_id, p_sport_profile_id) $$;
create or replace function public.respond_sport_club_invitation(p_membership_id uuid, p_accept boolean)
returns uuid language sql security definer set search_path = public
as $$ select app_private.respond_sport_club_invitation(p_membership_id, p_accept) $$;
create or replace function public.end_sport_club_membership(p_membership_id uuid, p_remove boolean default false)
returns void language sql security definer set search_path = public
as $$ select app_private.end_sport_club_membership(p_membership_id, p_remove) $$;
create or replace function public.create_sport_team(p_club_id uuid, p_name text, p_short_name text default null, p_color_hex text default null)
returns uuid language sql security definer set search_path = public
as $$ select app_private.create_sport_team(p_club_id, p_name, p_short_name, p_color_hex) $$;
create or replace function public.invite_sport_team_member(p_team_id uuid, p_club_membership_id uuid, p_eligibility jsonb default '["SINGLES", "DOUBLES"]'::jsonb)
returns uuid language sql security definer set search_path = public
as $$ select app_private.invite_sport_team_member(p_team_id, p_club_membership_id, p_eligibility) $$;
create or replace function public.respond_sport_team_invitation(p_membership_id uuid, p_accept boolean)
returns uuid language sql security definer set search_path = public
as $$ select app_private.respond_sport_team_invitation(p_membership_id, p_accept) $$;
create or replace function public.update_sport_team_member_eligibility(p_membership_id uuid, p_eligibility jsonb)
returns void language sql security definer set search_path = public
as $$ select app_private.update_sport_team_member_eligibility(p_membership_id, p_eligibility) $$;
create or replace function public.end_sport_team_membership(p_membership_id uuid, p_remove boolean default false)
returns void language sql security definer set search_path = public
as $$ select app_private.end_sport_team_membership(p_membership_id, p_remove) $$;
create or replace function public.invite_sport_access(p_resource_type text, p_resource_id uuid, p_account_id uuid, p_role text)
returns uuid language sql security definer set search_path = public
as $$ select app_private.invite_sport_access(p_resource_type, p_resource_id, p_account_id, p_role) $$;
create or replace function public.respond_sport_access_invitation(p_access_type text, p_access_id uuid, p_accept boolean)
returns uuid language sql security definer set search_path = public
as $$ select app_private.respond_sport_access_invitation(p_access_type, p_access_id, p_accept) $$;
revoke all on function app_private.require_active_sport_profile(text) from public, anon, authenticated;
revoke all on function app_private.write_sport_audit(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function app_private.search_sport_players(text, text, integer) from public, anon, authenticated;
revoke all on function app_private.list_my_sport_club_invitations(text) from public, anon, authenticated;
revoke all on function app_private.list_my_sport_team_invitations(text) from public, anon, authenticated;
revoke all on function app_private.list_sport_club_roster(uuid) from public, anon, authenticated;
revoke all on function app_private.list_sport_team_roster(uuid) from public, anon, authenticated;
revoke all on function app_private.create_sport_club(text, text, text, public.sport_resource_visibility) from public, anon, authenticated;
revoke all on function app_private.invite_sport_club_member(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.respond_sport_club_invitation(uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.end_sport_club_membership(uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.create_sport_team(uuid, text, text, text) from public, anon, authenticated;
revoke all on function app_private.invite_sport_team_member(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function app_private.respond_sport_team_invitation(uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.update_sport_team_member_eligibility(uuid, jsonb) from public, anon, authenticated;
revoke all on function app_private.end_sport_team_membership(uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.invite_sport_access(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.respond_sport_access_invitation(text, uuid, boolean) from public, anon, authenticated;

revoke all on function public.search_sport_players(text, text, integer) from public, anon;
revoke all on function public.list_my_sport_club_invitations(text) from public, anon;
revoke all on function public.list_my_sport_team_invitations(text) from public, anon;
revoke all on function public.list_sport_club_roster(uuid) from public, anon;
revoke all on function public.list_sport_team_roster(uuid) from public, anon;
revoke all on function public.can_manage_sport_club(uuid) from public, anon;
revoke all on function public.can_manage_sport_team(uuid) from public, anon;
revoke all on function public.create_sport_club(text, text, text, public.sport_resource_visibility) from public, anon;
revoke all on function public.invite_sport_club_member(uuid, uuid) from public, anon;
revoke all on function public.respond_sport_club_invitation(uuid, boolean) from public, anon;
revoke all on function public.end_sport_club_membership(uuid, boolean) from public, anon;
revoke all on function public.create_sport_team(uuid, text, text, text) from public, anon;
revoke all on function public.invite_sport_team_member(uuid, uuid, jsonb) from public, anon;
revoke all on function public.respond_sport_team_invitation(uuid, boolean) from public, anon;
revoke all on function public.update_sport_team_member_eligibility(uuid, jsonb) from public, anon;
revoke all on function public.end_sport_team_membership(uuid, boolean) from public, anon;
revoke all on function public.invite_sport_access(text, uuid, uuid, text) from public, anon;
revoke all on function public.respond_sport_access_invitation(text, uuid, boolean) from public, anon;

grant execute on function public.search_sport_players(text, text, integer) to authenticated;
grant execute on function public.list_my_sport_club_invitations(text) to authenticated;
grant execute on function public.list_my_sport_team_invitations(text) to authenticated;
grant execute on function public.list_sport_club_roster(uuid) to authenticated;
grant execute on function public.list_sport_team_roster(uuid) to authenticated;
grant execute on function public.can_manage_sport_club(uuid) to authenticated;
grant execute on function public.can_manage_sport_team(uuid) to authenticated;
grant execute on function public.create_sport_club(text, text, text, public.sport_resource_visibility) to authenticated;
grant execute on function public.invite_sport_club_member(uuid, uuid) to authenticated;
grant execute on function public.respond_sport_club_invitation(uuid, boolean) to authenticated;
grant execute on function public.end_sport_club_membership(uuid, boolean) to authenticated;
grant execute on function public.create_sport_team(uuid, text, text, text) to authenticated;
grant execute on function public.invite_sport_team_member(uuid, uuid, jsonb) to authenticated;
grant execute on function public.respond_sport_team_invitation(uuid, boolean) to authenticated;
grant execute on function public.update_sport_team_member_eligibility(uuid, jsonb) to authenticated;
grant execute on function public.end_sport_team_membership(uuid, boolean) to authenticated;
grant execute on function public.invite_sport_access(text, uuid, uuid, text) to authenticated;
grant execute on function public.respond_sport_access_invitation(text, uuid, boolean) to authenticated;
