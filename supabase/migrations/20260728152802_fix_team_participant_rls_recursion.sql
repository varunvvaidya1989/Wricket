create or replace function app_private.is_team_participant_in_tournament(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams team
    join public.team_account_members member on member.team_id = team.id
    where team.tournament_id = p_tournament_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
  );
$$;

revoke all on function app_private.is_team_participant_in_tournament(uuid) from public, anon;
grant execute on function app_private.is_team_participant_in_tournament(uuid) to authenticated;

drop policy if exists "tournaments_read_team_participant" on public.tournaments;
create policy "tournaments_read_team_participant"
on public.tournaments for select
to authenticated
using ((select app_private.is_team_participant_in_tournament(id)));
