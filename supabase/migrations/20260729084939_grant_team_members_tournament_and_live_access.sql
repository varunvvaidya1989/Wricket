-- An account that actively belongs to any team in a tournament may discover
-- that tournament and read its participant-facing match data. Management
-- permissions remain governed by the existing owner/admin/captain policies.

create or replace function app_private.is_team_participant_in_tournament(
  p_tournament_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
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

create or replace function app_private.is_team_participant_for_team(
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams team
    where team.id = p_team_id
      and app_private.is_team_participant_in_tournament(team.tournament_id)
  );
$$;

create or replace function app_private.is_team_participant_for_match(
  p_match_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.matches match
    where match.id = p_match_id
      and app_private.is_team_participant_in_tournament(match.tournament_id)
  );
$$;

create or replace function app_private.is_team_participant_for_stage(
  p_stage_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fixture_stages stage
    where stage.id = p_stage_id
      and app_private.is_team_participant_in_tournament(stage.tournament_id)
  );
$$;

revoke all on function app_private.is_team_participant_in_tournament(uuid)
from public, anon;
revoke all on function app_private.is_team_participant_for_team(uuid)
from public, anon;
revoke all on function app_private.is_team_participant_for_match(uuid)
from public, anon;
revoke all on function app_private.is_team_participant_for_stage(uuid)
from public, anon;

grant execute on function app_private.is_team_participant_in_tournament(uuid)
to authenticated;
grant execute on function app_private.is_team_participant_for_team(uuid)
to authenticated;
grant execute on function app_private.is_team_participant_for_match(uuid)
to authenticated;
grant execute on function app_private.is_team_participant_for_stage(uuid)
to authenticated;

drop policy if exists "tournaments_read_team_participant" on public.tournaments;
create policy "tournaments_read_team_participant"
on public.tournaments for select
to authenticated
using ((select app_private.is_team_participant_in_tournament(id)));

drop policy if exists "teams_read_own_members" on public.teams;
create policy "teams_read_tournament_participants"
on public.teams for select
to authenticated
using ((select app_private.is_team_participant_for_team(id)));

drop policy if exists "team_players_read_teammates" on public.team_players;
create policy "team_players_read_tournament_participants"
on public.team_players for select
to authenticated
using ((select app_private.is_team_participant_for_team(team_id)));

drop policy if exists "matches_read_team_participant" on public.matches;
create policy "matches_read_team_participant"
on public.matches for select
to authenticated
using ((select app_private.is_team_participant_in_tournament(tournament_id)));

drop policy if exists "match_events_read_team_participant" on public.match_events;
create policy "match_events_read_team_participant"
on public.match_events for select
to authenticated
using ((select app_private.is_team_participant_for_match(match_id)));

drop policy if exists "match_snapshots_read_team_participant" on public.match_snapshots;
create policy "match_snapshots_read_team_participant"
on public.match_snapshots for select
to authenticated
using ((select app_private.is_team_participant_for_match(match_id)));

drop policy if exists "match_xis_read_team_participant" on public.match_xis;
create policy "match_xis_read_team_participant"
on public.match_xis for select
to authenticated
using ((select app_private.is_team_participant_for_match(match_id)));

drop policy if exists "match_innings_read_team_participant" on public.match_innings;
create policy "match_innings_read_team_participant"
on public.match_innings for select
to authenticated
using ((select app_private.is_team_participant_for_match(match_id)));

create policy "fixture_stages_team_participant_read"
on public.fixture_stages for select
to authenticated
using ((select app_private.is_team_participant_in_tournament(tournament_id)));

create policy "fixture_groups_team_participant_read"
on public.fixture_groups for select
to authenticated
using ((select app_private.is_team_participant_for_stage(stage_id)));

create policy "fixture_matches_team_participant_read"
on public.fixture_matches for select
to authenticated
using ((select app_private.is_team_participant_for_stage(stage_id)));

create policy "brackets_team_participant_read"
on public.knockout_brackets for select
to authenticated
using ((select app_private.is_team_participant_for_stage(stage_id)));

create policy "tie_resolutions_team_participant_read"
on public.fixture_tie_resolutions for select
to authenticated
using ((select app_private.is_team_participant_for_stage(stage_id)));
