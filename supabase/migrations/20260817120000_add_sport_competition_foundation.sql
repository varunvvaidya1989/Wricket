-- Non-cricket competition foundation. Cricket continues to use the existing
-- tournaments, teams, players, matches, and scoring tables.

create type public.sport_resource_visibility as enum ('PUBLIC', 'PRIVATE');
create type public.sport_access_status as enum ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED');
create type public.sport_membership_status as enum ('INVITED', 'ACTIVE', 'LEFT', 'REMOVED');
create type public.sport_competition_kind as enum ('TOURNAMENT', 'LEAGUE');
create type public.sport_competition_lifecycle as enum (
  'DRAFT',
  'REGISTRATION_OPEN',
  'REGISTRATION_LOCKED',
  'PUBLISHED',
  'LIVE',
  'COMPLETED',
  'ARCHIVED',
  'CANCELLED'
);
create type public.sport_stage_kind as enum ('GROUP', 'ROUND_ROBIN', 'KNOCKOUT', 'FINALS', 'CUSTOM');
create type public.sport_entry_kind as enum ('SQUAD', 'PLAYER');
create type public.sport_registration_status as enum (
  'PENDING', 'ACCEPTED', 'APPROVED', 'WITHDRAWN', 'REJECTED', 'DISQUALIFIED'
);

create table public.sport_feature_flags (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  sport_id uuid references public.sports(id) on delete cascade,
  enabled boolean not null default false,
  rollout_percentage integer not null default 0 check (rollout_percentage between 0 and 100),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index sport_feature_flags_global_key_idx
on public.sport_feature_flags(feature_key)
where sport_id is null;
create unique index sport_feature_flags_sport_key_idx
on public.sport_feature_flags(feature_key, sport_id)
where sport_id is not null;

create table public.sport_clubs (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 120),
  short_name text check (short_name is null or length(trim(short_name)) between 2 and 20),
  logo_url text,
  visibility public.sport_resource_visibility not null default 'PUBLIC',
  owner_account_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sport_club_access (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.sport_clubs(id) on delete cascade,
  account_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role = 'MANAGER'),
  status public.sport_access_status not null default 'PENDING',
  granted_by uuid not null references public.profiles(id) on delete restrict,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, account_id),
  check (expires_at is null or expires_at > created_at),
  check (status <> 'ACTIVE' or accepted_at is not null)
);

create table public.sport_club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.sport_clubs(id) on delete cascade,
  sport_profile_id uuid references public.sport_profiles(id) on delete set null,
  status public.sport_membership_status not null default 'INVITED',
  display_name_snapshot text not null check (length(trim(display_name_snapshot)) between 2 and 120),
  avatar_url_snapshot text,
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'ACTIVE' or accepted_at is not null)
);

create unique index sport_club_memberships_profile_idx
on public.sport_club_memberships(club_id, sport_profile_id)
where sport_profile_id is not null;
create index sport_club_memberships_profile_status_idx
on public.sport_club_memberships(sport_profile_id, status)
where sport_profile_id is not null;

create table public.sport_teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.sport_clubs(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  short_name text check (short_name is null or length(trim(short_name)) between 2 and 20),
  logo_url text,
  color_hex text check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  owner_account_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, name)
);

create table public.sport_team_access (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.sport_teams(id) on delete cascade,
  account_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('MANAGER', 'CAPTAIN')),
  status public.sport_access_status not null default 'PENDING',
  granted_by uuid not null references public.profiles(id) on delete restrict,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, account_id, role),
  check (expires_at is null or expires_at > created_at),
  check (status <> 'ACTIVE' or accepted_at is not null)
);

create table public.sport_team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.sport_teams(id) on delete cascade,
  sport_profile_id uuid references public.sport_profiles(id) on delete set null,
  club_membership_id uuid references public.sport_club_memberships(id) on delete set null,
  status public.sport_membership_status not null default 'INVITED',
  display_name_snapshot text not null check (length(trim(display_name_snapshot)) between 2 and 120),
  avatar_url_snapshot text,
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'ACTIVE' or accepted_at is not null)
);

create unique index sport_team_memberships_profile_idx
on public.sport_team_memberships(team_id, sport_profile_id)
where sport_profile_id is not null;
create index sport_team_memberships_profile_status_idx
on public.sport_team_memberships(sport_profile_id, status)
where sport_profile_id is not null;

