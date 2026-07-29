create table public.fixture_stages (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage_order integer not null check (stage_order > 0),
  type text not null check (type in ('GROUP', 'KNOCKOUT')),
  status text not null default 'PENDING' check (status in ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  config jsonb not null default '{}'::jsonb,
  depends_on_stage_id uuid references public.fixture_stages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tournament_id, stage_order)
);

create table public.fixture_groups (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.fixture_stages(id) on delete cascade,
  name text not null,
  team_ids uuid[] not null default '{}',
  unique (stage_id, name)
);

create table public.fixture_matches (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.fixture_stages(id) on delete cascade,
  group_id uuid references public.fixture_groups(id) on delete set null,
  round_id text,
  team_a_id uuid not null references public.teams(id) on delete restrict,
  team_b_id uuid references public.teams(id) on delete restrict,
  round integer not null check (round > 0),
  leg integer not null default 1 check (leg > 0),
  weight numeric,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED', 'LIVE', 'COMPLETED', 'WALKOVER')),
  score_a integer,
  score_b integer,
  updated_at timestamptz not null default now(),
  check (team_b_id is null or team_a_id <> team_b_id)
);

create table public.knockout_brackets (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null unique references public.fixture_stages(id) on delete cascade,
  rounds jsonb not null,
  seeding_source text not null,
  bracket_size integer not null,
  byes integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.custom_formats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  is_reusable_template boolean not null default false,
  stages jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fixture_tie_resolutions (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.fixture_stages(id) on delete cascade,
  group_id uuid not null references public.fixture_groups(id) on delete cascade,
  ordered_team_ids uuid[] not null,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  unique (stage_id, group_id)
);

create index fixture_stages_tournament_idx on public.fixture_stages(tournament_id, stage_order);
create index fixture_matches_stage_idx on public.fixture_matches(stage_id, round);
create index fixture_matches_group_idx on public.fixture_matches(group_id);

alter table public.fixture_stages enable row level security;
alter table public.fixture_groups enable row level security;
alter table public.fixture_matches enable row level security;
alter table public.knockout_brackets enable row level security;
alter table public.custom_formats enable row level security;
alter table public.fixture_tie_resolutions enable row level security;

create policy "fixture_stages_member_read" on public.fixture_stages for select to authenticated
using (exists (
  select 1 from public.tournament_members tm
  where tm.tournament_id = fixture_stages.tournament_id and tm.account_id = (select auth.uid()) and tm.status = 'ACTIVE'
));
create policy "fixture_stages_owner_write" on public.fixture_stages for all to authenticated
using (exists (
  select 1 from public.tournaments t where t.id = fixture_stages.tournament_id and t.created_by = (select auth.uid())
))
with check (exists (
  select 1 from public.tournaments t where t.id = fixture_stages.tournament_id and t.created_by = (select auth.uid())
));

create policy "fixture_groups_member_read" on public.fixture_groups for select to authenticated
using (exists (
  select 1 from public.fixture_stages s join public.tournament_members tm on tm.tournament_id = s.tournament_id
  where s.id = fixture_groups.stage_id and tm.account_id = (select auth.uid()) and tm.status = 'ACTIVE'
));
create policy "fixture_groups_owner_write" on public.fixture_groups for all to authenticated
using (exists (
  select 1 from public.fixture_stages s join public.tournaments t on t.id = s.tournament_id
  where s.id = fixture_groups.stage_id and t.created_by = (select auth.uid())
))
with check (exists (
  select 1 from public.fixture_stages s join public.tournaments t on t.id = s.tournament_id
  where s.id = fixture_groups.stage_id and t.created_by = (select auth.uid())
));

create policy "fixture_matches_member_read" on public.fixture_matches for select to authenticated
using (exists (
  select 1 from public.fixture_stages s join public.tournament_members tm on tm.tournament_id = s.tournament_id
  where s.id = fixture_matches.stage_id and tm.account_id = (select auth.uid()) and tm.status = 'ACTIVE'
));
create policy "fixture_matches_owner_write" on public.fixture_matches for all to authenticated
using (exists (
  select 1 from public.fixture_stages s join public.tournaments t on t.id = s.tournament_id
  where s.id = fixture_matches.stage_id and t.created_by = (select auth.uid())
))
with check (exists (
  select 1 from public.fixture_stages s join public.tournaments t on t.id = s.tournament_id
  where s.id = fixture_matches.stage_id and t.created_by = (select auth.uid())
));

create policy "brackets_member_read" on public.knockout_brackets for select to authenticated
using (exists (
  select 1 from public.fixture_stages s join public.tournament_members tm on tm.tournament_id = s.tournament_id
  where s.id = knockout_brackets.stage_id and tm.account_id = (select auth.uid()) and tm.status = 'ACTIVE'
));
create policy "brackets_owner_write" on public.knockout_brackets for all to authenticated
using (exists (
  select 1 from public.fixture_stages s join public.tournaments t on t.id = s.tournament_id
  where s.id = knockout_brackets.stage_id and t.created_by = (select auth.uid())
))
with check (exists (
  select 1 from public.fixture_stages s join public.tournaments t on t.id = s.tournament_id
  where s.id = knockout_brackets.stage_id and t.created_by = (select auth.uid())
));

create policy "custom_formats_read" on public.custom_formats for select to authenticated
using (owner_id = (select auth.uid()) or is_reusable_template);
create policy "custom_formats_owner_write" on public.custom_formats for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "tie_resolutions_member_read" on public.fixture_tie_resolutions for select to authenticated
using (exists (
  select 1 from public.fixture_stages s join public.tournament_members tm on tm.tournament_id = s.tournament_id
  where s.id = fixture_tie_resolutions.stage_id and tm.account_id = (select auth.uid()) and tm.status = 'ACTIVE'
));
create policy "tie_resolutions_owner_write" on public.fixture_tie_resolutions for all to authenticated
using (exists (
  select 1 from public.fixture_stages s join public.tournaments t on t.id = s.tournament_id
  where s.id = fixture_tie_resolutions.stage_id and t.created_by = (select auth.uid())
))
with check (exists (
  select 1 from public.fixture_stages s join public.tournaments t on t.id = s.tournament_id
  where s.id = fixture_tie_resolutions.stage_id and t.created_by = (select auth.uid())
));

alter publication supabase_realtime add table public.fixture_matches;
alter publication supabase_realtime add table public.fixture_stages;
alter publication supabase_realtime add table public.knockout_brackets;
