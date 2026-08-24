-- The SELECT policy on sport_scoring_matches invokes this private helper for
-- every authenticated query, including an empty result set. Keep the helper
-- callable by the database role while it remains outside the exposed API
-- schema.
grant execute on function app_private.can_read_sport_scoring_match(uuid) to authenticated;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'app_private.can_read_sport_scoring_match(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated sport scoring reads remain blocked';
  end if;
end;
$$;