create table public.sport_competitions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  kind public.sport_competition_kind not null,
  name text not null check (length(trim(name)) between 2 and 160),
  description text,
  visibility public.sport_resource_visibility not null default 'PRIVATE',
  lifecycle public.sport_competition_lifecycle not null default 'DRAFT',
  owner_account_id uuid not null references public.profiles(id) on delete restrict,
  timezone text not null default 'UTC' check (length(trim(timezone)) between 1 and 80),
  starts_at timestamptz,
  ends_at timestamptz,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  registration_locked_at timestamptz,
  published_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object'),
  schedule_version integer not null default 0 check (schedule_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (
    registration_closes_at is null
    or registration_opens_at is null
    or registration_closes_at >= registration_opens_at
  ),
  check (lifecycle <> 'CANCELLED' or cancelled_at is not null),
  check (lifecycle = 'CANCELLED' or cancelled_at is null),
  check (cancelled_at is null or nullif(trim(cancellation_reason), '') is not null)
);

create table public.sport_competition_access (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  account_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role = 'ORGANIZER'),
  status public.sport_access_status not null default 'PENDING',
  granted_by uuid not null references public.profiles(id) on delete restrict,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, account_id),
  check (expires_at is null or expires_at > created_at),
  check (status <> 'ACTIVE' or accepted_at is not null)
);

create table public.sport_competition_stages (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  kind public.sport_stage_kind not null,
  display_order integer not null check (display_order >= 0),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, display_order),
  unique (id, competition_id)
);

create table public.sport_competition_entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  entry_kind public.sport_entry_kind not null,
  division_key text not null default 'OPEN' check (length(trim(division_key)) between 1 and 40),
  status public.sport_registration_status not null default 'PENDING',
  seed integer check (seed is null or seed > 0),
  accepted_at timestamptz,
  approved_at timestamptz,
  withdrawn_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, competition_id),
  check (status <> 'ACCEPTED' or accepted_at is not null),
  check (status <> 'APPROVED' or (accepted_at is not null and approved_at is not null)),
  check (status <> 'WITHDRAWN' or withdrawn_at is not null)
);

create table public.sport_tournament_squads (
  entry_id uuid primary key,
  competition_id uuid not null,
  division_key text not null check (length(trim(division_key)) between 1 and 40),
  source_team_id uuid not null references public.sport_teams(id) on delete restrict,
  name_snapshot text not null check (length(trim(name_snapshot)) between 2 and 120),
  short_name_snapshot text,
  logo_url_snapshot text,
  captain_account_id uuid references public.profiles(id) on delete set null,
  roster_locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (entry_id, competition_id)
    references public.sport_competition_entries(id, competition_id) on delete cascade,
  unique (competition_id, division_key, source_team_id)
);

create table public.sport_squad_members (
  id uuid primary key default gen_random_uuid(),
  squad_entry_id uuid not null references public.sport_tournament_squads(entry_id) on delete cascade,
  sport_profile_id uuid references public.sport_profiles(id) on delete set null,
  display_name_snapshot text not null check (length(trim(display_name_snapshot)) between 2 and 120),
  avatar_url_snapshot text,
  eligibility jsonb not null default '[]'::jsonb check (jsonb_typeof(eligibility) = 'array'),
  status public.sport_registration_status not null default 'PENDING',
  accepted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'ACCEPTED' or accepted_at is not null),
  check (status <> 'APPROVED' or (accepted_at is not null and approved_at is not null))
);

create unique index sport_squad_members_profile_idx
on public.sport_squad_members(squad_entry_id, sport_profile_id)
where sport_profile_id is not null;

