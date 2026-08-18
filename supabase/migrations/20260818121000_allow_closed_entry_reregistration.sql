-- Phase 3 review correction: registration identity is unique per competition,
-- division, and player/team. Re-registration therefore reactivates the existing
-- entry and preserves its audit trail instead of attempting a duplicate insert.

create or replace function app_private.register_sport_league_player(
  p_competition_id uuid,
  p_sport_profile_id uuid,
  p_division_key text default 'OPEN'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare selected_profile public.sport_profiles%rowtype;
declare selected_entry public.sport_competition_entries%rowtype;
declare entry_id_value uuid;
declare manager boolean;
declare clean_division text := upper(trim(coalesce(p_division_key, 'OPEN')));
begin
  select * into selected from public.sport_competitions where id = p_competition_id for update;
  if not found or selected.kind <> 'LEAGUE' then raise exception 'Choose an individual-player league'; end if;
  manager := app_private.can_manage_sport_competition(selected.id);
  select * into selected_profile from public.sport_profiles
  where id = p_sport_profile_id and sport_id = selected.sport_id and status = 'ACTIVE';
  if not found then raise exception 'Choose an active player for this sport'; end if;
  if not manager and selected_profile.account_id <> (select auth.uid()) then
    raise exception 'Players can register only themselves';
  end if;
  if not app_private.registration_is_open(selected, manager) then raise exception 'Registration is not open'; end if;
  if not exists (select 1 from public.sport_competition_divisions where competition_id = selected.id and division_key = clean_division) then
    raise exception 'Competition division was not found';
  end if;

  select entry.* into selected_entry
  from public.sport_competition_entries entry
  join public.sport_league_players player on player.entry_id = entry.id
  where entry.competition_id = selected.id and entry.division_key = clean_division
    and player.sport_profile_id = selected_profile.id
  for update of entry;

  if found then
    if selected_entry.status not in ('WITHDRAWN', 'REJECTED', 'DISQUALIFIED') then
      return selected_entry.id;
    end if;
    update public.sport_competition_entries set
      status = 'PENDING', seed = null, accepted_at = null, approved_at = null,
      withdrawn_at = null,
      snapshot = jsonb_build_object(
        'display_name', selected_profile.display_name,
        'avatar_url', selected_profile.avatar_url
      ),
      updated_at = now()
    where id = selected_entry.id;
    update public.sport_league_players set
      display_name_snapshot = selected_profile.display_name,
      avatar_url_snapshot = selected_profile.avatar_url,
      eligibility = '["SINGLES"]'::jsonb,
      updated_at = now()
    where entry_id = selected_entry.id;
    perform app_private.write_sport_audit(selected.sport_id, 'ENTRY', selected_entry.id,
      'ENTRY_REREGISTERED', jsonb_build_object(
        'from_status', selected_entry.status,
        'division', clean_division
      ));
    return selected_entry.id;
  end if;

  insert into public.sport_competition_entries(
    competition_id, entry_kind, division_key, status, snapshot
  ) values (
    selected.id, 'PLAYER', clean_division, 'PENDING',
    jsonb_build_object('display_name', selected_profile.display_name, 'avatar_url', selected_profile.avatar_url)
  ) returning id into entry_id_value;
  insert into public.sport_league_players(
    entry_id, competition_id, division_key, sport_profile_id,
    display_name_snapshot, avatar_url_snapshot, eligibility
  ) values (
    entry_id_value, selected.id, clean_division, selected_profile.id,
    selected_profile.display_name, selected_profile.avatar_url, '["SINGLES"]'::jsonb
  );
  perform app_private.write_sport_audit(selected.sport_id, 'ENTRY', entry_id_value,
    'LEAGUE_PLAYER_REGISTERED', jsonb_build_object('division', clean_division));
  return entry_id_value;
end;
$$;

create or replace function app_private.register_sport_tournament_squad(
  p_competition_id uuid,
  p_team_id uuid,
  p_division_key text default 'OPEN'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare selected_team public.sport_teams%rowtype;
declare selected_entry public.sport_competition_entries%rowtype;
declare entry_id_value uuid;
declare manager boolean;
declare clean_division text := upper(trim(coalesce(p_division_key, 'OPEN')));
declare roster_count integer;
declare captain_id uuid;
begin
  select * into selected from public.sport_competitions where id = p_competition_id for update;
  if not found or selected.kind <> 'TOURNAMENT' then raise exception 'Choose a team tournament'; end if;
  manager := app_private.can_manage_sport_competition(selected.id);
  if not manager and not app_private.can_manage_sport_team(p_team_id) then
    raise exception 'Only a team owner, captain, or competition organizer can register this squad';
  end if;
  if not app_private.registration_is_open(selected, manager) then raise exception 'Registration is not open'; end if;
  select team.* into selected_team from public.sport_teams team
  join public.sport_clubs club on club.id = team.club_id
  where team.id = p_team_id and club.sport_id = selected.sport_id;
  if not found then raise exception 'Choose a reusable team for this sport'; end if;
  if not exists (select 1 from public.sport_competition_divisions where competition_id = selected.id and division_key = clean_division) then
    raise exception 'Competition division was not found';
  end if;
  select count(*) into roster_count from public.sport_team_memberships
  where team_id = selected_team.id and status = 'ACTIVE'
    and eligibility ? selected.match_format;
  if roster_count < (case when selected.match_format = 'DOUBLES' then 2 else 1 end) then
    raise exception 'Team does not have enough eligible active players';
  end if;
  select access.account_id into captain_id
  from public.sport_team_access access
  where access.team_id = selected_team.id and access.role = 'CAPTAIN' and access.status = 'ACTIVE'
  order by access.accepted_at limit 1;
  captain_id := coalesce(captain_id, selected_team.owner_account_id);

  select entry.* into selected_entry
  from public.sport_competition_entries entry
  join public.sport_tournament_squads squad on squad.entry_id = entry.id
  where entry.competition_id = selected.id and entry.division_key = clean_division
    and squad.source_team_id = selected_team.id
  for update of entry;

  if found then
    if selected_entry.status not in ('WITHDRAWN', 'REJECTED', 'DISQUALIFIED') then
      return selected_entry.id;
    end if;
    update public.sport_competition_entries set
      status = 'PENDING', seed = null, accepted_at = null, approved_at = null,
      withdrawn_at = null,
      snapshot = jsonb_build_object(
        'team_id', selected_team.id,
        'name', selected_team.name,
        'short_name', selected_team.short_name,
        'logo_url', selected_team.logo_url
      ),
      updated_at = now()
    where id = selected_entry.id;
    update public.sport_tournament_squads set
      name_snapshot = selected_team.name,
      short_name_snapshot = selected_team.short_name,
      logo_url_snapshot = selected_team.logo_url,
      captain_account_id = captain_id,
      roster_locked_at = null,
      updated_at = now()
    where entry_id = selected_entry.id;
    delete from public.sport_squad_members where squad_entry_id = selected_entry.id;
    insert into public.sport_squad_members(
      squad_entry_id, sport_profile_id, display_name_snapshot, avatar_url_snapshot,
      eligibility, status, accepted_at, approved_at
    )
    select selected_entry.id, membership.sport_profile_id, membership.display_name_snapshot,
      membership.avatar_url_snapshot, membership.eligibility, 'ACCEPTED', now(), null
    from public.sport_team_memberships membership
    where membership.team_id = selected_team.id and membership.status = 'ACTIVE';
    perform app_private.write_sport_audit(selected.sport_id, 'ENTRY', selected_entry.id,
      'ENTRY_REREGISTERED', jsonb_build_object(
        'from_status', selected_entry.status,
        'team_id', selected_team.id,
        'division', clean_division
      ));
    return selected_entry.id;
  end if;

  insert into public.sport_competition_entries(
    competition_id, entry_kind, division_key, status, snapshot
  ) values (
    selected.id, 'SQUAD', clean_division, 'PENDING',
    jsonb_build_object('team_id', selected_team.id, 'name', selected_team.name,
      'short_name', selected_team.short_name, 'logo_url', selected_team.logo_url)
  ) returning id into entry_id_value;
  insert into public.sport_tournament_squads(
    entry_id, competition_id, division_key, source_team_id,
    name_snapshot, short_name_snapshot, logo_url_snapshot, captain_account_id
  ) values (
    entry_id_value, selected.id, clean_division, selected_team.id,
    selected_team.name, selected_team.short_name, selected_team.logo_url, captain_id
  );
  insert into public.sport_squad_members(
    squad_entry_id, sport_profile_id, display_name_snapshot, avatar_url_snapshot,
    eligibility, status, accepted_at, approved_at
  )
  select entry_id_value, membership.sport_profile_id, membership.display_name_snapshot,
    membership.avatar_url_snapshot, membership.eligibility, 'ACCEPTED', now(), null
  from public.sport_team_memberships membership
  where membership.team_id = selected_team.id and membership.status = 'ACTIVE';
  perform app_private.write_sport_audit(selected.sport_id, 'ENTRY', entry_id_value,
    'TOURNAMENT_SQUAD_REGISTERED', jsonb_build_object('team_id', selected_team.id, 'division', clean_division));
  return entry_id_value;
end;
$$;

-- Preserve the existing private/public execution boundary after replacement.
revoke all on function app_private.register_sport_league_player(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function app_private.register_sport_tournament_squad(uuid, uuid, text)
from public, anon, authenticated;
