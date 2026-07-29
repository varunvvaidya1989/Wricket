create policy "tournaments_read_team_participant"
on public.tournaments for select
to authenticated
using (
  exists (
    select 1
    from public.teams team
    join public.team_account_members member on member.team_id = team.id
    where team.tournament_id = tournaments.id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
  )
);

create policy "teams_read_own_members"
on public.teams for select
to authenticated
using (
  exists (
    select 1 from public.team_account_members member
    where member.team_id = teams.id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
  )
);

create policy "team_players_read_teammates"
on public.team_players for select
to authenticated
using (
  exists (
    select 1 from public.team_account_members member
    where member.team_id = team_players.team_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
  )
);

create policy "matches_read_team_participant"
on public.matches for select
to authenticated
using (
  exists (
    select 1 from public.team_account_members member
    where member.team_id in (matches.team_a_id, matches.team_b_id)
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
  )
);

create policy "match_events_read_team_participant"
on public.match_events for select
to authenticated
using (
  exists (
    select 1
    from public.matches match
    join public.team_account_members member
      on member.team_id in (match.team_a_id, match.team_b_id)
    where match.id = match_events.match_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
  )
);

create policy "match_snapshots_read_team_participant"
on public.match_snapshots for select
to authenticated
using (
  exists (
    select 1
    from public.matches match
    join public.team_account_members member
      on member.team_id in (match.team_a_id, match.team_b_id)
    where match.id = match_snapshots.match_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
  )
);

create policy "match_xis_read_team_participant"
on public.match_xis for select
to authenticated
using (
  exists (
    select 1
    from public.team_account_members member
    where member.team_id = match_xis.team_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
  )
);

create policy "match_innings_read_team_participant"
on public.match_innings for select
to authenticated
using (
  exists (
    select 1
    from public.matches match
    join public.team_account_members member
      on member.team_id in (match.team_a_id, match.team_b_id)
    where match.id = match_innings.match_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
  )
);
