-- The public security-invoker wrapper needs authenticated callers to execute
-- its private implementation. That implementation checks owner/captain access
-- before updating a roster row; neither public nor anon receives execution.
revoke all on function app_private.set_team_player_keeper(uuid, uuid, boolean) from public, anon;
grant execute on function app_private.set_team_player_keeper(uuid, uuid, boolean) to authenticated;
