create extension if not exists pg_trgm with schema extensions;

create table public.tournament_follows (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  account_id uuid not null references public.profiles(id) on delete cascade,
  status public.follow_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, account_id)
);

create index tournament_follows_account_status_idx
on public.tournament_follows(account_id, status, tournament_id);
create index matches_live_updated_idx
on public.matches(updated_at desc, id desc)
where status in ('IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION');
create index tournaments_name_trgm_idx
on public.tournaments using gin (lower(name) extensions.gin_trgm_ops);
create index tournaments_location_trgm_idx
on public.tournaments using gin (lower(coalesce(location, '')) extensions.gin_trgm_ops);

alter table public.tournament_follows enable row level security;

create policy "tournament_follows_read_own"
on public.tournament_follows for select to authenticated
using (account_id = (select auth.uid()));
create policy "tournament_follows_insert_own_public"
on public.tournament_follows for insert to authenticated
with check (
  account_id = (select auth.uid())
  and exists (
    select 1 from public.tournaments tournament
    where tournament.id = tournament_follows.tournament_id
      and tournament.visibility = 'PUBLIC'
  )
);
create policy "tournament_follows_update_own"
on public.tournament_follows for update to authenticated
using (account_id = (select auth.uid()))
with check (account_id = (select auth.uid()));
create policy "tournament_follows_delete_own"
on public.tournament_follows for delete to authenticated
using (account_id = (select auth.uid()));

