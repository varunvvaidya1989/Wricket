-- The exposed wrapper is SECURITY INVOKER, so it needs permission to invoke
-- the private implementation as the signed-in caller. The implementation
-- still validates scorer access, the scoring lease, and event sequencing.
grant execute on function app_private.append_sport_scoring_event(
  uuid, uuid, integer, uuid, text, jsonb, uuid
) to authenticated;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'app_private.append_sport_scoring_event(uuid,uuid,integer,uuid,text,jsonb,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated sport scoring event command remains blocked';
  end if;
end;
$$;