create table public.sport_league_players (
  entry_id uuid primary key,
  competition_id uuid not null,
  division_key text not null check (length(trim(division_key)) between 1 and 40),
  sport_profile_id uuid references public.sport_profiles(id) on delete set null,
  display_name_snapshot text not null check (length(trim(display_name_snapshot)) between 2 and 120),
  avatar_url_snapshot text,
  eligibility jsonb not null default '[]'::jsonb check (jsonb_typeof(eligibility) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (entry_id, competition_id)
    references public.sport_competition_entries(id, competition_id) on delete cascade
);

create unique index sport_league_players_profile_division_idx
on public.sport_league_players(competition_id, division_key, sport_profile_id)
where sport_profile_id is not null;

create table public.sport_audit_events (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  actor_account_id uuid references public.profiles(id) on delete set null,
  resource_type text not null check (resource_type in ('CLUB', 'TEAM', 'COMPETITION', 'ENTRY')),
  resource_id uuid not null,
  action text not null check (length(trim(action)) between 3 and 80),
  reason text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now()
);

create index sport_clubs_sport_visibility_idx on public.sport_clubs(sport_id, visibility);
create index sport_club_access_account_status_idx on public.sport_club_access(account_id, status);
create index sport_teams_club_idx on public.sport_teams(club_id);
create index sport_team_access_account_status_idx on public.sport_team_access(account_id, status);
create index sport_competitions_sport_lifecycle_idx
on public.sport_competitions(sport_id, lifecycle, starts_at);
create index sport_competitions_owner_idx on public.sport_competitions(owner_account_id, lifecycle);
create index sport_competition_access_account_status_idx
on public.sport_competition_access(account_id, status);
create index sport_competition_entries_competition_status_idx
on public.sport_competition_entries(competition_id, status, division_key);
create index sport_squad_members_profile_status_idx
on public.sport_squad_members(sport_profile_id, status)
where sport_profile_id is not null;
create index sport_audit_events_resource_idx
on public.sport_audit_events(resource_type, resource_id, occurred_at desc);
create index sport_audit_events_actor_idx
on public.sport_audit_events(actor_account_id, occurred_at desc)
where actor_account_id is not null;

create or replace function app_private.account_has_active_sport_profile(
  p_account_id uuid,
  p_sport_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sport_profiles profile
    where profile.account_id = p_account_id
      and profile.sport_id = p_sport_id
      and profile.status = 'ACTIVE'
  )
$$;

create or replace function app_private.can_manage_sport_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sport_clubs club
    left join public.sport_club_access access
      on access.club_id = club.id
      and access.account_id = (select auth.uid())
      and access.role = 'MANAGER'
      and access.status = 'ACTIVE'
      and (access.expires_at is null or access.expires_at > now())
    where club.id = p_club_id
      and (club.owner_account_id = (select auth.uid()) or access.id is not null)
  )
$$;

create or replace function app_private.can_read_sport_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sport_clubs club
    where club.id = p_club_id
      and (
        club.visibility = 'PUBLIC'
        or (select app_private.can_manage_sport_club(club.id))
        or exists (
          select 1
          from public.sport_club_memberships membership
          join public.sport_profiles profile on profile.id = membership.sport_profile_id
          where membership.club_id = club.id
            and membership.status = 'ACTIVE'
            and profile.account_id = (select auth.uid())
        )
      )
  )
$$;

create or replace function app_private.can_manage_sport_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sport_teams team
    left join public.sport_team_access access
      on access.team_id = team.id
      and access.account_id = (select auth.uid())
      and access.status = 'ACTIVE'
      and (access.expires_at is null or access.expires_at > now())
    where team.id = p_team_id
      and (
        team.owner_account_id = (select auth.uid())
        or (select app_private.can_manage_sport_club(team.club_id))
        or access.id is not null
      )
  )
$$;

create or replace function app_private.can_read_sport_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sport_teams team
    where team.id = p_team_id
      and (
        (select app_private.can_read_sport_club(team.club_id))
        or (select app_private.can_manage_sport_team(team.id))
        or exists (
          select 1
          from public.sport_team_memberships membership
          join public.sport_profiles profile on profile.id = membership.sport_profile_id
          where membership.team_id = team.id
            and membership.status = 'ACTIVE'
            and profile.account_id = (select auth.uid())
        )
      )
  )
$$;

create or replace function app_private.can_manage_sport_competition(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sport_competitions competition
    left join public.sport_competition_access access
      on access.competition_id = competition.id
      and access.account_id = (select auth.uid())
      and access.role = 'ORGANIZER'
      and access.status = 'ACTIVE'
      and (access.expires_at is null or access.expires_at > now())
    where competition.id = p_competition_id
      and (competition.owner_account_id = (select auth.uid()) or access.id is not null)
  )
