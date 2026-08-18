-- Phase 3: server-backed non-cricket competitions, registration, and manual
-- scheduling. Cricket remains on its existing tables and commands.

create type public.sport_fixture_status as enum ('SCHEDULED', 'CANCELLED');
create type public.sport_check_in_status as enum ('CHECKED_IN', 'LATE', 'NO_SHOW');

alter table public.sport_competitions
  add column match_format text not null default 'SINGLES'
    check (match_format in ('SINGLES', 'DOUBLES'));

create table public.sport_competition_divisions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  division_key text not null check (length(trim(division_key)) between 1 and 40),
  name text not null check (length(trim(name)) between 1 and 80),
  display_order integer not null check (display_order >= 0),
  registration_capacity integer check (registration_capacity is null or registration_capacity > 1),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, division_key),
  unique (competition_id, display_order)
);

create table public.sport_competition_venues (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  address text,
  court_count integer check (court_count is null or court_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, name),
  unique (id, competition_id)
);

create table public.sport_fixtures (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  stage_id uuid,
  division_key text not null default 'OPEN' check (length(trim(division_key)) between 1 and 40),
  entrant_a_id uuid not null,
  entrant_b_id uuid not null,
  venue_id uuid,
  court text,
  scheduled_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 5 and 1440),
  display_order integer not null check (display_order >= 0),
  status public.sport_fixture_status not null default 'SCHEDULED',
  cancellation_reason text,
  idempotency_key text not null check (length(trim(idempotency_key)) between 8 and 120),
  row_version integer not null default 1 check (row_version > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (stage_id, competition_id)
    references public.sport_competition_stages(id, competition_id) on delete restrict,
  foreign key (entrant_a_id, competition_id)
    references public.sport_competition_entries(id, competition_id) on delete restrict,
  foreign key (entrant_b_id, competition_id)
    references public.sport_competition_entries(id, competition_id) on delete restrict,
  foreign key (venue_id, competition_id)
    references public.sport_competition_venues(id, competition_id) on delete restrict,
  unique (competition_id, idempotency_key),
  unique (competition_id, display_order),
  unique (id, competition_id),
  check (entrant_a_id <> entrant_b_id),
  check (status <> 'CANCELLED' or nullif(trim(cancellation_reason), '') is not null)
);

create table public.sport_fixture_check_ins (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null,
  competition_id uuid not null,
  entry_id uuid not null,
  status public.sport_check_in_status not null default 'CHECKED_IN',
  checked_at timestamptz not null default now(),
  checked_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  foreign key (fixture_id, competition_id)
    references public.sport_fixtures(id, competition_id) on delete cascade,
  foreign key (entry_id, competition_id)
    references public.sport_competition_entries(id, competition_id) on delete cascade,
  unique (fixture_id, entry_id)
);

create index sport_fixtures_competition_schedule_idx
on public.sport_fixtures(competition_id, scheduled_at, display_order);
create index sport_fixtures_entries_idx
on public.sport_fixtures(entrant_a_id, entrant_b_id);

alter table public.sport_competition_divisions enable row level security;
alter table public.sport_competition_venues enable row level security;
alter table public.sport_fixtures enable row level security;
alter table public.sport_fixture_check_ins enable row level security;

create policy "sport_competition_divisions_read_authorized"
on public.sport_competition_divisions for select to authenticated
using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_competition_venues_read_authorized"
on public.sport_competition_venues for select to authenticated
using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_fixtures_read_authorized"
on public.sport_fixtures for select to authenticated
using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_fixture_check_ins_read_authorized"
on public.sport_fixture_check_ins for select to authenticated
using ((select app_private.can_read_sport_competition(competition_id)));

revoke all on public.sport_competition_divisions, public.sport_competition_venues,
  public.sport_fixtures from anon, authenticated;
revoke all on public.sport_fixture_check_ins from anon, authenticated;
grant select on public.sport_competition_divisions, public.sport_competition_venues,
  public.sport_fixtures to authenticated;
grant select on public.sport_fixture_check_ins to authenticated;

create or replace function app_private.require_managed_competition(p_competition_id uuid)
returns public.sport_competitions
language plpgsql stable security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
begin
  if not app_private.can_manage_sport_competition(p_competition_id) then
    raise exception 'Only the competition owner or an organizer can perform this action';
  end if;
  select * into selected from public.sport_competitions where id = p_competition_id;
  if not found then raise exception 'Competition was not found'; end if;
  return selected;
end;
$$;

