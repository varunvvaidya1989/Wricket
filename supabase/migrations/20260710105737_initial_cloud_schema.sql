create schema if not exists app_private;

create type public.tournament_visibility as enum ('PUBLIC', 'PRIVATE');
create type public.tournament_member_role as enum ('OWNER', 'ADMIN', 'SCORER');
create type public.member_status as enum ('INVITED', 'ACTIVE', 'SUSPENDED');
create type public.match_visibility as enum ('PUBLIC', 'PRIVATE');
create type public.match_status as enum (
  'SETUP',
  'SCHEDULED',
  'IN_PROGRESS',
  'INNINGS_BREAK',
  'FOLLOW_ON_DECISION',
  'COMPLETED',
  'ABANDONED'
);
create type public.match_event_kind as enum (
  'MATCH_CREATED',
  'XI_SET',
  'INNINGS_STARTED',
  'BALL_RECORDED',
  'BALL_CORRECTED',
  'INNINGS_CLOSED',
  'MATCH_COMPLETED',
  'MATCH_ABANDONED'
);
create type public.follow_status as enum ('ACTIVE', 'MUTED');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  display_name text not null,
  batting_hand text,
  bowling_style text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text not null,
  visibility public.tournament_visibility not null default 'PRIVATE',
  start_date date not null,
  end_date date,
  points_win integer not null default 2,
  points_tie integer not null default 1,
  points_loss integer not null default 0,
  points_no_result integer not null default 1,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_members (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  account_id uuid not null references public.profiles (id) on delete cascade,
  role public.tournament_member_role not null,
  status public.member_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  unique (tournament_id, account_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments (id) on delete cascade,
  name text not null,
  short_name text not null,
  color_hex text not null,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_players (
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  jersey_no integer,
  is_captain boolean not null default false,
  is_keeper boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments (id) on delete cascade,
  team_a_id uuid not null references public.teams (id) on delete restrict,
  team_b_id uuid not null references public.teams (id) on delete restrict,
  format text not null,
  status public.match_status not null default 'SETUP',
  visibility public.match_visibility not null default 'PRIVATE',
  venue text,
  field_name text,
  scheduled_at timestamptz,
  duration_minutes integer,
  officials jsonb not null default '[]'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  current_sequence bigint not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (team_a_id <> team_b_id)
);

create table public.match_follows (
  match_id uuid not null references public.matches (id) on delete cascade,
  account_id uuid not null references public.profiles (id) on delete cascade,
  status public.follow_status not null default 'ACTIVE',
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (match_id, account_id)
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  client_event_id text not null,
  sequence bigint not null,
  kind public.match_event_kind not null,
  payload jsonb not null,
  scorer_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (match_id, client_event_id),
  unique (match_id, sequence)
);

create table public.match_snapshots (
  match_id uuid primary key references public.matches (id) on delete cascade,
  latest_sequence bigint not null default 0,
  scoreboard jsonb not null default '{}'::jsonb,
  scorecard jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.scoring_leases (
  match_id uuid primary key references public.matches (id) on delete cascade,
  account_id uuid not null references public.profiles (id) on delete cascade,
  lease_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index tournament_members_account_idx on public.tournament_members (account_id);
create index teams_tournament_idx on public.teams (tournament_id);
create index matches_tournament_idx on public.matches (tournament_id);
create index match_events_match_sequence_idx on public.match_events (match_id, sequence);
create index match_follows_account_idx on public.match_follows (account_id);
create index scoring_leases_account_idx on public.scoring_leases (account_id);

create or replace function app_private.add_tournament_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tournament_members (tournament_id, account_id, role, status)
  values (new.id, new.created_by, 'OWNER', 'ACTIVE')
  on conflict (tournament_id, account_id) do nothing;
  return new;
end;
$$;

create trigger add_tournament_owner_after_insert
after insert on public.tournaments
for each row execute function app_private.add_tournament_owner();

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_members enable row level security;
alter table public.teams enable row level security;
alter table public.team_players enable row level security;
alter table public.matches enable row level security;
alter table public.match_follows enable row level security;
alter table public.match_events enable row level security;
alter table public.match_snapshots enable row level security;
alter table public.scoring_leases enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "players_read_authenticated"
on public.players for select
to authenticated
using (true);

create policy "players_insert_authenticated"
on public.players for insert
to authenticated
with check (created_by = auth.uid() or profile_id = auth.uid());

create policy "players_update_linked_profile"
on public.players for update
to authenticated
using (profile_id = auth.uid() or created_by = auth.uid())
with check (profile_id = auth.uid() or created_by = auth.uid());

create policy "tournaments_read_public_or_member"
on public.tournaments for select
using (
  visibility = 'PUBLIC'
  or exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = tournaments.id
      and tm.account_id = auth.uid()
      and tm.status = 'ACTIVE'
  )
);

create policy "tournaments_insert_own"
on public.tournaments for insert
to authenticated
with check (created_by = auth.uid());

create policy "tournaments_update_owner_admin"
on public.tournaments for update
to authenticated
using (
  exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = tournaments.id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN')
      and tm.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = tournaments.id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN')
      and tm.status = 'ACTIVE'
  )
);

create policy "tournament_members_select_own"
on public.tournament_members for select
to authenticated
using (account_id = auth.uid());

create policy "teams_read_public_or_member"
on public.teams for select
using (
  tournament_id is null
  or exists (
    select 1 from public.tournaments t
    where t.id = teams.tournament_id
      and (
        t.visibility = 'PUBLIC'
        or exists (
          select 1 from public.tournament_members tm
          where tm.tournament_id = t.id
            and tm.account_id = auth.uid()
            and tm.status = 'ACTIVE'
        )
      )
  )
);

create policy "teams_write_owner_admin"
on public.teams for all
to authenticated
using (
  exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = teams.tournament_id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN')
      and tm.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = teams.tournament_id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN')
      and tm.status = 'ACTIVE'
  )
);

create policy "team_players_read_public_or_member"
on public.team_players for select
using (
  exists (
    select 1 from public.teams t
    join public.tournaments tr on tr.id = t.tournament_id
    where t.id = team_players.team_id
      and (
        tr.visibility = 'PUBLIC'
        or exists (
          select 1 from public.tournament_members tm
          where tm.tournament_id = tr.id
            and tm.account_id = auth.uid()
            and tm.status = 'ACTIVE'
        )
      )
  )
);

create policy "team_players_write_owner_admin"
on public.team_players for all
to authenticated
using (
  exists (
    select 1 from public.teams t
    join public.tournament_members tm on tm.tournament_id = t.tournament_id
    where t.id = team_players.team_id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN')
      and tm.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1 from public.teams t
    join public.tournament_members tm on tm.tournament_id = t.tournament_id
    where t.id = team_players.team_id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN')
      and tm.status = 'ACTIVE'
  )
);

create policy "matches_read_public_member_or_follower"
on public.matches for select
using (
  visibility = 'PUBLIC'
  or exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = matches.tournament_id
      and tm.account_id = auth.uid()
      and tm.status = 'ACTIVE'
  )
  or exists (
    select 1 from public.match_follows mf
    where mf.match_id = matches.id
      and mf.account_id = auth.uid()
  )
);

