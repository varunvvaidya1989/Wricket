-- Older clients must not create a tournament fixture without its child-match
-- draft. The team-tie command calls the private scheduler atomically; the
-- generic public command remains available only to individual-player leagues.

create or replace function public.schedule_sport_fixture(
  p_competition_id uuid, p_stage_id uuid, p_division_key text,
  p_entrant_a_id uuid, p_entrant_b_id uuid, p_venue_id uuid,
  p_court text, p_scheduled_at timestamptz, p_duration_minutes integer,
  p_display_order integer, p_expected_schedule_version integer,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare competition_kind public.sport_competition_kind;
begin
  select kind into competition_kind from public.sport_competitions
  where id = p_competition_id;
  if competition_kind is null then raise exception 'Competition was not found'; end if;
  if competition_kind = 'TOURNAMENT' then
    raise exception 'Tournament fixtures require an ordered team-tie match draft';
  end if;
  return app_private.schedule_sport_fixture(
    p_competition_id, p_stage_id, p_division_key, p_entrant_a_id, p_entrant_b_id,
    p_venue_id, p_court, p_scheduled_at, p_duration_minutes, p_display_order,
    p_expected_schedule_version, p_idempotency_key
  );
end;
$$;

revoke all on function public.schedule_sport_fixture(uuid, uuid, text, uuid, uuid, uuid, text,
  timestamptz, integer, integer, integer, text) from public, anon;
grant execute on function public.schedule_sport_fixture(uuid, uuid, text, uuid, uuid, uuid, text,
  timestamptz, integer, integer, integer, text) to authenticated;