create or replace function app_private.follow_tournament(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if not exists (
    select 1 from public.tournaments
    where id = p_tournament_id and visibility = 'PUBLIC'
  ) then raise exception 'Public tournament not found'; end if;
  insert into public.tournament_follows(tournament_id, account_id, status)
  values (p_tournament_id, (select auth.uid()), 'ACTIVE')
  on conflict (tournament_id, account_id) do update
  set status = 'ACTIVE', updated_at = now();
end;
$$;

create or replace function app_private.unfollow_tournament(p_tournament_id uuid)
returns void language sql security definer set search_path = public
as $$
  delete from public.tournament_follows
  where tournament_id = p_tournament_id and account_id = (select auth.uid())
$$;

create or replace function app_private.search_tournaments(
  p_query text,
  p_cursor_name text default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
) returns table (
  tournament_id uuid,
  tournament_name text,
  format text,
  start_at timestamptz,
  location text,
  logo_url text,
  organizer_name text,
  team_count bigint,
  is_following boolean,
  membership_reason text
)
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if length(trim(p_query)) < 2 then return; end if;
  return query
  select tournament.id, tournament.name, tournament.format, tournament.start_at,
    tournament.location, tournament.logo_url, organizer.display_name,
    (select count(*) from public.teams team where team.tournament_id = tournament.id),
    exists (
      select 1 from public.tournament_follows follow
      where follow.tournament_id = tournament.id
        and follow.account_id = (select auth.uid()) and follow.status = 'ACTIVE'
    ),
    case
      when tournament.created_by = (select auth.uid()) then 'OWNER'
      when exists (
        select 1 from public.tournament_members member
        where member.tournament_id = tournament.id
          and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
      ) then 'TOURNAMENT_MEMBER'
      when exists (
        select 1 from public.teams team join public.team_account_members member on member.team_id = team.id
        where team.tournament_id = tournament.id
          and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
      ) then 'MY_TEAM'
      else null
    end
  from public.tournaments tournament
  join public.profiles organizer on organizer.id = tournament.created_by
  where (
    tournament.visibility = 'PUBLIC'
    or tournament.created_by = (select auth.uid())
    or exists (
      select 1 from public.tournament_members member
      where member.tournament_id = tournament.id
        and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
    )
  )
    and (tournament.name ilike '%' || trim(p_query) || '%'
      or coalesce(tournament.location, '') ilike '%' || trim(p_query) || '%')
    and (p_cursor_name is null or (lower(tournament.name), tournament.id) > (lower(p_cursor_name), p_cursor_id))
  order by lower(tournament.name), tournament.id
  limit least(greatest(p_limit, 1), 30);
end;
$$;

create or replace function app_private.list_eligible_live_matches(
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 8
) returns table (match_id uuid, eligibility_reason text, match_updated_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  return query
  select match.id,
    case
      when tournament.created_by = (select auth.uid()) then 'OWNER'
      when exists (
        select 1 from public.teams team
        join public.team_account_members member on member.team_id = team.id
        where team.tournament_id = tournament.id
          and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
      ) then 'MY_TEAM'
      when exists (
        select 1 from public.tournament_members member
        where member.tournament_id = tournament.id
          and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
      ) then 'TOURNAMENT_MEMBER'
      else 'FOLLOWING'
    end,
    match.updated_at
  from public.matches match
  join public.tournaments tournament on tournament.id = match.tournament_id
  where match.status in ('IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION')
    and (
      tournament.created_by = (select auth.uid())
      or exists (
        select 1 from public.tournament_members member
        where member.tournament_id = tournament.id
          and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
      )
      or exists (
        select 1 from public.teams team
        join public.team_account_members member on member.team_id = team.id
        where team.tournament_id = tournament.id
          and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
      )
      or exists (
        select 1 from public.tournament_follows follow
        where follow.tournament_id = tournament.id
          and follow.account_id = (select auth.uid()) and follow.status = 'ACTIVE'
      )
    )
    and (p_cursor_updated_at is null or (match.updated_at, match.id) < (p_cursor_updated_at, p_cursor_id))
  order by match.updated_at desc, match.id desc
  limit least(greatest(p_limit, 1), 20);
end;
$$;

create or replace function app_private.list_recent_live_events(p_match_ids uuid[])
returns table (id uuid, match_id uuid, sequence bigint, kind public.match_event_kind, payload jsonb, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select event.id, event.match_id, event.sequence, event.kind, event.payload, event.created_at
  from unnest(p_match_ids) requested(match_id)
  cross join lateral (
    select item.id, item.match_id, item.sequence, item.kind, item.payload, item.created_at
    from public.match_events item
    where item.match_id = requested.match_id
    order by item.sequence desc
    limit 12
  ) event
  order by event.match_id, event.sequence
$$;

create or replace function public.follow_tournament(p_tournament_id uuid)
returns void language sql security invoker set search_path = public
as $$ select app_private.follow_tournament(p_tournament_id) $$;
create or replace function public.unfollow_tournament(p_tournament_id uuid)
returns void language sql security invoker set search_path = public
as $$ select app_private.unfollow_tournament(p_tournament_id) $$;
create or replace function public.search_tournaments(p_query text, p_cursor_name text default null, p_cursor_id uuid default null, p_limit integer default 20)
returns table (tournament_id uuid, tournament_name text, format text, start_at timestamptz, location text, logo_url text, organizer_name text, team_count bigint, is_following boolean, membership_reason text)
language sql security invoker set search_path = public
as $$ select * from app_private.search_tournaments(p_query, p_cursor_name, p_cursor_id, p_limit) $$;
create or replace function public.list_eligible_live_matches(p_cursor_updated_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 8)
returns table (match_id uuid, eligibility_reason text, match_updated_at timestamptz)
language sql security invoker set search_path = public
as $$ select * from app_private.list_eligible_live_matches(p_cursor_updated_at, p_cursor_id, p_limit) $$;
create or replace function public.list_recent_live_events(p_match_ids uuid[])
returns table (id uuid, match_id uuid, sequence bigint, kind public.match_event_kind, payload jsonb, created_at timestamptz)
language sql security invoker set search_path = public
as $$ select * from app_private.list_recent_live_events(p_match_ids) $$;

revoke all on public.tournament_follows from anon;
grant select, insert, update, delete on public.tournament_follows to authenticated;
revoke all on function app_private.follow_tournament(uuid), app_private.unfollow_tournament(uuid), app_private.search_tournaments(text,text,uuid,integer), app_private.list_eligible_live_matches(timestamptz,uuid,integer), app_private.list_recent_live_events(uuid[]) from public, anon;
revoke all on function public.follow_tournament(uuid), public.unfollow_tournament(uuid), public.search_tournaments(text,text,uuid,integer), public.list_eligible_live_matches(timestamptz,uuid,integer), public.list_recent_live_events(uuid[]) from public, anon;
grant execute on function app_private.follow_tournament(uuid), app_private.unfollow_tournament(uuid), app_private.search_tournaments(text,text,uuid,integer), app_private.list_eligible_live_matches(timestamptz,uuid,integer), app_private.list_recent_live_events(uuid[]) to authenticated;
grant execute on function public.follow_tournament(uuid), public.unfollow_tournament(uuid), public.search_tournaments(text,text,uuid,integer), public.list_eligible_live_matches(timestamptz,uuid,integer), public.list_recent_live_events(uuid[]) to authenticated;
