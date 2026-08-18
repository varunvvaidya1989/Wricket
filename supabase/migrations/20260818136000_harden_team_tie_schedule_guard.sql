-- Preserve the competition privacy boundary while rejecting the obsolete
-- tournament scheduling path.

create or replace function public.schedule_sport_fixture(
  p_competition_id uuid, p_stage_id uuid, p_division_key text,
  p_entrant_a_id uuid, p_entrant_b_id uuid, p_venue_id uuid,
  p_court text, p_scheduled_at timestamptz, p_duration_minutes integer,
  p_display_order integer, p_expected_schedule_version integer,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if selected.kind = 'TOURNAMENT' then
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
