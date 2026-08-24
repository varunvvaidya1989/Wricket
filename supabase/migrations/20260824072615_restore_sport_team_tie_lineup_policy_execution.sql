-- Lineup and lineup-player SELECT policies invoke this private helper even
-- when the competition has no lineups yet.
grant execute on function app_private.can_read_sport_team_tie_lineup(uuid) to authenticated;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'app_private.can_read_sport_team_tie_lineup(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated team-tie lineup reads remain blocked';
  end if;
end;
$$;
