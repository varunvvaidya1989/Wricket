create or replace function app_private.list_relevant_tournament_ids()
returns table (tournament_id uuid, eligibility_reason text)
language sql stable security definer set search_path = public
as $$
  select tournament.id,
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
    end
  from public.tournaments tournament
  where (select auth.uid()) is not null
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
$$;

create or replace function app_private.follow_tournament(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if not exists (
    select 1 from public.tournaments tournament
    where tournament.id = p_tournament_id
      and (
        tournament.visibility = 'PUBLIC'
        or tournament.created_by = (select auth.uid())
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
      )
  ) then raise exception 'Tournament is not available to follow'; end if;
  insert into public.tournament_follows(tournament_id, account_id, status)
  values (p_tournament_id, (select auth.uid()), 'ACTIVE')
  on conflict (tournament_id, account_id) do update set status = 'ACTIVE', updated_at = now();
end;
$$;

create or replace function public.list_relevant_tournament_ids()
returns table (tournament_id uuid, eligibility_reason text)
language sql security invoker set search_path = public
as $$ select * from app_private.list_relevant_tournament_ids() $$;

revoke all on function app_private.list_relevant_tournament_ids() from public, anon;
revoke all on function public.list_relevant_tournament_ids() from public, anon;
grant execute on function app_private.list_relevant_tournament_ids() to authenticated;
grant execute on function public.list_relevant_tournament_ids() to authenticated;
