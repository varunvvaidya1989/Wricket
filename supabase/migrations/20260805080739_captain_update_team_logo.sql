drop policy if exists "captains_update_team" on public.teams;

create policy "teams_update_owner_only"
on public.teams for update to authenticated
using (
  exists (
    select 1 from public.tournaments tournament
    where tournament.id = teams.tournament_id
      and tournament.created_by = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.tournaments tournament
    where tournament.id = teams.tournament_id
      and tournament.created_by = (select auth.uid())
  )
);

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
    join public.tournaments tournament on tournament.id = team.tournament_id
    where team.id = p_team_id
      and (
        tournament.created_by = (select auth.uid())
        or exists (
          select 1 from public.team_account_members member
          where member.team_id = team.id
            and member.account_id = (select auth.uid())
            and member.role = 'CAPTAIN'
            and member.status = 'ACTIVE'
        )
      )
  ) then raise exception 'Only the tournament owner or active team captain can update the team logo'; end if;

  update public.teams set logo_url = trim(p_logo_url), updated_at = now() where id = p_team_id;
end;
$$;

create or replace function public.update_team_logo(p_team_id uuid, p_logo_url text)
returns void language sql security invoker set search_path = public
as $$ select app_private.update_team_logo(p_team_id, p_logo_url) $$;

revoke all on function app_private.update_team_logo(uuid, text) from public, anon;
revoke all on function public.update_team_logo(uuid, text) from public, anon;
grant execute on function app_private.update_team_logo(uuid, text) to authenticated;
grant execute on function public.update_team_logo(uuid, text) to authenticated;
