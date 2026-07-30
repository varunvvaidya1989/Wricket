-- Versioned derived MVP results. Scorecard/event tables remain authoritative.
create table public.match_mvp_results (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  algorithm_version text not null,
  batting_points numeric(18, 6) not null,
  bowling_points numeric(18, 6) not null,
  fielding_points numeric(18, 6) not null,
  total_points numeric(18, 6) not null,
  rank integer,
  deterministic_order integer not null,
  is_player_of_match boolean not null default false,
  is_fighter_of_match boolean not null default false,
  batting_breakdown jsonb not null,
  bowling_breakdown jsonb not null,
  fielding_breakdown jsonb not null,
  explanations jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null,
  primary key (match_id, player_id, algorithm_version)
);

create index match_mvp_results_rank_idx
on public.match_mvp_results(match_id, algorithm_version, deterministic_order);
create index match_mvp_results_player_idx
on public.match_mvp_results(player_id, algorithm_version);

create table public.match_mvp_calculations (
  match_id uuid primary key references public.matches(id) on delete cascade,
  algorithm_version text not null,
  status text not null check (status in ('PENDING', 'CALCULATING', 'COMPLETED', 'FAILED')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  calculated_at timestamptz,
  error text,
  updated_at timestamptz not null default now()
);

alter table public.match_mvp_results enable row level security;
alter table public.match_mvp_calculations enable row level security;

create policy "match_mvp_read_allowed_match"
on public.match_mvp_results for select to authenticated
using (
  exists (
    select 1 from public.matches match
    where match.id = match_mvp_results.match_id
      and (
        match.visibility = 'PUBLIC'
        or exists (
          select 1 from public.tournament_members member
          where member.tournament_id = match.tournament_id
            and member.account_id = (select auth.uid())
            and member.status = 'ACTIVE'
        )
      )
  )
);

create policy "match_mvp_calculation_read_staff"
on public.match_mvp_calculations for select to authenticated
using (
  exists (
    select 1 from public.matches match
    join public.tournament_members member on member.tournament_id = match.tournament_id
    where match.id = match_mvp_calculations.match_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
      and member.role in ('OWNER', 'ADMIN', 'SCORER')
  )
);

-- Creates a retryable work request. Calculation workers replace the complete
-- versioned row set transactionally; they never append tournament totals.
create or replace function app_private.request_match_mvp_recalculation(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if not exists (
    select 1 from public.matches match
    join public.tournament_members member on member.tournament_id = match.tournament_id
    where match.id = p_match_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
      and member.role in ('OWNER', 'ADMIN')
  ) then raise exception 'Tournament administrator access is required'; end if;

  insert into public.match_mvp_calculations(
    match_id, algorithm_version, status, requested_by, requested_at, error, updated_at
  ) values (
    p_match_id, 'wricket-mvp-v1', 'PENDING', (select auth.uid()), now(), null, now()
  )
  on conflict (match_id) do update set
    algorithm_version = excluded.algorithm_version,
    status = 'PENDING',
    requested_by = excluded.requested_by,
    requested_at = excluded.requested_at,
    error = null,
    updated_at = now();
  return jsonb_build_object('matchId', p_match_id, 'status', 'PENDING');
end;
$$;

create or replace function public.request_match_mvp_recalculation(p_match_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.request_match_mvp_recalculation(p_match_id); $$;

revoke all on function app_private.request_match_mvp_recalculation(uuid) from public, anon, authenticated;
revoke all on function public.request_match_mvp_recalculation(uuid) from public, anon;
grant execute on function public.request_match_mvp_recalculation(uuid) to authenticated;

create or replace function app_private.enqueue_match_mvp_after_result_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'COMPLETED' and (
    old.status is distinct from new.status or old.result is distinct from new.result
  ) then
    insert into public.match_mvp_calculations(
      match_id, algorithm_version, status, requested_at, updated_at, error
    ) values (new.id, 'wricket-mvp-v1', 'PENDING', now(), now(), null)
    on conflict (match_id) do update set
      algorithm_version = excluded.algorithm_version,
      status = 'PENDING', requested_at = now(), updated_at = now(), error = null;
  elsif new.status = 'ABANDONED' then
    delete from public.match_mvp_results where match_id = new.id;
  end if;
  return new;
end;
$$;

create trigger enqueue_match_mvp_after_result_change
after update of status, result on public.matches
for each row execute function app_private.enqueue_match_mvp_after_result_change();

-- Rollback:
-- drop function public.request_match_mvp_recalculation(uuid);
-- drop function app_private.request_match_mvp_recalculation(uuid);
-- drop table public.match_mvp_calculations;
-- drop table public.match_mvp_results;