$$;

create or replace function app_private.can_read_sport_competition(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sport_competitions competition
    where competition.id = p_competition_id
      and (
        (
          competition.visibility = 'PUBLIC'
          and competition.lifecycle in ('PUBLISHED', 'LIVE', 'COMPLETED', 'ARCHIVED')
        )
        or (select app_private.can_manage_sport_competition(competition.id))
        or exists (
          select 1
          from public.sport_competition_entries entry
          join public.sport_league_players player on player.entry_id = entry.id
          join public.sport_profiles profile on profile.id = player.sport_profile_id
          where entry.competition_id = competition.id
            and profile.account_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.sport_competition_entries entry
          join public.sport_tournament_squads squad on squad.entry_id = entry.id
          join public.sport_squad_members member on member.squad_entry_id = squad.entry_id
          join public.sport_profiles profile on profile.id = member.sport_profile_id
          where entry.competition_id = competition.id
            and profile.account_id = (select auth.uid())
        )
      )
  )
$$;

create or replace function app_private.enforce_sport_foundation_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare expected_sport_id uuid;
declare selected_account_id uuid;
begin
  if tg_table_name = 'sport_clubs' then
    expected_sport_id := new.sport_id;
    selected_account_id := new.owner_account_id;
  elsif tg_table_name = 'sport_teams' then
    select club.sport_id into expected_sport_id
    from public.sport_clubs club where club.id = new.club_id;
    selected_account_id := new.owner_account_id;
  elsif tg_table_name = 'sport_competitions' then
    expected_sport_id := new.sport_id;
    selected_account_id := new.owner_account_id;
  elsif tg_table_name = 'sport_club_access' then
    select club.sport_id into expected_sport_id
    from public.sport_clubs club where club.id = new.club_id;
    selected_account_id := new.account_id;
  elsif tg_table_name = 'sport_team_access' then
    select club.sport_id into expected_sport_id
    from public.sport_teams team
    join public.sport_clubs club on club.id = team.club_id
    where team.id = new.team_id;
    selected_account_id := new.account_id;
  elsif tg_table_name = 'sport_competition_access' then
    select competition.sport_id into expected_sport_id
    from public.sport_competitions competition where competition.id = new.competition_id;
    selected_account_id := new.account_id;
  elsif tg_table_name = 'sport_club_memberships' then
    if new.sport_profile_id is null then return new; end if;
    select club.sport_id into expected_sport_id
    from public.sport_clubs club where club.id = new.club_id;
    if not exists (
      select 1 from public.sport_profiles profile
      where profile.id = new.sport_profile_id
        and profile.sport_id = expected_sport_id
        and profile.status = 'ACTIVE'
    ) then raise exception 'Player must have an active profile for the club sport'; end if;
    return new;
  elsif tg_table_name = 'sport_team_memberships' then
    if new.sport_profile_id is null then return new; end if;
    select club.sport_id into expected_sport_id
    from public.sport_teams team
    join public.sport_clubs club on club.id = team.club_id
    where team.id = new.team_id;
    if not exists (
      select 1 from public.sport_profiles profile
      where profile.id = new.sport_profile_id
        and profile.sport_id = expected_sport_id
        and profile.status = 'ACTIVE'
    ) then raise exception 'Player must have an active profile for the team sport'; end if;
    return new;
  elsif tg_table_name = 'sport_squad_members' then
    if new.sport_profile_id is null then return new; end if;
    select competition.sport_id into expected_sport_id
    from public.sport_tournament_squads squad
    join public.sport_competitions competition on competition.id = squad.competition_id
    where squad.entry_id = new.squad_entry_id;
    if not exists (
      select 1 from public.sport_profiles profile
      where profile.id = new.sport_profile_id
        and profile.sport_id = expected_sport_id
        and profile.status = 'ACTIVE'
    ) then raise exception 'Player must have an active profile for the competition sport'; end if;
    if exists (
      select 1
      from public.sport_squad_members other_member
      join public.sport_tournament_squads other_squad
        on other_squad.entry_id = other_member.squad_entry_id
      join public.sport_tournament_squads selected_squad
        on selected_squad.entry_id = new.squad_entry_id
      where other_member.sport_profile_id = new.sport_profile_id
        and other_member.id <> new.id
        and other_squad.competition_id = selected_squad.competition_id
        and other_squad.division_key = selected_squad.division_key
        and other_member.status not in ('WITHDRAWN', 'REJECTED', 'DISQUALIFIED')
    ) then raise exception 'Player cannot represent multiple squads in one competition division'; end if;
    return new;
  elsif tg_table_name = 'sport_league_players' then
    if new.sport_profile_id is null then return new; end if;
    select competition.sport_id into expected_sport_id
    from public.sport_competitions competition where competition.id = new.competition_id;
    if not exists (
      select 1 from public.sport_profiles profile
      where profile.id = new.sport_profile_id
        and profile.sport_id = expected_sport_id
        and profile.status = 'ACTIVE'
    ) then raise exception 'Player must have an active profile for the competition sport'; end if;
    return new;
  else
    raise exception 'Unsupported sport foundation identity table: %', tg_table_name;
  end if;

  if not (select app_private.account_has_active_sport_profile(selected_account_id, expected_sport_id)) then
    raise exception 'Account must have an active profile for this sport';
  end if;
  return new;