create or replace function app_private.create_sport_competition(
  p_sport_code text,
  p_kind public.sport_competition_kind,
  p_name text,
  p_match_format text default 'SINGLES',
  p_description text default null,
  p_visibility public.sport_resource_visibility default 'PRIVATE',
  p_timezone text default 'UTC',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_registration_opens_at timestamptz default null,
  p_registration_closes_at timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare requester public.sport_profiles%rowtype;
declare competition_id_value uuid;
begin
  requester := app_private.require_active_sport_profile(p_sport_code);
  if length(trim(coalesce(p_name, ''))) not between 2 and 160 then
    raise exception 'Competition name must contain 2 to 160 characters';
  end if;
  if p_match_format not in ('SINGLES', 'DOUBLES') then raise exception 'Unsupported match format'; end if;
  if p_kind = 'LEAGUE' and p_match_format <> 'SINGLES' then
    raise exception 'Individual-player leagues use singles matches';
  end if;
  if length(trim(coalesce(p_timezone, ''))) not between 1 and 80 then raise exception 'Timezone is required'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at < p_starts_at then
    raise exception 'Competition end must not precede its start';
  end if;
  if p_registration_closes_at is not null and p_registration_opens_at is not null
    and p_registration_closes_at < p_registration_opens_at then
    raise exception 'Registration close must not precede its opening';
  end if;
  insert into public.sport_competitions(
    sport_id, kind, name, description, visibility, lifecycle, owner_account_id,
    timezone, starts_at, ends_at, registration_opens_at, registration_closes_at, match_format
  ) values (
    requester.sport_id, p_kind, trim(p_name), nullif(trim(p_description), ''),
    coalesce(p_visibility, 'PRIVATE'), 'DRAFT', requester.account_id,
    trim(p_timezone), p_starts_at, p_ends_at, p_registration_opens_at,
    p_registration_closes_at, p_match_format
  ) returning id into competition_id_value;
  insert into public.sport_competition_divisions(
    competition_id, division_key, name, display_order
  ) values (competition_id_value, 'OPEN', 'Open', 0);
  perform app_private.write_sport_audit(
    requester.sport_id, 'COMPETITION', competition_id_value, 'COMPETITION_CREATED',
    jsonb_build_object('kind', p_kind, 'match_format', p_match_format)
  );
  return competition_id_value;
end;
$$;

create or replace function app_private.update_sport_competition(
  p_competition_id uuid,
  p_name text,
  p_description text,
  p_visibility public.sport_resource_visibility,
  p_timezone text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_registration_opens_at timestamptz,
  p_registration_closes_at timestamptz
)
returns void
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_LOCKED') then
    raise exception 'Published competition details are locked';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 160 then raise exception 'Competition name is required'; end if;
  if length(trim(coalesce(p_timezone, ''))) not between 1 and 80 then raise exception 'Timezone is required'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at < p_starts_at then raise exception 'Invalid competition dates'; end if;
  if p_registration_closes_at is not null and p_registration_opens_at is not null
    and p_registration_closes_at < p_registration_opens_at then raise exception 'Invalid registration dates'; end if;
  update public.sport_competitions set
    name = trim(p_name), description = nullif(trim(p_description), ''),
    visibility = p_visibility, timezone = trim(p_timezone), starts_at = p_starts_at,
    ends_at = p_ends_at, registration_opens_at = p_registration_opens_at,
    registration_closes_at = p_registration_closes_at, updated_at = now()
  where id = p_competition_id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'COMPETITION_UPDATED', '{}'::jsonb);
end;
$$;

create or replace function app_private.transition_sport_competition(
  p_competition_id uuid,
  p_target public.sport_competition_lifecycle,
  p_reason text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare allowed boolean := false;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if selected.lifecycle = p_target then return; end if;
  allowed := case selected.lifecycle
    when 'DRAFT' then p_target in ('REGISTRATION_OPEN', 'PUBLISHED', 'CANCELLED')
    when 'REGISTRATION_OPEN' then p_target in ('REGISTRATION_LOCKED', 'CANCELLED')
    when 'REGISTRATION_LOCKED' then p_target in ('REGISTRATION_OPEN', 'PUBLISHED', 'CANCELLED')
    when 'PUBLISHED' then p_target in ('LIVE', 'CANCELLED')
    when 'LIVE' then p_target in ('COMPLETED', 'CANCELLED')
    when 'COMPLETED' then p_target = 'ARCHIVED'
    when 'CANCELLED' then p_target = 'ARCHIVED'
    else false end;
  if not allowed then raise exception 'Invalid competition lifecycle transition from % to %', selected.lifecycle, p_target; end if;
  if p_target = 'CANCELLED' and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Cancellation reason is required';
  end if;
  if p_target in ('REGISTRATION_LOCKED', 'PUBLISHED') then
    update public.sport_tournament_squads set roster_locked_at = coalesce(roster_locked_at, now()), updated_at = now()
    where competition_id = selected.id and entry_id in (
      select id from public.sport_competition_entries where competition_id = selected.id and status = 'APPROVED'
    );
  end if;
  update public.sport_competitions set
    lifecycle = p_target,
    registration_locked_at = case when p_target = 'REGISTRATION_LOCKED' then now() else registration_locked_at end,
    published_at = case when p_target = 'PUBLISHED' then coalesce(published_at, now()) else published_at end,
    completed_at = case when p_target = 'COMPLETED' then now() else completed_at end,
    archived_at = case when p_target = 'ARCHIVED' then now() else archived_at end,
    cancelled_at = case when p_target = 'CANCELLED' then now() else null end,
    cancellation_reason = case when p_target = 'CANCELLED' then trim(p_reason) else null end,
    updated_at = now()
  where id = selected.id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'LIFECYCLE_' || p_target::text, jsonb_build_object('from', selected.lifecycle, 'reason', p_reason));
end;
$$;

create or replace function app_private.transfer_sport_competition_ownership(
  p_competition_id uuid,
  p_new_owner_account_id uuid
)
returns void
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
begin
  select * into selected from public.sport_competitions where id = p_competition_id for update;
  if not found or selected.owner_account_id <> (select auth.uid()) then
    raise exception 'Only the current owner can transfer ownership';
  end if;
  if not app_private.account_has_active_sport_profile(p_new_owner_account_id, selected.sport_id) then
    raise exception 'New owner must have an active profile for this sport';
  end if;
  update public.sport_competitions set owner_account_id = p_new_owner_account_id, updated_at = now()
  where id = selected.id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'OWNERSHIP_TRANSFERRED', jsonb_build_object('from', selected.owner_account_id, 'to', p_new_owner_account_id));
end;
$$;

create or replace function app_private.invite_sport_competition_organizer(
  p_competition_id uuid,
  p_account_id uuid
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare selected_access public.sport_competition_access%rowtype;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if p_account_id = selected.owner_account_id then return selected.id; end if;
  if not app_private.account_has_active_sport_profile(p_account_id, selected.sport_id) then
    raise exception 'Organizer must have an active profile for this sport';
  end if;
  select * into selected_access from public.sport_competition_access
  where competition_id = selected.id and account_id = p_account_id for update;
  if found and selected_access.status in ('PENDING', 'ACTIVE') then return selected_access.id; end if;
  insert into public.sport_competition_access(
    competition_id, account_id, role, status, granted_by
  ) values (selected.id, p_account_id, 'ORGANIZER', 'PENDING', (select auth.uid()))
  on conflict (competition_id, account_id) do update set
    status = 'PENDING', role = 'ORGANIZER', granted_by = excluded.granted_by,
    accepted_at = null, expires_at = null, updated_at = now()
  returning * into selected_access;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'ORGANIZER_INVITED', jsonb_build_object('access_id', selected_access.id, 'account_id', p_account_id));
  return selected_access.id;
