-- These public security-invoker wrappers call implementations in the private
-- schema, so the authenticated database role needs execution on both layers.
grant execute on function app_private.create_standalone_sport_scoring_match(
  text, text, uuid[], uuid[], jsonb
) to authenticated;
grant execute on function app_private.prepare_sport_fixture_scoring(
  uuid, uuid, jsonb
) to authenticated;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'app_private.create_standalone_sport_scoring_match(text,text,uuid[],uuid[],jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'app_private.prepare_sport_fixture_scoring(uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated sport scoring commands remain blocked';
  end if;
end;
$$;
