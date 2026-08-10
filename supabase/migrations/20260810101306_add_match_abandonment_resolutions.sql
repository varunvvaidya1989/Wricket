create or replace function app_private.apply_match_abandonment_resolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_match public.matches%rowtype;
  result_payload jsonb;
  result_kind text;
  winner_id uuid;
begin
  if new.kind <> 'MATCH_ABANDONED' then return new; end if;

  result_payload := new.payload->'result';
  if result_payload is null then return new; end if;
  result_kind := result_payload->>'kind';
  if result_kind not in ('WALKOVER', 'NO_RESULT', 'CANCELLED') then
    raise exception 'Invalid match abandonment resolution';
  end if;

  select * into selected_match from public.matches where id = new.match_id;
  if not found then raise exception 'Match not found'; end if;

  if result_kind = 'WALKOVER' then
    winner_id := nullif(result_payload->>'winnerTeamId', '')::uuid;
    if winner_id is null or winner_id not in (selected_match.team_a_id, selected_match.team_b_id) then
      raise exception 'Walkover winner must be one of the match teams';
    end if;
  elsif result_payload ? 'winnerTeamId' then
    raise exception 'Only a walkover can include a winner';
  end if;

  update public.matches
  set
    status = case when result_kind = 'WALKOVER' then 'COMPLETED'::public.match_status else 'ABANDONED'::public.match_status end,
    result = result_payload,
    updated_at = now()
  where id = new.match_id;

  return new;
end;
$$;

revoke all on function app_private.apply_match_abandonment_resolution() from public, anon, authenticated;

drop trigger if exists apply_match_abandonment_resolution on public.match_events;
create trigger apply_match_abandonment_resolution
after insert on public.match_events
for each row
when (new.kind = 'MATCH_ABANDONED')
execute function app_private.apply_match_abandonment_resolution();