end;
$$;

create or replace function app_private.validate_sport_entry_detail()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare selected_entry public.sport_competition_entries%rowtype;
declare selected_competition public.sport_competitions%rowtype;
declare selected_entry_id uuid;
declare squad_count integer;
declare player_count integer;
begin
  selected_entry_id := case
    when tg_table_name = 'sport_competition_entries' then coalesce(new.id, old.id)
    else coalesce(new.entry_id, old.entry_id)
  end;

  select * into selected_entry
  from public.sport_competition_entries entry where entry.id = selected_entry_id;
  if not found then return null; end if;

  select * into selected_competition
  from public.sport_competitions competition where competition.id = selected_entry.competition_id;
  select count(*) into squad_count
  from public.sport_tournament_squads squad where squad.entry_id = selected_entry.id;
  select count(*) into player_count
  from public.sport_league_players player where player.entry_id = selected_entry.id;

  if selected_competition.kind = 'TOURNAMENT'
    and (selected_entry.entry_kind <> 'SQUAD' or squad_count <> 1 or player_count <> 0) then
    raise exception 'Tournament entries must contain exactly one squad';
  end if;
  if squad_count = 1 and exists (
    select 1
    from public.sport_tournament_squads squad
    join public.sport_teams team on team.id = squad.source_team_id
    join public.sport_clubs club on club.id = team.club_id
    where squad.entry_id = selected_entry.id
      and (
        squad.competition_id <> selected_entry.competition_id
        or squad.division_key <> selected_entry.division_key
        or club.sport_id <> selected_competition.sport_id
      )
  ) then
    raise exception 'Tournament squad must match the entry division and competition sport';
  end if;
  if selected_competition.kind = 'LEAGUE'
    and (selected_entry.entry_kind <> 'PLAYER' or player_count <> 1 or squad_count <> 0) then
    raise exception 'League entries must contain exactly one player';
  end if;
  if player_count = 1 and exists (
    select 1
    from public.sport_league_players player
    where player.entry_id = selected_entry.id
      and (
        player.competition_id <> selected_entry.competition_id
        or player.division_key <> selected_entry.division_key
      )
  ) then
    raise exception 'League player must match the entry division';
  end if;
  return null;
end;
$$;

