-- Tournament discovery and all participant-facing sporting data are readable by
-- every signed-in Wricket user. Existing write policies remain unchanged:
-- tournament owners manage tournaments/fixtures and a captain manages only the
-- roster of the team to which their account is actively assigned.

create policy "tournaments_read_all_users"
on public.tournaments for select
to authenticated
using (true);

create policy "teams_read_all_users"
on public.teams for select
to authenticated
using (true);

create policy "team_players_read_all_users"
on public.team_players for select
to authenticated
using (true);

create policy "players_read_all_users"
on public.players for select
to authenticated
using (true);

create policy "matches_read_all_users"
on public.matches for select
to authenticated
using (true);

create policy "match_events_read_all_users"
on public.match_events for select
to authenticated
using (true);

create policy "match_snapshots_read_all_users"
on public.match_snapshots for select
to authenticated
using (true);

create policy "match_xis_read_all_users"
on public.match_xis for select
to authenticated
using (true);

create policy "match_innings_read_all_users"
on public.match_innings for select
to authenticated
using (true);

create policy "fixture_stages_read_all_users"
on public.fixture_stages for select
to authenticated
using (true);

create policy "fixture_groups_read_all_users"
on public.fixture_groups for select
to authenticated
using (true);

create policy "fixture_matches_read_all_users"
on public.fixture_matches for select
to authenticated
using (true);

create policy "knockout_brackets_read_all_users"
on public.knockout_brackets for select
to authenticated
using (true);

create policy "fixture_tie_resolutions_read_all_users"
on public.fixture_tie_resolutions for select
to authenticated
using (true);

create policy "match_mvp_results_read_all_users"
on public.match_mvp_results for select
to authenticated
using (true);
