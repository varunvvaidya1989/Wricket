create table public.scorers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  availability_status text not null default 'AVAILABLE'
    check (availability_status in ('AVAILABLE', 'UNAVAILABLE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_scorers (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  scorer_id uuid not null references public.scorers(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REMOVED')),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, scorer_id)
);

create index tournament_scorers_tournament_status_idx
on public.tournament_scorers(tournament_id, status);
create index tournament_scorers_scorer_status_idx
on public.tournament_scorers(scorer_id, status);

alter table public.scorers enable row level security;
alter table public.tournament_scorers enable row level security;

create policy "scorers_read_own_profile"
on public.scorers for select to authenticated
using (profile_id = (select auth.uid()));

create policy "tournament_scorers_read_members"
on public.tournament_scorers for select to authenticated
using (exists (
  select 1 from public.tournament_members member
  where member.tournament_id = tournament_scorers.tournament_id
    and member.account_id = (select auth.uid())
    and member.status = 'ACTIVE'
));

create or replace function app_private.is_tournament_owner(
  p_tournament_id uuid
) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tournaments tournament
    where tournament.id = p_tournament_id
      and tournament.created_by = (select auth.uid())
  )
$$;

create or replace function app_private.search_available_scorers(
  p_tournament_id uuid,
  p_query text,
  p_limit integer default 20
) returns table (
  scorer_id uuid,
  account_id uuid,
  display_name text,
  avatar_url text,
  availability_status text,
  is_assigned boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (select app_private.is_tournament_owner(p_tournament_id)) then
    raise exception 'Only the tournament owner can search scorers';
  end if;
  if length(trim(p_query)) < 2 then return; end if;

  return query
  select scorer.id, profile.id, profile.display_name, profile.avatar_url,
    coalesce(scorer.availability_status, 'AVAILABLE'),
    coalesce(assignment.status = 'ACTIVE', false)
  from public.profiles profile
  left join public.scorers scorer on scorer.profile_id = profile.id
  left join public.tournament_scorers assignment
    on assignment.scorer_id = scorer.id
    and assignment.tournament_id = p_tournament_id
  where profile.display_name ilike '%' || trim(p_query) || '%'
    and profile.id <> (select auth.uid())
  order by
    case when lower(profile.display_name) = lower(trim(p_query)) then 0 else 1 end,
    profile.display_name
  limit least(greatest(p_limit, 1), 30);
end;
$$;

create or replace function app_private.list_tournament_scorers(
  p_tournament_id uuid
) returns table (
  assignment_id uuid,
  scorer_id uuid,
  account_id uuid,
  display_name text,
  avatar_url text,
  availability_status text,
  assigned_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tournament_members member
    where member.tournament_id = p_tournament_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
  ) then raise exception 'Tournament membership is required'; end if;

  return query
  select assignment.id, scorer.id, profile.id, profile.display_name,
    profile.avatar_url, scorer.availability_status, assignment.assigned_at
  from public.tournament_scorers assignment
  join public.scorers scorer on scorer.id = assignment.scorer_id
  join public.profiles profile on profile.id = scorer.profile_id
  where assignment.tournament_id = p_tournament_id and assignment.status = 'ACTIVE'
  order by profile.display_name;
end;
$$;

create or replace function app_private.assign_tournament_scorer(
  p_tournament_id uuid,
  p_account_id uuid
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare selected_scorer public.scorers%rowtype;
declare selected_assignment_id uuid;
begin
  if not (select app_private.is_tournament_owner(p_tournament_id)) then
    raise exception 'Only the tournament owner can assign scorers';
  end if;
  if not exists (select 1 from public.profiles where id = p_account_id) then
    raise exception 'Wricket member not found';
  end if;

  insert into public.scorers(profile_id) values (p_account_id)
  on conflict (profile_id) do update set updated_at = now()
  returning * into selected_scorer;
  if selected_scorer.availability_status <> 'AVAILABLE' then
    raise exception 'This scorer is currently unavailable';
  end if;

  insert into public.tournament_scorers(tournament_id, scorer_id, assigned_by, status)
  values (p_tournament_id, selected_scorer.id, (select auth.uid()), 'ACTIVE')
  on conflict (tournament_id, scorer_id) do update
  set status = 'ACTIVE', assigned_by = excluded.assigned_by, updated_at = now()
  returning id into selected_assignment_id;

  insert into public.tournament_members(tournament_id, account_id, role, status)
  values (p_tournament_id, p_account_id, 'SCORER', 'ACTIVE')
  on conflict (tournament_id, account_id) do update set status = 'ACTIVE';
  return selected_assignment_id;
end;
$$;

create or replace function app_private.remove_tournament_scorer(
  p_tournament_id uuid,
  p_scorer_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
declare selected_account_id uuid;
begin
  if not (select app_private.is_tournament_owner(p_tournament_id)) then
    raise exception 'Only the tournament owner can remove scorers';
  end if;
  select profile_id into selected_account_id from public.scorers where id = p_scorer_id;
  update public.tournament_scorers set status = 'REMOVED', updated_at = now()
  where tournament_id = p_tournament_id and scorer_id = p_scorer_id;
  delete from public.tournament_members
  where tournament_id = p_tournament_id and account_id = selected_account_id and role = 'SCORER';
end;
$$;

create or replace function public.search_available_scorers(
  p_tournament_id uuid, p_query text, p_limit integer default 20
) returns table (
  scorer_id uuid, account_id uuid, display_name text, avatar_url text,
  availability_status text, is_assigned boolean
) language sql security invoker set search_path = public
as $$ select * from app_private.search_available_scorers(p_tournament_id, p_query, p_limit) $$;

create or replace function public.list_tournament_scorers(p_tournament_id uuid)
returns table (
  assignment_id uuid, scorer_id uuid, account_id uuid, display_name text,
  avatar_url text, availability_status text, assigned_at timestamptz
) language sql security invoker set search_path = public
as $$ select * from app_private.list_tournament_scorers(p_tournament_id) $$;

create or replace function public.assign_tournament_scorer(p_tournament_id uuid, p_account_id uuid)
returns uuid language sql security invoker set search_path = public
as $$ select app_private.assign_tournament_scorer(p_tournament_id, p_account_id) $$;

create or replace function public.remove_tournament_scorer(p_tournament_id uuid, p_scorer_id uuid)
returns void language sql security invoker set search_path = public
as $$ select app_private.remove_tournament_scorer(p_tournament_id, p_scorer_id) $$;

revoke all on public.scorers, public.tournament_scorers from anon;
grant select on public.scorers, public.tournament_scorers to authenticated;
revoke all on function app_private.search_available_scorers(uuid, text, integer) from public, anon;
revoke all on function app_private.list_tournament_scorers(uuid) from public, anon;
revoke all on function app_private.assign_tournament_scorer(uuid, uuid) from public, anon;
revoke all on function app_private.remove_tournament_scorer(uuid, uuid) from public, anon;
revoke all on function public.search_available_scorers(uuid, text, integer) from public, anon;
revoke all on function public.list_tournament_scorers(uuid) from public, anon;
revoke all on function public.assign_tournament_scorer(uuid, uuid) from public, anon;
revoke all on function public.remove_tournament_scorer(uuid, uuid) from public, anon;
grant execute on function app_private.search_available_scorers(uuid, text, integer) to authenticated;
grant execute on function app_private.list_tournament_scorers(uuid) to authenticated;
grant execute on function app_private.assign_tournament_scorer(uuid, uuid) to authenticated;
grant execute on function app_private.remove_tournament_scorer(uuid, uuid) to authenticated;
grant execute on function public.search_available_scorers(uuid, text, integer) to authenticated;
grant execute on function public.list_tournament_scorers(uuid) to authenticated;
grant execute on function public.assign_tournament_scorer(uuid, uuid) to authenticated;
grant execute on function public.remove_tournament_scorer(uuid, uuid) to authenticated;