create trigger sport_clubs_validate_identity
before insert or update of sport_id, owner_account_id on public.sport_clubs
for each row execute function app_private.enforce_sport_foundation_identity();
create trigger sport_teams_validate_identity
before insert or update of club_id, owner_account_id on public.sport_teams
for each row execute function app_private.enforce_sport_foundation_identity();
create trigger sport_competitions_validate_identity
before insert or update of sport_id, owner_account_id on public.sport_competitions
for each row execute function app_private.enforce_sport_foundation_identity();
create trigger sport_club_access_validate_identity
before insert or update of club_id, account_id on public.sport_club_access
for each row execute function app_private.enforce_sport_foundation_identity();
create trigger sport_team_access_validate_identity
before insert or update of team_id, account_id on public.sport_team_access
for each row execute function app_private.enforce_sport_foundation_identity();
create trigger sport_competition_access_validate_identity
before insert or update of competition_id, account_id on public.sport_competition_access
for each row execute function app_private.enforce_sport_foundation_identity();
create trigger sport_club_memberships_validate_identity
before insert or update of club_id, sport_profile_id on public.sport_club_memberships
for each row execute function app_private.enforce_sport_foundation_identity();
create trigger sport_team_memberships_validate_identity
before insert or update of team_id, sport_profile_id on public.sport_team_memberships
for each row execute function app_private.enforce_sport_foundation_identity();
create trigger sport_squad_members_validate_identity
before insert or update of squad_entry_id, sport_profile_id on public.sport_squad_members
for each row execute function app_private.enforce_sport_foundation_identity();
create trigger sport_league_players_validate_identity
before insert or update of competition_id, sport_profile_id on public.sport_league_players
for each row execute function app_private.enforce_sport_foundation_identity();

create constraint trigger sport_competition_entries_validate_detail
after insert or update on public.sport_competition_entries
deferrable initially deferred
for each row execute function app_private.validate_sport_entry_detail();
create constraint trigger sport_tournament_squads_validate_detail
after insert or update or delete on public.sport_tournament_squads
deferrable initially deferred
for each row execute function app_private.validate_sport_entry_detail();
create constraint trigger sport_league_players_validate_detail
after insert or update or delete on public.sport_league_players
deferrable initially deferred
for each row execute function app_private.validate_sport_entry_detail();

alter table public.sport_feature_flags enable row level security;
alter table public.sport_clubs enable row level security;
alter table public.sport_club_access enable row level security;
alter table public.sport_club_memberships enable row level security;
alter table public.sport_teams enable row level security;
alter table public.sport_team_access enable row level security;
alter table public.sport_team_memberships enable row level security;
alter table public.sport_competitions enable row level security;
alter table public.sport_competition_access enable row level security;
alter table public.sport_competition_stages enable row level security;
alter table public.sport_competition_entries enable row level security;
alter table public.sport_tournament_squads enable row level security;
alter table public.sport_squad_members enable row level security;
alter table public.sport_league_players enable row level security;
alter table public.sport_audit_events enable row level security;

create policy "sport_feature_flags_read"
on public.sport_feature_flags for select to anon, authenticated
using (true);

create policy "sport_clubs_read_authorized"
on public.sport_clubs for select to authenticated
using ((select app_private.can_read_sport_club(id)));
create policy "sport_club_access_read_authorized"
on public.sport_club_access for select to authenticated
using (account_id = (select auth.uid()) or (select app_private.can_manage_sport_club(club_id)));
create policy "sport_club_memberships_read_authorized"
on public.sport_club_memberships for select to authenticated
using (
  (select app_private.can_manage_sport_club(club_id))
  or exists (
    select 1 from public.sport_profiles profile
    where profile.id = sport_club_memberships.sport_profile_id
      and profile.account_id = (select auth.uid())
  )
);
create policy "sport_teams_read_authorized"
on public.sport_teams for select to authenticated
using ((select app_private.can_read_sport_team(id)));
create policy "sport_team_access_read_authorized"
on public.sport_team_access for select to authenticated
using (account_id = (select auth.uid()) or (select app_private.can_manage_sport_team(team_id)));
create policy "sport_team_memberships_read_authorized"
on public.sport_team_memberships for select to authenticated
using (
  (select app_private.can_manage_sport_team(team_id))
  or exists (
    select 1 from public.sport_profiles profile
    where profile.id = sport_team_memberships.sport_profile_id
      and profile.account_id = (select auth.uid())
  )
);
create policy "sport_competitions_read_authorized"
on public.sport_competitions for select to authenticated
using ((select app_private.can_read_sport_competition(id)));
create policy "sport_competition_access_read_authorized"
on public.sport_competition_access for select to authenticated
using (
  account_id = (select auth.uid())
  or (select app_private.can_manage_sport_competition(competition_id))
);
create policy "sport_competition_stages_read_authorized"
on public.sport_competition_stages for select to authenticated
using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_competition_entries_read_authorized"
on public.sport_competition_entries for select to authenticated
using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_tournament_squads_read_authorized"
on public.sport_tournament_squads for select to authenticated
using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_squad_members_read_authorized"
on public.sport_squad_members for select to authenticated
using (
  exists (
    select 1
    from public.sport_tournament_squads squad
    where squad.entry_id = sport_squad_members.squad_entry_id
      and (select app_private.can_read_sport_competition(squad.competition_id))
  )
);
create policy "sport_league_players_read_authorized"
on public.sport_league_players for select to authenticated
using ((select app_private.can_read_sport_competition(competition_id)));
create policy "sport_audit_events_read_authorized"
on public.sport_audit_events for select to authenticated
using (
  actor_account_id = (select auth.uid())
  or (resource_type = 'CLUB' and (select app_private.can_manage_sport_club(resource_id)))
  or (resource_type = 'TEAM' and (select app_private.can_manage_sport_team(resource_id)))
  or (
    resource_type in ('COMPETITION', 'ENTRY')
    and (select app_private.can_manage_sport_competition(
      case
        when resource_type = 'COMPETITION' then resource_id
        else (select entry.competition_id from public.sport_competition_entries entry where entry.id = resource_id)
      end
    ))
  )
);