end;
$$;

create or replace function app_private.respond_sport_competition_organizer(
  p_access_id uuid,
  p_accept boolean
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare selected_access public.sport_competition_access%rowtype;
declare selected public.sport_competitions%rowtype;
begin
  select * into selected_access from public.sport_competition_access
  where id = p_access_id and account_id = (select auth.uid()) for update;
  if not found then raise exception 'Organizer invitation was not found'; end if;
  select * into selected from public.sport_competitions where id = selected_access.competition_id;
  if (p_accept and selected_access.status = 'ACTIVE')
    or (not p_accept and selected_access.status = 'REVOKED') then return selected.id; end if;
  if selected_access.status <> 'PENDING' then raise exception 'Organizer invitation is no longer pending'; end if;
  update public.sport_competition_access set
    status = case when p_accept then 'ACTIVE'::public.sport_access_status else 'REVOKED'::public.sport_access_status end,
    accepted_at = case when p_accept then now() else null end, updated_at = now()
  where id = selected_access.id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    case when p_accept then 'ORGANIZER_ACCEPTED' else 'ORGANIZER_DECLINED' end,
    jsonb_build_object('access_id', selected_access.id));
  return selected.id;
end;
$$;

create or replace function app_private.revoke_sport_competition_organizer(
  p_competition_id uuid,
  p_account_id uuid
)
returns void
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
begin
  select * into selected from public.sport_competitions where id = p_competition_id for update;
  if not found or selected.owner_account_id <> (select auth.uid()) then
    raise exception 'Only the competition owner can revoke organizers';
  end if;
  update public.sport_competition_access set status = 'REVOKED', updated_at = now()
  where competition_id = selected.id and account_id = p_account_id and status in ('PENDING', 'ACTIVE');
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'ORGANIZER_REVOKED', jsonb_build_object('account_id', p_account_id));
end;
$$;

create or replace function app_private.add_sport_competition_stage(
  p_competition_id uuid,
  p_name text,
  p_kind public.sport_stage_kind,
  p_display_order integer
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare stage_id_value uuid;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_LOCKED') then
    raise exception 'Stages are locked after publication';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 80 or p_display_order < 0 then
    raise exception 'Valid stage name and display order are required';
  end if;
  insert into public.sport_competition_stages(competition_id, name, kind, display_order)
  values (selected.id, trim(p_name), p_kind, p_display_order) returning id into stage_id_value;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'STAGE_ADDED', jsonb_build_object('stage_id', stage_id_value, 'name', trim(p_name)));
  return stage_id_value;
end;
$$;

create or replace function app_private.add_sport_competition_division(
  p_competition_id uuid,
  p_division_key text,
  p_name text,
  p_display_order integer,
  p_capacity integer default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare division_id_value uuid;
declare clean_key text := upper(trim(coalesce(p_division_key, '')));
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_OPEN') then raise exception 'Divisions are locked'; end if;
  if clean_key !~ '^[A-Z0-9_-]{1,40}$' then raise exception 'Invalid division key'; end if;
  insert into public.sport_competition_divisions(
    competition_id, division_key, name, display_order, registration_capacity
  ) values (selected.id, clean_key, trim(p_name), p_display_order, p_capacity)
  returning id into division_id_value;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'DIVISION_ADDED', jsonb_build_object('division_id', division_id_value, 'key', clean_key));
  return division_id_value;
end;
$$;

create or replace function app_private.add_sport_competition_venue(
  p_competition_id uuid,
  p_name text,
  p_address text default null,
  p_court_count integer default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare venue_id_value uuid;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if selected.lifecycle in ('COMPLETED', 'ARCHIVED', 'CANCELLED') then raise exception 'Competition is closed'; end if;
  insert into public.sport_competition_venues(competition_id, name, address, court_count)
  values (selected.id, trim(p_name), nullif(trim(p_address), ''), p_court_count)
  returning id into venue_id_value;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'VENUE_ADDED', jsonb_build_object('venue_id', venue_id_value, 'name', trim(p_name)));
  return venue_id_value;
end;
$$;

