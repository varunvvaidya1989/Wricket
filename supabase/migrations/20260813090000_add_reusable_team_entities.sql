-- Teams may now exist independently of a tournament and be entered, with their
-- roster, into multiple tournaments. Tournament participation rows remain
-- ordinary teams so existing fixtures, matches, scoring, and stats keep stable
-- team IDs.
alter table public.teams
add column if not exists entity_owner_id uuid references public.profiles(id) on delete set null,
add column if not exists source_team_id uuid references public.teams(id) on delete set null;

-- Preserve the ownership tournament organisers already had over their teams so
-- those teams immediately appear in My teams and can be reused elsewhere.
update public.teams team
set entity_owner_id = tournament.created_by
from public.tournaments tournament
where team.tournament_id = tournament.id
  and team.entity_owner_id is null;

create index if not exists teams_entity_owner_idx
on public.teams(entity_owner_id)
where entity_owner_id is not null;

create index if not exists teams_source_team_idx
on public.teams(source_team_id)
where source_team_id is not null;

create unique index if not exists teams_one_source_per_tournament_idx
on public.teams(tournament_id, source_team_id)
where tournament_id is not null and source_team_id is not null;

drop policy if exists "teams_insert_entity_owner" on public.teams;
create policy "teams_insert_entity_owner"
on public.teams for insert
to authenticated
with check (
  tournament_id is null
  and source_team_id is null
  and entity_owner_id = (select auth.uid())
);

drop policy if exists "teams_update_entity_owner" on public.teams;
create policy "teams_update_entity_owner"
on public.teams for update
to authenticated
using (entity_owner_id = (select auth.uid()))
with check (entity_owner_id = (select auth.uid()));

create or replace function app_private.is_tournament_owner_for_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams team
    left join public.tournament_members member
      on member.tournament_id = team.tournament_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
      and member.role in ('OWNER', 'ADMIN')
    where team.id = p_team_id
      and (
        team.entity_owner_id = (select auth.uid())
        or member.id is not null
      )
  )
$$;

create or replace function app_private.can_manage_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams team
    left join public.tournament_members tournament_member
      on tournament_member.tournament_id = team.tournament_id
      and tournament_member.account_id = (select auth.uid())
      and tournament_member.status = 'ACTIVE'
      and tournament_member.role in ('OWNER', 'ADMIN')
    left join public.team_account_members team_member
      on team_member.team_id = team.id
      and team_member.account_id = (select auth.uid())
      and team_member.status = 'ACTIVE'
      and team_member.role = 'CAPTAIN'
    where team.id = p_team_id
      and (
        team.entity_owner_id = (select auth.uid())
        or tournament_member.id is not null
        or team_member.account_id is not null
      )
  );
$$;

create or replace function public.enter_team_in_tournament(
  p_source_team_id uuid,
  p_tournament_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_team public.teams%rowtype;
  participation_id uuid;
  canonical_source_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if not exists (
    select 1 from public.tournaments tournament
    where tournament.id = p_tournament_id
      and tournament.created_by = (select auth.uid())
  ) then
    raise exception 'Only the tournament owner can add participating teams';
  end if;

  select * into source_team from public.teams where id = p_source_team_id;
  if not found then raise exception 'Team not found'; end if;
  if not (
    source_team.entity_owner_id = (select auth.uid())
    or exists (
      select 1 from public.team_account_members member
      where member.team_id = source_team.id
        and member.account_id = (select auth.uid())
        and member.status = 'ACTIVE'
    )
  ) then
    raise exception 'You can only enter a team you own or belong to';
  end if;

  canonical_source_id := coalesce(source_team.source_team_id, source_team.id);
  if exists (
    select 1 from public.teams team
    where team.tournament_id = p_tournament_id
      and (team.id = canonical_source_id or team.source_team_id = canonical_source_id)
  ) then
    raise exception 'This team is already participating in the tournament';
  end if;

  insert into public.teams(
    tournament_id, name, short_name, color_hex, logo_url,
    entity_owner_id, source_team_id
  ) values (
    p_tournament_id, source_team.name, source_team.short_name,
    source_team.color_hex, source_team.logo_url,
    source_team.entity_owner_id, canonical_source_id
  ) returning id into participation_id;

  insert into public.team_players(
    team_id, player_id, jersey_no, is_captain, is_keeper, created_at
  )
  select participation_id, player_id, jersey_no, is_captain, is_keeper, now()
  from public.team_players
  where team_id = source_team.id
  on conflict (team_id, player_id) do nothing;

  insert into public.team_account_members(
    team_id, account_id, player_id, role, status, joined_at, updated_at
  )
  select participation_id, account_id, player_id, role, status, now(), now()
  from public.team_account_members
  where team_id = source_team.id and status = 'ACTIVE'
  on conflict (team_id, account_id) do nothing;

  return participation_id;
end;
$$;

revoke all on function public.enter_team_in_tournament(uuid, uuid) from public, anon;
grant execute on function public.enter_team_in_tournament(uuid, uuid) to authenticated;

create or replace function app_private.update_team_logo(p_team_id uuid, p_logo_url text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if nullif(trim(p_logo_url), '') is null then raise exception 'Team logo URL is required'; end if;
  if not exists (
    select 1
    from public.teams team
    left join public.tournaments tournament on tournament.id = team.tournament_id
    where team.id = p_team_id
      and (
        team.entity_owner_id = (select auth.uid())
        or tournament.created_by = (select auth.uid())
        or exists (
          select 1 from public.team_account_members member
          where member.team_id = team.id
            and member.account_id = (select auth.uid())
            and member.role = 'CAPTAIN'
            and member.status = 'ACTIVE'
        )
      )
  ) then raise exception 'Only the team owner or active captain can update the team logo'; end if;
  update public.teams set logo_url = trim(p_logo_url), updated_at = now() where id = p_team_id;
end;
$$;
