-- Final Phase 3 schedule hardening: an idempotency key may replay only the same
-- request, and reorder operations obey the same lifecycle lock as other schedule
-- mutations.

alter table public.sport_fixtures add column idempotency_fingerprint text;

create or replace function app_private.schedule_sport_fixture(
  p_competition_id uuid,
  p_stage_id uuid,
  p_division_key text,
  p_entrant_a_id uuid,
  p_entrant_b_id uuid,
  p_venue_id uuid,
  p_court text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_display_order integer,
  p_expected_schedule_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare existing public.sport_fixtures%rowtype;
declare fixture_id_value uuid;
declare next_version integer;
declare request_fingerprint text;
begin
  if length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 120 then
    raise exception 'Idempotency key must contain 8 to 120 characters';
  end if;
  request_fingerprint := md5(jsonb_build_object(
    'stage_id', p_stage_id, 'division_key', upper(trim(p_division_key)),
    'entrant_a_id', p_entrant_a_id, 'entrant_b_id', p_entrant_b_id,
    'venue_id', p_venue_id, 'court', nullif(trim(p_court), ''),
    'scheduled_at', p_scheduled_at, 'duration_minutes', p_duration_minutes,
    'display_order', p_display_order
  )::text);
  selected := app_private.require_managed_competition(p_competition_id);
  select * into selected from public.sport_competitions where id = selected.id for update;
  select * into existing from public.sport_fixtures
  where competition_id = selected.id and idempotency_key = trim(p_idempotency_key);
  if found then
    if existing.idempotency_fingerprint is not null
      and existing.idempotency_fingerprint <> request_fingerprint then
      raise exception 'Idempotency key was already used for a different fixture request';
    end if;
    return jsonb_build_object('fixture_id', existing.id, 'schedule_version', selected.schedule_version);
  end if;
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_LOCKED', 'PUBLISHED', 'LIVE') then
    raise exception 'Fixtures cannot be scheduled in the current lifecycle';
  end if;
  if selected.schedule_version <> p_expected_schedule_version then
    raise exception 'Schedule changed; reload before saving';
  end if;
  if not exists (select 1 from public.sport_competition_entries
    where id = p_entrant_a_id and competition_id = selected.id and division_key = upper(trim(p_division_key)) and status = 'APPROVED')
    or not exists (select 1 from public.sport_competition_entries
    where id = p_entrant_b_id and competition_id = selected.id and division_key = upper(trim(p_division_key)) and status = 'APPROVED') then
    raise exception 'Fixtures require two approved entrants in the same division';
  end if;
  insert into public.sport_fixtures(
    competition_id, stage_id, division_key, entrant_a_id, entrant_b_id,
    venue_id, court, scheduled_at, duration_minutes, display_order,
    idempotency_key, idempotency_fingerprint, created_by
  ) values (
    selected.id, p_stage_id, upper(trim(p_division_key)), p_entrant_a_id, p_entrant_b_id,
    p_venue_id, nullif(trim(p_court), ''), p_scheduled_at, p_duration_minutes,
    p_display_order, trim(p_idempotency_key), request_fingerprint, (select auth.uid())
  ) returning id into fixture_id_value;
  next_version := selected.schedule_version + 1;
  update public.sport_competitions set schedule_version = next_version, updated_at = now() where id = selected.id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'FIXTURE_SCHEDULED', jsonb_build_object('fixture_id', fixture_id_value, 'schedule_version', next_version));
  return jsonb_build_object('fixture_id', fixture_id_value, 'schedule_version', next_version);
end;
$$;

create or replace function public.reorder_sport_fixtures(
  p_competition_id uuid, p_fixture_ids uuid[], p_expected_schedule_version integer
)
returns integer language plpgsql security definer set search_path = public
as $$
declare lifecycle_value public.sport_competition_lifecycle;
begin
  select lifecycle into lifecycle_value from public.sport_competitions where id = p_competition_id;
  if lifecycle_value not in ('DRAFT', 'REGISTRATION_LOCKED', 'PUBLISHED', 'LIVE') then
    raise exception 'Fixtures cannot be reordered in the current lifecycle';
  end if;
  return app_private.reorder_sport_fixtures(
    p_competition_id, p_fixture_ids, p_expected_schedule_version
  );
end;
$$;

revoke all on function app_private.schedule_sport_fixture(uuid, uuid, text, uuid, uuid, uuid, text,
  timestamptz, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.reorder_sport_fixtures(uuid, uuid[], integer) from public, anon;
grant execute on function public.reorder_sport_fixtures(uuid, uuid[], integer) to authenticated;