revoke all on
  public.sport_feature_flags,
  public.sport_clubs,
  public.sport_club_access,
  public.sport_club_memberships,
  public.sport_teams,
  public.sport_team_access,
  public.sport_team_memberships,
  public.sport_competitions,
  public.sport_competition_access,
  public.sport_competition_stages,
  public.sport_competition_entries,
  public.sport_tournament_squads,
  public.sport_squad_members,
  public.sport_league_players,
  public.sport_audit_events
from anon, authenticated;

grant select on public.sport_feature_flags to anon, authenticated;
grant select on
  public.sport_clubs,
  public.sport_club_access,
  public.sport_club_memberships,
  public.sport_teams,
  public.sport_team_access,
  public.sport_team_memberships,
  public.sport_competitions,
  public.sport_competition_access,
  public.sport_competition_stages,
  public.sport_competition_entries,
  public.sport_tournament_squads,
  public.sport_squad_members,
  public.sport_league_players,
  public.sport_audit_events
to authenticated;

revoke all on function app_private.account_has_active_sport_profile(uuid, uuid) from public, anon;
revoke all on function app_private.can_manage_sport_club(uuid) from public, anon;
revoke all on function app_private.can_read_sport_club(uuid) from public, anon;
revoke all on function app_private.can_manage_sport_team(uuid) from public, anon;
revoke all on function app_private.can_read_sport_team(uuid) from public, anon;
revoke all on function app_private.can_manage_sport_competition(uuid) from public, anon;
revoke all on function app_private.can_read_sport_competition(uuid) from public, anon;
revoke all on function app_private.enforce_sport_foundation_identity() from public, anon, authenticated;
revoke all on function app_private.validate_sport_entry_detail() from public, anon, authenticated;
grant execute on function app_private.account_has_active_sport_profile(uuid, uuid) to authenticated;
grant execute on function app_private.can_manage_sport_club(uuid) to authenticated;
grant execute on function app_private.can_read_sport_club(uuid) to authenticated;
grant execute on function app_private.can_manage_sport_team(uuid) to authenticated;
grant execute on function app_private.can_read_sport_team(uuid) to authenticated;
grant execute on function app_private.can_manage_sport_competition(uuid) to authenticated;
grant execute on function app_private.can_read_sport_competition(uuid) to authenticated;

insert into public.sport_feature_flags(feature_key, sport_id, enabled, rollout_percentage)
select 'cloud_competitions', sport.id, false, 0
from public.sports sport
where sport.code in ('TENNIS', 'BADMINTON', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL');

insert into public.sport_feature_flags(feature_key, enabled, rollout_percentage)
values
  ('public_live', false, 0),
  ('offline_scoring', false, 0),
  ('follows_and_insights', false, 0);

comment on table public.sport_feature_flags is 'Server-controlled rollout flags for non-cricket sport platform features.';
comment on table public.sport_competition_entries is 'Common fixture-facing identity; deferred triggers enforce squad entries for tournaments and player entries for leagues.';
comment on table public.sport_audit_events is 'Append-only audit history written by trusted server commands.';
