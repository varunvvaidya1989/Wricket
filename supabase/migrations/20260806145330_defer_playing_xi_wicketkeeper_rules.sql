-- Wicketkeeper selection will be redesigned in a later phase. Keep squad
-- eligibility data, but validate only XI size and match captain for now.
create or replace function app_private.validate_completed_playing_xi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_id uuid := coalesce(new.match_id, old.match_id);
  v_team_id uuid := coalesce(new.team_id, old.team_id);
  v_required_players integer;
  v_actual_players integer;
  v_captain_count integer;
begin
  if not exists (
    select 1 from public.matches
    where id = v_match_id and status = 'IN_PROGRESS'
  ) then return null; end if;

  select greatest(1, coalesce((rules ->> 'playersPerSide')::integer, 11))
    into v_required_players
  from public.matches where id = v_match_id;

  select count(*), count(*) filter (where xi.is_captain)
    into v_actual_players, v_captain_count
  from public.match_xis xi
  where xi.match_id = v_match_id and xi.team_id = v_team_id;

  if v_actual_players <> v_required_players then
    raise exception 'Each Playing XI must contain exactly % players', v_required_players;
  end if;
  if v_captain_count <> 1 then
    raise exception 'Each Playing XI must contain exactly one match captain';
  end if;
  return null;
end;
$$;

revoke all on function app_private.validate_completed_playing_xi() from public, anon, authenticated;