create or replace function app_private.registration_is_open(
  p_competition public.sport_competitions,
  p_manager boolean
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case when p_manager then p_competition.lifecycle in ('DRAFT', 'REGISTRATION_OPEN')
    else p_competition.lifecycle = 'REGISTRATION_OPEN'
      and (p_competition.registration_opens_at is null or p_competition.registration_opens_at <= now())
      and (p_competition.registration_closes_at is null or p_competition.registration_closes_at >= now()) end
$$;

create or replace function app_private.can_control_sport_entry(p_entry_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.sport_competition_entries entry
    where entry.id = p_entry_id and (
      app_private.can_manage_sport_competition(entry.competition_id)
      or (entry.entry_kind = 'PLAYER' and exists (
        select 1 from public.sport_league_players player
        join public.sport_profiles profile on profile.id = player.sport_profile_id
        where player.entry_id = entry.id and profile.account_id = (select auth.uid())
      ))
      or (entry.entry_kind = 'SQUAD' and exists (
        select 1 from public.sport_tournament_squads squad
        where squad.entry_id = entry.id and app_private.can_manage_sport_team(squad.source_team_id)
      ))
    )
  )
$$;

create or replace function app_private.list_my_manageable_sport_teams(p_sport_code text)
returns table(team_id uuid, club_id uuid, name text, short_name text, logo_url text,
  color_hex text, owner_account_id uuid)
language plpgsql stable security definer set search_path = public
as $$
declare requester public.sport_profiles%rowtype;
begin
  requester := app_private.require_active_sport_profile(p_sport_code);
  return query
  select team.id, team.club_id, team.name, team.short_name, team.logo_url,
    team.color_hex, team.owner_account_id
  from public.sport_teams team
  join public.sport_clubs club on club.id = team.club_id
  where club.sport_id = requester.sport_id and app_private.can_manage_sport_team(team.id)
  order by team.name, team.id;
end;
$$;

create or replace function app_private.list_my_sport_competition_invitations(p_sport_code text)
returns table(access_id uuid, competition_id uuid, competition_name text,
  kind public.sport_competition_kind, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare requester public.sport_profiles%rowtype;
begin
  requester := app_private.require_active_sport_profile(p_sport_code);
  return query
  select access.id, competition.id, competition.name, competition.kind,
    access.role, access.created_at
  from public.sport_competition_access access
  join public.sport_competitions competition on competition.id = access.competition_id
  where access.account_id = requester.account_id and access.status = 'PENDING'
    and competition.sport_id = requester.sport_id
  order by access.created_at desc;
end;
$$;

create or replace function app_private.list_sport_competition_organizers(p_competition_id uuid)
returns table(access_id uuid, account_id uuid, display_name text,
  status public.sport_access_status, accepted_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  perform app_private.require_managed_competition(p_competition_id);
  return query
  select access.id, access.account_id, profile.display_name, access.status, access.accepted_at
  from public.sport_competition_access access
  join public.profiles profile on profile.id = access.account_id
  where access.competition_id = p_competition_id
  order by profile.display_name, access.id;
end;
$$;

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
  select entry.id into entry_id_value
  from public.sport_competition_entries entry
  join public.sport_league_players player on player.entry_id = entry.id
  where entry.competition_id = selected.id and entry.division_key = clean_division
    and player.sport_profile_id = selected_profile.id
    and entry.status not in ('WITHDRAWN', 'REJECTED', 'DISQUALIFIED');
  if entry_id_value is not null then return entry_id_value; end if;
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
declare entry_id_value uuid;
declare manager boolean;
declare clean_division text := upper(trim(coalesce(p_division_key, 'OPEN')));
declare roster_count integer;
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
  select entry.id into entry_id_value
  from public.sport_competition_entries entry
  join public.sport_tournament_squads squad on squad.entry_id = entry.id
  where entry.competition_id = selected.id and entry.division_key = clean_division
    and squad.source_team_id = selected_team.id
    and entry.status not in ('WITHDRAWN', 'REJECTED', 'DISQUALIFIED');
  if entry_id_value is not null then return entry_id_value; end if;
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
    selected_team.name, selected_team.short_name, selected_team.logo_url,
    coalesce((select access.account_id from public.sport_team_access access
      where access.team_id = selected_team.id and access.role = 'CAPTAIN' and access.status = 'ACTIVE'
      order by access.accepted_at limit 1), selected_team.owner_account_id)
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

create or replace function app_private.set_sport_entry_status(
  p_entry_id uuid,
  p_status public.sport_registration_status,
  p_seed integer default null,
  p_reason text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare selected_entry public.sport_competition_entries%rowtype;
declare selected public.sport_competitions%rowtype;
begin
  select * into selected_entry from public.sport_competition_entries where id = p_entry_id for update;
  if not found then raise exception 'Competition entry was not found'; end if;
  selected := app_private.require_managed_competition(selected_entry.competition_id);
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_LOCKED') then
    raise exception 'Registration decisions are locked after publication';
  end if;
  if p_status not in ('APPROVED', 'REJECTED', 'DISQUALIFIED') then
    raise exception 'Unsupported organizer registration decision';
  end if;
  if selected_entry.status = p_status then return; end if;
  if selected_entry.status in ('WITHDRAWN', 'DISQUALIFIED') then raise exception 'Entry is already closed'; end if;
  update public.sport_competition_entries set
    status = p_status,
    seed = case when p_status = 'APPROVED' then p_seed else seed end,
    accepted_at = case when p_status = 'APPROVED' then coalesce(accepted_at, now()) else accepted_at end,
    approved_at = case when p_status = 'APPROVED' then now() else null end,
    updated_at = now()
  where id = selected_entry.id;
  if selected_entry.entry_kind = 'SQUAD' then
    update public.sport_squad_members set
      status = case when p_status = 'APPROVED' then 'APPROVED'::public.sport_registration_status
        when p_status = 'REJECTED' then 'REJECTED'::public.sport_registration_status
        else 'DISQUALIFIED'::public.sport_registration_status end,
      accepted_at = case when p_status = 'APPROVED' then coalesce(accepted_at, now()) else accepted_at end,
      approved_at = case when p_status = 'APPROVED' then now() else null end,
      updated_at = now()
    where squad_entry_id = selected_entry.id;
  end if;
  perform app_private.write_sport_audit(selected.sport_id, 'ENTRY', selected_entry.id,
    'ENTRY_' || p_status::text, jsonb_build_object('seed', p_seed, 'reason', p_reason));
end;
$$;

create or replace function app_private.withdraw_sport_entry(p_entry_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare selected_entry public.sport_competition_entries%rowtype;
declare selected public.sport_competitions%rowtype;
declare authorized boolean;
begin
  select * into selected_entry from public.sport_competition_entries where id = p_entry_id for update;
  if not found then raise exception 'Competition entry was not found'; end if;
  select * into selected from public.sport_competitions where id = selected_entry.competition_id;
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_LOCKED') then
    raise exception 'Entries are locked after publication';
  end if;
  authorized := app_private.can_manage_sport_competition(selected.id)
    or (selected_entry.entry_kind = 'PLAYER' and exists (
      select 1 from public.sport_league_players player
      join public.sport_profiles profile on profile.id = player.sport_profile_id
      where player.entry_id = selected_entry.id and profile.account_id = (select auth.uid())
    ))
    or (selected_entry.entry_kind = 'SQUAD' and exists (
      select 1 from public.sport_tournament_squads squad
      where squad.entry_id = selected_entry.id and app_private.can_manage_sport_team(squad.source_team_id)
    ));
  if not authorized then raise exception 'You cannot withdraw this entry'; end if;
  if selected_entry.status = 'WITHDRAWN' then return; end if;
  update public.sport_competition_entries set status = 'WITHDRAWN', withdrawn_at = now(), updated_at = now()
  where id = selected_entry.id;
  update public.sport_squad_members set status = 'WITHDRAWN', updated_at = now()
  where squad_entry_id = selected_entry.id;
  perform app_private.write_sport_audit(selected.sport_id, 'ENTRY', selected_entry.id,
    'ENTRY_WITHDRAWN', '{}'::jsonb);
end;
$$;

create or replace function app_private.schedule_sport_fixture(
  p_competition_id uuid,
  p_stage_id uuid,
  p_division_key text,
  p_entrant_a_id uuid,
  p_entrant_b_id uuid,
  p_venue_id uuid,
  p_court text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_display_order integer,
  p_expected_schedule_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare existing public.sport_fixtures%rowtype;
declare fixture_id_value uuid;
declare next_version integer;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  select * into selected from public.sport_competitions where id = selected.id for update;
  select * into existing from public.sport_fixtures
  where competition_id = selected.id and idempotency_key = trim(p_idempotency_key);
  if found then return jsonb_build_object('fixture_id', existing.id, 'schedule_version', selected.schedule_version); end if;
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_LOCKED', 'PUBLISHED', 'LIVE') then
    raise exception 'Fixtures cannot be scheduled in the current lifecycle';
  end if;
  if selected.schedule_version <> p_expected_schedule_version then
    raise exception 'Schedule changed; reload before saving';
  end if;
  if not exists (select 1 from public.sport_competition_entries
    where id = p_entrant_a_id and competition_id = selected.id and division_key = upper(trim(p_division_key)) and status = 'APPROVED')
    or not exists (select 1 from public.sport_competition_entries
    where id = p_entrant_b_id and competition_id = selected.id and division_key = upper(trim(p_division_key)) and status = 'APPROVED') then
    raise exception 'Fixtures require two approved entrants in the same division';
  end if;
  insert into public.sport_fixtures(
    competition_id, stage_id, division_key, entrant_a_id, entrant_b_id,
    venue_id, court, scheduled_at, duration_minutes, display_order,
    idempotency_key, created_by
  ) values (
    selected.id, p_stage_id, upper(trim(p_division_key)), p_entrant_a_id, p_entrant_b_id,
    p_venue_id, nullif(trim(p_court), ''), p_scheduled_at, p_duration_minutes,
    p_display_order, trim(p_idempotency_key), (select auth.uid())
  ) returning id into fixture_id_value;
  next_version := selected.schedule_version + 1;
  update public.sport_competitions set schedule_version = next_version, updated_at = now() where id = selected.id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'FIXTURE_SCHEDULED', jsonb_build_object('fixture_id', fixture_id_value, 'schedule_version', next_version));
  return jsonb_build_object('fixture_id', fixture_id_value, 'schedule_version', next_version);
end;
$$;

create or replace function app_private.reschedule_sport_fixture(
  p_fixture_id uuid,
  p_venue_id uuid,
  p_court text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_display_order integer,
  p_expected_schedule_version integer,
  p_expected_row_version integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare selected_fixture public.sport_fixtures%rowtype;
declare selected public.sport_competitions%rowtype;
declare next_version integer;
begin
  select * into selected_fixture from public.sport_fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture was not found'; end if;
  selected := app_private.require_managed_competition(selected_fixture.competition_id);
  select * into selected from public.sport_competitions where id = selected.id for update;
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_LOCKED', 'PUBLISHED', 'LIVE') then
    raise exception 'Fixtures cannot be rescheduled in the current lifecycle';
  end if;
  if selected.schedule_version <> p_expected_schedule_version
    or selected_fixture.row_version <> p_expected_row_version then
    raise exception 'Schedule changed; reload before saving';
  end if;
  if selected_fixture.status = 'CANCELLED' then raise exception 'Cancelled fixture cannot be rescheduled'; end if;
  update public.sport_fixtures set
    venue_id = p_venue_id, court = nullif(trim(p_court), ''), scheduled_at = p_scheduled_at,
    duration_minutes = p_duration_minutes, display_order = p_display_order,
    row_version = row_version + 1, updated_at = now()
  where id = selected_fixture.id;
  next_version := selected.schedule_version + 1;
  update public.sport_competitions set schedule_version = next_version, updated_at = now() where id = selected.id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'FIXTURE_RESCHEDULED', jsonb_build_object('fixture_id', selected_fixture.id, 'schedule_version', next_version));
  return jsonb_build_object('fixture_id', selected_fixture.id, 'schedule_version', next_version,
    'row_version', selected_fixture.row_version + 1);
end;
$$;

create or replace function app_private.cancel_sport_fixture(
  p_fixture_id uuid,
  p_reason text,
  p_expected_schedule_version integer,
  p_expected_row_version integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare selected_fixture public.sport_fixtures%rowtype;
declare selected public.sport_competitions%rowtype;
declare next_version integer;
begin
  select * into selected_fixture from public.sport_fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture was not found'; end if;
  selected := app_private.require_managed_competition(selected_fixture.competition_id);
  select * into selected from public.sport_competitions where id = selected.id for update;
  if selected_fixture.status = 'CANCELLED' then
    return jsonb_build_object('fixture_id', selected_fixture.id, 'schedule_version', selected.schedule_version,
      'row_version', selected_fixture.row_version);
  end if;
  if selected.schedule_version <> p_expected_schedule_version
    or selected_fixture.row_version <> p_expected_row_version then
    raise exception 'Schedule changed; reload before saving';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Cancellation reason is required'; end if;
  update public.sport_fixtures set status = 'CANCELLED', cancellation_reason = trim(p_reason),
    row_version = row_version + 1, updated_at = now() where id = selected_fixture.id;
  next_version := selected.schedule_version + 1;
  update public.sport_competitions set schedule_version = next_version, updated_at = now() where id = selected.id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'FIXTURE_CANCELLED', jsonb_build_object('fixture_id', selected_fixture.id,
      'schedule_version', next_version, 'reason', trim(p_reason)));
  return jsonb_build_object('fixture_id', selected_fixture.id, 'schedule_version', next_version,
    'row_version', selected_fixture.row_version + 1);
end;
$$;

create or replace function app_private.check_in_sport_fixture_entry(
  p_fixture_id uuid,
  p_entry_id uuid,
  p_status public.sport_check_in_status default 'CHECKED_IN'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare selected_fixture public.sport_fixtures%rowtype;
declare selected public.sport_competitions%rowtype;
declare check_in_id_value uuid;
declare manager boolean;
begin
  select * into selected_fixture from public.sport_fixtures where id = p_fixture_id;
  if not found or selected_fixture.status = 'CANCELLED' then raise exception 'Active fixture was not found'; end if;
  if p_entry_id not in (selected_fixture.entrant_a_id, selected_fixture.entrant_b_id) then
    raise exception 'Entry is not part of this fixture';
  end if;
  manager := app_private.can_manage_sport_competition(selected_fixture.competition_id);
  if not manager and (p_status <> 'CHECKED_IN' or not app_private.can_control_sport_entry(p_entry_id)) then
    raise exception 'Only the entrant can check in; organizers control late and no-show states';
  end if;
  insert into public.sport_fixture_check_ins(
    fixture_id, competition_id, entry_id, status, checked_at, checked_by
  ) values (
    selected_fixture.id, selected_fixture.competition_id, p_entry_id, p_status, now(), (select auth.uid())
  ) on conflict (fixture_id, entry_id) do update set
    status = excluded.status, checked_at = excluded.checked_at,
    checked_by = excluded.checked_by, updated_at = now()
  returning id into check_in_id_value;
  select * into selected from public.sport_competitions where id = selected_fixture.competition_id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'FIXTURE_ENTRY_' || p_status::text,
    jsonb_build_object('fixture_id', selected_fixture.id, 'entry_id', p_entry_id));
  return check_in_id_value;
end;
$$;

-- Public wrappers are the only write surface exposed to authenticated clients.
create or replace function public.can_manage_sport_competition(p_competition_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select app_private.can_manage_sport_competition(p_competition_id) $$;
create or replace function public.list_my_manageable_sport_teams(p_sport_code text)
returns table(team_id uuid, club_id uuid, name text, short_name text, logo_url text,
  color_hex text, owner_account_id uuid)
language sql stable security definer set search_path = public
as $$ select * from app_private.list_my_manageable_sport_teams(p_sport_code) $$;
create or replace function public.list_my_sport_competition_invitations(p_sport_code text)
returns table(access_id uuid, competition_id uuid, competition_name text,
  kind public.sport_competition_kind, role text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$ select * from app_private.list_my_sport_competition_invitations(p_sport_code) $$;
create or replace function public.list_sport_competition_organizers(p_competition_id uuid)
returns table(access_id uuid, account_id uuid, display_name text,
  status public.sport_access_status, accepted_at timestamptz)
language sql stable security definer set search_path = public
as $$ select * from app_private.list_sport_competition_organizers(p_competition_id) $$;
create or replace function public.create_sport_competition(p_sport_code text, p_kind public.sport_competition_kind,
  p_name text, p_match_format text default 'SINGLES', p_description text default null,
  p_visibility public.sport_resource_visibility default 'PRIVATE', p_timezone text default 'UTC',
  p_starts_at timestamptz default null, p_ends_at timestamptz default null,
  p_registration_opens_at timestamptz default null, p_registration_closes_at timestamptz default null)
returns uuid language sql security definer set search_path = public
as $$ select app_private.create_sport_competition(p_sport_code, p_kind, p_name, p_match_format,
  p_description, p_visibility, p_timezone, p_starts_at, p_ends_at,
  p_registration_opens_at, p_registration_closes_at) $$;
create or replace function public.update_sport_competition(p_competition_id uuid, p_name text,
  p_description text, p_visibility public.sport_resource_visibility, p_timezone text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_registration_opens_at timestamptz,
  p_registration_closes_at timestamptz)
returns void language sql security definer set search_path = public
as $$ select app_private.update_sport_competition(p_competition_id, p_name, p_description,
  p_visibility, p_timezone, p_starts_at, p_ends_at, p_registration_opens_at, p_registration_closes_at) $$;
create or replace function public.transition_sport_competition(p_competition_id uuid,
  p_target public.sport_competition_lifecycle, p_reason text default null)
returns void language sql security definer set search_path = public
as $$ select app_private.transition_sport_competition(p_competition_id, p_target, p_reason) $$;
create or replace function public.transfer_sport_competition_ownership(p_competition_id uuid, p_new_owner_account_id uuid)
returns void language sql security definer set search_path = public
as $$ select app_private.transfer_sport_competition_ownership(p_competition_id, p_new_owner_account_id) $$;
create or replace function public.invite_sport_competition_organizer(p_competition_id uuid, p_account_id uuid)
returns uuid language sql security definer set search_path = public
as $$ select app_private.invite_sport_competition_organizer(p_competition_id, p_account_id) $$;
create or replace function public.respond_sport_competition_organizer(p_access_id uuid, p_accept boolean)
returns uuid language sql security definer set search_path = public
as $$ select app_private.respond_sport_competition_organizer(p_access_id, p_accept) $$;
create or replace function public.revoke_sport_competition_organizer(p_competition_id uuid, p_account_id uuid)
returns void language sql security definer set search_path = public
as $$ select app_private.revoke_sport_competition_organizer(p_competition_id, p_account_id) $$;
create or replace function public.add_sport_competition_stage(p_competition_id uuid, p_name text,
  p_kind public.sport_stage_kind, p_display_order integer)
returns uuid language sql security definer set search_path = public
as $$ select app_private.add_sport_competition_stage(p_competition_id, p_name, p_kind, p_display_order) $$;
create or replace function public.add_sport_competition_division(p_competition_id uuid,
  p_division_key text, p_name text, p_display_order integer, p_capacity integer default null)
returns uuid language sql security definer set search_path = public
as $$ select app_private.add_sport_competition_division(p_competition_id, p_division_key,
  p_name, p_display_order, p_capacity) $$;
create or replace function public.add_sport_competition_venue(p_competition_id uuid, p_name text,
  p_address text default null, p_court_count integer default null)
returns uuid language sql security definer set search_path = public
as $$ select app_private.add_sport_competition_venue(p_competition_id, p_name, p_address, p_court_count) $$;
create or replace function public.register_sport_league_player(p_competition_id uuid,
  p_sport_profile_id uuid, p_division_key text default 'OPEN')
returns uuid language sql security definer set search_path = public
as $$ select app_private.register_sport_league_player(p_competition_id, p_sport_profile_id, p_division_key) $$;
create or replace function public.register_sport_tournament_squad(p_competition_id uuid,
  p_team_id uuid, p_division_key text default 'OPEN')
returns uuid language sql security definer set search_path = public
as $$ select app_private.register_sport_tournament_squad(p_competition_id, p_team_id, p_division_key) $$;
create or replace function public.set_sport_entry_status(p_entry_id uuid,
  p_status public.sport_registration_status, p_seed integer default null, p_reason text default null)
returns void language sql security definer set search_path = public
as $$ select app_private.set_sport_entry_status(p_entry_id, p_status, p_seed, p_reason) $$;
create or replace function public.withdraw_sport_entry(p_entry_id uuid)
returns void language sql security definer set search_path = public
as $$ select app_private.withdraw_sport_entry(p_entry_id) $$;
create or replace function public.schedule_sport_fixture(p_competition_id uuid, p_stage_id uuid,
  p_division_key text, p_entrant_a_id uuid, p_entrant_b_id uuid, p_venue_id uuid,
  p_court text, p_scheduled_at timestamptz, p_duration_minutes integer, p_display_order integer,
  p_expected_schedule_version integer, p_idempotency_key text)
returns jsonb language sql security definer set search_path = public
as $$ select app_private.schedule_sport_fixture(p_competition_id, p_stage_id, p_division_key,
  p_entrant_a_id, p_entrant_b_id, p_venue_id, p_court, p_scheduled_at,
  p_duration_minutes, p_display_order, p_expected_schedule_version, p_idempotency_key) $$;
create or replace function public.reschedule_sport_fixture(p_fixture_id uuid, p_venue_id uuid,
  p_court text, p_scheduled_at timestamptz, p_duration_minutes integer, p_display_order integer,
  p_expected_schedule_version integer, p_expected_row_version integer)
returns jsonb language sql security definer set search_path = public
as $$ select app_private.reschedule_sport_fixture(p_fixture_id, p_venue_id, p_court,
  p_scheduled_at, p_duration_minutes, p_display_order, p_expected_schedule_version,
  p_expected_row_version) $$;
create or replace function public.cancel_sport_fixture(p_fixture_id uuid, p_reason text,
  p_expected_schedule_version integer, p_expected_row_version integer)
returns jsonb language sql security definer set search_path = public
as $$ select app_private.cancel_sport_fixture(p_fixture_id, p_reason,
  p_expected_schedule_version, p_expected_row_version) $$;
create or replace function public.check_in_sport_fixture_entry(p_fixture_id uuid, p_entry_id uuid,
  p_status public.sport_check_in_status default 'CHECKED_IN')
returns uuid language sql security definer set search_path = public
as $$ select app_private.check_in_sport_fixture_entry(p_fixture_id, p_entry_id, p_status) $$;

revoke all on function app_private.require_managed_competition(uuid) from public, anon, authenticated;
revoke all on function app_private.registration_is_open(public.sport_competitions, boolean) from public, anon, authenticated;
revoke all on function app_private.can_control_sport_entry(uuid) from public, anon, authenticated;
revoke all on function app_private.list_my_manageable_sport_teams(text) from public, anon, authenticated;
revoke all on function app_private.list_my_sport_competition_invitations(text) from public, anon, authenticated;
revoke all on function app_private.list_sport_competition_organizers(uuid) from public, anon, authenticated;

revoke all on function app_private.create_sport_competition(text, public.sport_competition_kind, text,
  text, text, public.sport_resource_visibility, text, timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function app_private.update_sport_competition(uuid, text, text,
  public.sport_resource_visibility, text, timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function app_private.transition_sport_competition(uuid,
  public.sport_competition_lifecycle, text) from public, anon, authenticated;
revoke all on function app_private.transfer_sport_competition_ownership(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.invite_sport_competition_organizer(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.respond_sport_competition_organizer(uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.revoke_sport_competition_organizer(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.add_sport_competition_stage(uuid, text, public.sport_stage_kind, integer)
  from public, anon, authenticated;
revoke all on function app_private.add_sport_competition_division(uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function app_private.add_sport_competition_venue(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function app_private.register_sport_league_player(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.register_sport_tournament_squad(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.set_sport_entry_status(uuid, public.sport_registration_status, integer, text)
  from public, anon, authenticated;
revoke all on function app_private.withdraw_sport_entry(uuid) from public, anon, authenticated;
revoke all on function app_private.schedule_sport_fixture(uuid, uuid, text, uuid, uuid, uuid, text,
  timestamptz, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function app_private.reschedule_sport_fixture(uuid, uuid, text, timestamptz,
  integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function app_private.cancel_sport_fixture(uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function app_private.check_in_sport_fixture_entry(uuid, uuid, public.sport_check_in_status)
  from public, anon, authenticated;

revoke all on function public.can_manage_sport_competition(uuid) from public, anon;
revoke all on function public.list_my_manageable_sport_teams(text) from public, anon;
revoke all on function public.list_my_sport_competition_invitations(text) from public, anon;
revoke all on function public.list_sport_competition_organizers(uuid) from public, anon;
revoke all on function public.create_sport_competition(text, public.sport_competition_kind, text,
  text, text, public.sport_resource_visibility, text, timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon;
revoke all on function public.update_sport_competition(uuid, text, text,
  public.sport_resource_visibility, text, timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon;
revoke all on function public.transition_sport_competition(uuid, public.sport_competition_lifecycle, text)
  from public, anon;
revoke all on function public.transfer_sport_competition_ownership(uuid, uuid) from public, anon;
revoke all on function public.invite_sport_competition_organizer(uuid, uuid) from public, anon;
revoke all on function public.respond_sport_competition_organizer(uuid, boolean) from public, anon;
revoke all on function public.revoke_sport_competition_organizer(uuid, uuid) from public, anon;
revoke all on function public.add_sport_competition_stage(uuid, text, public.sport_stage_kind, integer)
  from public, anon;
revoke all on function public.add_sport_competition_division(uuid, text, text, integer, integer)
  from public, anon;
revoke all on function public.add_sport_competition_venue(uuid, text, text, integer) from public, anon;
revoke all on function public.register_sport_league_player(uuid, uuid, text) from public, anon;
revoke all on function public.register_sport_tournament_squad(uuid, uuid, text) from public, anon;
revoke all on function public.set_sport_entry_status(uuid, public.sport_registration_status, integer, text)
  from public, anon;
revoke all on function public.withdraw_sport_entry(uuid) from public, anon;
revoke all on function public.schedule_sport_fixture(uuid, uuid, text, uuid, uuid, uuid, text,
  timestamptz, integer, integer, integer, text) from public, anon;
revoke all on function public.reschedule_sport_fixture(uuid, uuid, text, timestamptz,
  integer, integer, integer, integer) from public, anon;
revoke all on function public.cancel_sport_fixture(uuid, text, integer, integer) from public, anon;
revoke all on function public.check_in_sport_fixture_entry(uuid, uuid, public.sport_check_in_status)
  from public, anon;
grant execute on function public.can_manage_sport_competition(uuid) to authenticated;
grant execute on function public.list_my_manageable_sport_teams(text) to authenticated;
grant execute on function public.list_my_sport_competition_invitations(text) to authenticated;
grant execute on function public.list_sport_competition_organizers(uuid) to authenticated;
grant execute on function public.create_sport_competition(text, public.sport_competition_kind, text, text,
  text, public.sport_resource_visibility, text, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function public.update_sport_competition(uuid, text, text, public.sport_resource_visibility,
  text, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function public.transition_sport_competition(uuid, public.sport_competition_lifecycle, text) to authenticated;
grant execute on function public.transfer_sport_competition_ownership(uuid, uuid) to authenticated;
grant execute on function public.invite_sport_competition_organizer(uuid, uuid) to authenticated;
grant execute on function public.respond_sport_competition_organizer(uuid, boolean) to authenticated;
grant execute on function public.revoke_sport_competition_organizer(uuid, uuid) to authenticated;
grant execute on function public.add_sport_competition_stage(uuid, text, public.sport_stage_kind, integer) to authenticated;
grant execute on function public.add_sport_competition_division(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.add_sport_competition_venue(uuid, text, text, integer) to authenticated;
grant execute on function public.register_sport_league_player(uuid, uuid, text) to authenticated;
grant execute on function public.register_sport_tournament_squad(uuid, uuid, text) to authenticated;
grant execute on function public.set_sport_entry_status(uuid, public.sport_registration_status, integer, text) to authenticated;
grant execute on function public.withdraw_sport_entry(uuid) to authenticated;
grant execute on function public.schedule_sport_fixture(uuid, uuid, text, uuid, uuid, uuid, text,
  timestamptz, integer, integer, integer, text) to authenticated;
grant execute on function public.reschedule_sport_fixture(uuid, uuid, text, timestamptz, integer,
  integer, integer, integer) to authenticated;
grant execute on function public.cancel_sport_fixture(uuid, text, integer, integer) to authenticated;
grant execute on function public.check_in_sport_fixture_entry(uuid, uuid, public.sport_check_in_status)
  to authenticated;

update public.sport_feature_flags set enabled = true, rollout_percentage = 100, updated_at = now()
where feature_key = 'cloud_competitions'
  and sport_id in (select id from public.sports where code in (
    'TENNIS', 'BADMINTON', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL'
  ));

comment on table public.sport_fixtures is
  'Owner/organizer-created fixtures only. SportStage does not generate draws or pairings.';

-- Public registration pages must be readable before publication. Draft and
-- private competitions remain restricted to managers and registered entrants.
create or replace function app_private.can_read_sport_competition(p_competition_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.sport_competitions competition
    where competition.id = p_competition_id and (
      (competition.visibility = 'PUBLIC' and competition.lifecycle in (
        'REGISTRATION_OPEN', 'REGISTRATION_LOCKED', 'PUBLISHED', 'LIVE', 'COMPLETED', 'ARCHIVED'
      ))
      or app_private.can_manage_sport_competition(competition.id)
      or exists (
        select 1 from public.sport_competition_entries entry
        join public.sport_league_players player on player.entry_id = entry.id
        join public.sport_profiles profile on profile.id = player.sport_profile_id
        where entry.competition_id = competition.id and profile.account_id = (select auth.uid())
      )
      or exists (
        select 1 from public.sport_competition_entries entry
        join public.sport_tournament_squads squad on squad.entry_id = entry.id
        join public.sport_squad_members member on member.squad_entry_id = squad.entry_id
        join public.sport_profiles profile on profile.id = member.sport_profile_id
        where entry.competition_id = competition.id and profile.account_id = (select auth.uid())
      )
    )
  )
$$;