create policy "matches_write_tournament_staff"
on public.matches for all
to authenticated
using (
  exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = matches.tournament_id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN', 'SCORER')
      and tm.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id = matches.tournament_id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN', 'SCORER')
      and tm.status = 'ACTIVE'
  )
);

create policy "match_follows_select_own"
on public.match_follows for select
to authenticated
using (account_id = auth.uid());

create policy "match_follows_insert_own"
on public.match_follows for insert
to authenticated
with check (account_id = auth.uid());

create policy "match_follows_update_own"
on public.match_follows for update
to authenticated
using (account_id = auth.uid())
with check (account_id = auth.uid());

create policy "match_events_read_allowed_match"
on public.match_events for select
using (
  exists (
    select 1 from public.matches m
    where m.id = match_events.match_id
      and (
        m.visibility = 'PUBLIC'
        or exists (
          select 1 from public.tournament_members tm
          where tm.tournament_id = m.tournament_id
            and tm.account_id = auth.uid()
            and tm.status = 'ACTIVE'
        )
        or exists (
          select 1 from public.match_follows mf
          where mf.match_id = m.id
            and mf.account_id = auth.uid()
        )
      )
  )
);

create policy "match_events_insert_authorized_scorer"
on public.match_events for insert
to authenticated
with check (
  scorer_id = auth.uid()
  and exists (
    select 1 from public.matches m
    join public.tournament_members tm on tm.tournament_id = m.tournament_id
    where m.id = match_events.match_id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN', 'SCORER')
      and tm.status = 'ACTIVE'
  )
);

create policy "match_snapshots_read_allowed_match"
on public.match_snapshots for select
using (
  exists (
    select 1 from public.matches m
    where m.id = match_snapshots.match_id
      and (
        m.visibility = 'PUBLIC'
        or exists (
          select 1 from public.tournament_members tm
          where tm.tournament_id = m.tournament_id
            and tm.account_id = auth.uid()
            and tm.status = 'ACTIVE'
        )
        or exists (
          select 1 from public.match_follows mf
          where mf.match_id = m.id
            and mf.account_id = auth.uid()
        )
      )
  )
);

create policy "scoring_leases_read_tournament_staff"
on public.scoring_leases for select
to authenticated
using (
  exists (
    select 1 from public.matches m
    join public.tournament_members tm on tm.tournament_id = m.tournament_id
    where m.id = scoring_leases.match_id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN', 'SCORER')
      and tm.status = 'ACTIVE'
  )
);

create policy "scoring_leases_write_tournament_staff"
on public.scoring_leases for all
to authenticated
using (
  exists (
    select 1 from public.matches m
    join public.tournament_members tm on tm.tournament_id = m.tournament_id
    where m.id = scoring_leases.match_id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN', 'SCORER')
      and tm.status = 'ACTIVE'
  )
)
with check (
  account_id = auth.uid()
  and exists (
    select 1 from public.matches m
    join public.tournament_members tm on tm.tournament_id = m.tournament_id
    where m.id = scoring_leases.match_id
      and tm.account_id = auth.uid()
      and tm.role in ('OWNER', 'ADMIN', 'SCORER')
      and tm.status = 'ACTIVE'
  )
);

create policy "audit_logs_read_actor"
on public.audit_logs for select
to authenticated
using (actor_id = auth.uid());
