-- Complete the remaining Phase 3 review corrections: registration capacity,
-- atomic manual ordering, bounded check-in, versioned points configuration,
-- fixture officials, and editable owner-defined resources.

create or replace function app_private.enforce_sport_division_capacity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare capacity_value integer;
declare occupied integer;
begin
  if new.status in ('WITHDRAWN', 'REJECTED', 'DISQUALIFIED') then return new; end if;
  select division.registration_capacity into capacity_value
  from public.sport_competition_divisions division
  where division.competition_id = new.competition_id
    and division.division_key = new.division_key
  for update;
  if capacity_value is null then return new; end if;
  select count(*) into occupied
  from public.sport_competition_entries entry
  where entry.competition_id = new.competition_id
    and entry.division_key = new.division_key
    and entry.id <> new.id
    and entry.status not in ('WITHDRAWN', 'REJECTED', 'DISQUALIFIED');
  if occupied >= capacity_value then
    raise exception 'Division registration capacity has been reached';
  end if;
  return new;
end;
$$;

drop trigger if exists sport_competition_entries_enforce_capacity
on public.sport_competition_entries;
create trigger sport_competition_entries_enforce_capacity
before insert or update of competition_id, division_key, status
on public.sport_competition_entries
for each row execute function app_private.enforce_sport_division_capacity();

alter table public.sport_fixtures
  add column check_in_opens_at timestamptz,
  add column check_in_closes_at timestamptz,
  add constraint sport_fixtures_check_in_window_valid check (
    check_in_opens_at is null or check_in_closes_at is null
    or check_in_closes_at >= check_in_opens_at
  );

create or replace function app_private.set_sport_fixture_check_in_window()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.scheduled_at is null then
    new.check_in_opens_at := null;
    new.check_in_closes_at := null;
  elsif tg_op = 'INSERT' or new.scheduled_at is distinct from old.scheduled_at then
    new.check_in_opens_at := new.scheduled_at - interval '60 minutes';
    new.check_in_closes_at := new.scheduled_at + interval '15 minutes';
  end if;
  return new;
end;
$$;

update public.sport_fixtures set
  check_in_opens_at = scheduled_at - interval '60 minutes',
  check_in_closes_at = scheduled_at + interval '15 minutes'
where scheduled_at is not null;

create trigger sport_fixtures_set_check_in_window
before insert or update of scheduled_at on public.sport_fixtures
for each row execute function app_private.set_sport_fixture_check_in_window();

create or replace function app_private.check_in_sport_fixture_entry(
  p_fixture_id uuid,
  p_entry_id uuid,
  p_status public.sport_check_in_status default 'CHECKED_IN'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare selected_fixture public.sport_fixtures%rowtype;
declare selected public.sport_competitions%rowtype;
declare check_in_id_value uuid;
declare manager boolean;
begin
  select * into selected_fixture from public.sport_fixtures where id = p_fixture_id;
  if not found or selected_fixture.status = 'CANCELLED' then raise exception 'Active fixture was not found'; end if;
  if p_entry_id not in (selected_fixture.entrant_a_id, selected_fixture.entrant_b_id) then
    raise exception 'Entry is not part of this fixture';
  end if;
  manager := app_private.can_manage_sport_competition(selected_fixture.competition_id);
  if not manager and (p_status <> 'CHECKED_IN' or not app_private.can_control_sport_entry(p_entry_id)) then
    raise exception 'Only the entrant can check in; organizers control late and no-show states';
  end if;
  if not manager and (
    selected_fixture.check_in_opens_at is null
    or now() < selected_fixture.check_in_opens_at
    or now() > selected_fixture.check_in_closes_at
  ) then
    raise exception 'Fixture check-in is not open';
  end if;
  insert into public.sport_fixture_check_ins(
    fixture_id, competition_id, entry_id, status, checked_at, checked_by
  ) values (
    selected_fixture.id, selected_fixture.competition_id, p_entry_id, p_status, now(), (select auth.uid())
  ) on conflict (fixture_id, entry_id) do update set
    status = excluded.status, checked_at = excluded.checked_at,
    checked_by = excluded.checked_by, updated_at = now()
  returning id into check_in_id_value;
  select * into selected from public.sport_competitions where id = selected_fixture.competition_id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'FIXTURE_ENTRY_' || p_status::text,
    jsonb_build_object('fixture_id', selected_fixture.id, 'entry_id', p_entry_id));
  return check_in_id_value;
end;
$$;

create table public.sport_competition_points_rules (
  competition_id uuid primary key references public.sport_competitions(id) on delete cascade,
  win_points integer not null default 2 check (win_points >= 0),
  draw_points integer not null default 1 check (draw_points >= 0),
  loss_points integer not null default 0 check (loss_points >= 0),
  walkover_points integer not null default 2 check (walkover_points >= 0),
  version integer not null default 1 check (version > 0),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sport_competition_points_rules(competition_id)
select id from public.sport_competitions on conflict do nothing;

create or replace function app_private.create_default_sport_competition_points_rule()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.sport_competition_points_rules(competition_id) values (new.id)
  on conflict do nothing;
  return new;
end;
$$;
create trigger sport_competitions_create_points_rule
after insert on public.sport_competitions
for each row execute function app_private.create_default_sport_competition_points_rule();

alter table public.sport_competition_points_rules enable row level security;
create policy "sport_competition_points_rules_read_authorized"
on public.sport_competition_points_rules for select to authenticated
using ((select app_private.can_read_sport_competition(competition_id)));
revoke all on public.sport_competition_points_rules from anon, authenticated;
grant select on public.sport_competition_points_rules to authenticated;

create or replace function app_private.update_sport_competition_points_rule(
  p_competition_id uuid, p_win_points integer, p_draw_points integer,
  p_loss_points integer, p_walkover_points integer, p_expected_version integer
)
returns integer language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare next_version integer;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_LOCKED') then
    raise exception 'Points rules are locked after publication';
  end if;
  if least(p_win_points, p_draw_points, p_loss_points, p_walkover_points) < 0 then
    raise exception 'Points values cannot be negative';
  end if;
  update public.sport_competition_points_rules set
    win_points = p_win_points, draw_points = p_draw_points,
    loss_points = p_loss_points, walkover_points = p_walkover_points,
    version = version + 1, updated_by = (select auth.uid()), updated_at = now()
  where competition_id = selected.id and version = p_expected_version
  returning version into next_version;
  if next_version is null then raise exception 'Points rules changed; reload before saving'; end if;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'POINTS_RULE_UPDATED', jsonb_build_object('version', next_version));
  return next_version;
end;
$$;

create table public.sport_fixture_officials (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null,
  competition_id uuid not null,
  account_id uuid not null references public.profiles(id) on delete cascade,
  display_name_snapshot text not null check (length(trim(display_name_snapshot)) between 2 and 120),
  role text not null check (role in ('SCOREKEEPER', 'REFEREE')),
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (fixture_id, competition_id)
    references public.sport_fixtures(id, competition_id) on delete cascade,
  unique (fixture_id, account_id, role)
);
alter table public.sport_fixture_officials enable row level security;
create policy "sport_fixture_officials_read_authorized"
on public.sport_fixture_officials for select to authenticated
using ((select app_private.can_read_sport_competition(competition_id)));
revoke all on public.sport_fixture_officials from anon, authenticated;
grant select on public.sport_fixture_officials to authenticated;

create or replace function app_private.assign_sport_fixture_official(
  p_fixture_id uuid, p_account_id uuid, p_role text
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare selected_fixture public.sport_fixtures%rowtype;
declare selected public.sport_competitions%rowtype;
declare selected_profile public.sport_profiles%rowtype;
declare official_id uuid;
declare clean_role text := upper(trim(p_role));
begin
  select * into selected_fixture from public.sport_fixtures where id = p_fixture_id;
  if not found then raise exception 'Fixture was not found'; end if;
  selected := app_private.require_managed_competition(selected_fixture.competition_id);
  if clean_role not in ('SCOREKEEPER', 'REFEREE') then raise exception 'Unsupported fixture official role'; end if;
  select * into selected_profile from public.sport_profiles
  where account_id = p_account_id and sport_id = selected.sport_id and status = 'ACTIVE';
  if not found then raise exception 'Official must have an active profile for this sport'; end if;
  insert into public.sport_fixture_officials(
    fixture_id, competition_id, account_id, display_name_snapshot, role, assigned_by
  ) values (
    selected_fixture.id, selected.id, p_account_id, selected_profile.display_name,
    clean_role, (select auth.uid())
  ) on conflict (fixture_id, account_id, role) do update set
    display_name_snapshot = excluded.display_name_snapshot
  returning id into official_id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'FIXTURE_OFFICIAL_ASSIGNED', jsonb_build_object('fixture_id', selected_fixture.id,
      'official_id', official_id, 'account_id', p_account_id, 'role', clean_role));
  return official_id;
end;
$$;

create or replace function app_private.revoke_sport_fixture_official(p_official_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare selected_official public.sport_fixture_officials%rowtype;
declare selected public.sport_competitions%rowtype;
begin
  select * into selected_official from public.sport_fixture_officials where id = p_official_id;
  if not found then return; end if;
  selected := app_private.require_managed_competition(selected_official.competition_id);
  delete from public.sport_fixture_officials where id = selected_official.id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'FIXTURE_OFFICIAL_REVOKED', jsonb_build_object('fixture_id', selected_official.fixture_id,
      'account_id', selected_official.account_id, 'role', selected_official.role));
end;
$$;

create or replace function app_private.reorder_sport_fixtures(
  p_competition_id uuid, p_fixture_ids uuid[], p_expected_schedule_version integer
)
returns integer language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare fixture_count integer;
declare distinct_count integer;
declare temporary_offset integer;
declare next_version integer;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  select * into selected from public.sport_competitions where id = selected.id for update;
  if selected.schedule_version <> p_expected_schedule_version then
    raise exception 'Schedule changed; reload before saving';
  end if;
  select count(*), coalesce(max(display_order), 0) + count(*) + 1
  into fixture_count, temporary_offset from public.sport_fixtures where competition_id = selected.id;
  select count(distinct ordered.id) into distinct_count
  from unnest(p_fixture_ids) as ordered(id);
  if cardinality(p_fixture_ids) <> fixture_count or distinct_count <> fixture_count
    or exists (select 1 from unnest(p_fixture_ids) as ordered(id) where not exists (
      select 1 from public.sport_fixtures fixture where fixture.id = ordered.id and fixture.competition_id = selected.id
    )) then raise exception 'Fixture order must contain every competition fixture exactly once'; end if;
  update public.sport_fixtures set display_order = display_order + temporary_offset
  where competition_id = selected.id;
  update public.sport_fixtures fixture set display_order = (ordered.ordinality - 1)::integer, updated_at = now()
  from unnest(p_fixture_ids) with ordinality ordered(id, ordinality)
  where fixture.id = ordered.id and fixture.competition_id = selected.id;
  next_version := selected.schedule_version + 1;
  update public.sport_competitions set schedule_version = next_version, updated_at = now()
  where id = selected.id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'FIXTURES_REORDERED', jsonb_build_object('schedule_version', next_version));
  return next_version;
end;
$$;

create or replace function app_private.update_sport_competition_resource(
  p_resource_type text, p_resource_id uuid, p_name text,
  p_address text default null, p_capacity integer default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare competition_id_value uuid;
declare selected public.sport_competitions%rowtype;
declare clean_type text := upper(trim(p_resource_type));
begin
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Resource name is required'; end if;
  if clean_type = 'STAGE' then
    select competition_id into competition_id_value from public.sport_competition_stages where id = p_resource_id;
  elsif clean_type = 'VENUE' then
    select competition_id into competition_id_value from public.sport_competition_venues where id = p_resource_id;
  elsif clean_type = 'DIVISION' then
    select competition_id into competition_id_value from public.sport_competition_divisions where id = p_resource_id;
  else raise exception 'Unsupported competition resource type'; end if;
  selected := app_private.require_managed_competition(competition_id_value);
  if clean_type in ('STAGE', 'DIVISION') and selected.lifecycle not in ('DRAFT', 'REGISTRATION_OPEN') then
    raise exception 'Competition structure is locked';
  end if;
  if clean_type = 'STAGE' then
    update public.sport_competition_stages set name = trim(p_name), updated_at = now() where id = p_resource_id;
  elsif clean_type = 'VENUE' then
    update public.sport_competition_venues set name = trim(p_name), address = nullif(trim(p_address), ''), updated_at = now() where id = p_resource_id;
  else
    if p_capacity is not null and p_capacity <= 1 then raise exception 'Division capacity must be at least 2'; end if;
    if p_capacity is not null and p_capacity < (select count(*) from public.sport_competition_entries
      where competition_id = selected.id and division_key = (select division_key from public.sport_competition_divisions where id = p_resource_id)
        and status not in ('WITHDRAWN', 'REJECTED', 'DISQUALIFIED')) then
      raise exception 'Division capacity is below current registrations';
    end if;
    update public.sport_competition_divisions set name = trim(p_name), registration_capacity = p_capacity, updated_at = now() where id = p_resource_id;
  end if;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    clean_type || '_UPDATED', jsonb_build_object('resource_id', p_resource_id));
end;
$$;

create or replace function app_private.delete_sport_competition_resource(
  p_resource_type text, p_resource_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
declare competition_id_value uuid;
declare division_key_value text;
declare selected public.sport_competitions%rowtype;
declare clean_type text := upper(trim(p_resource_type));
begin
  if clean_type = 'STAGE' then
    select competition_id into competition_id_value from public.sport_competition_stages where id = p_resource_id;
  elsif clean_type = 'VENUE' then
    select competition_id into competition_id_value from public.sport_competition_venues where id = p_resource_id;
  elsif clean_type = 'DIVISION' then
    select competition_id, division_key into competition_id_value, division_key_value
    from public.sport_competition_divisions where id = p_resource_id;
  else raise exception 'Unsupported competition resource type'; end if;
  selected := app_private.require_managed_competition(competition_id_value);
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_OPEN') then raise exception 'Competition structure is locked'; end if;
  if clean_type = 'STAGE' then
    if exists (select 1 from public.sport_fixtures where stage_id = p_resource_id) then raise exception 'Stage is used by a fixture'; end if;
    delete from public.sport_competition_stages where id = p_resource_id;
  elsif clean_type = 'VENUE' then
    if exists (select 1 from public.sport_fixtures where venue_id = p_resource_id) then raise exception 'Venue is used by a fixture'; end if;
    delete from public.sport_competition_venues where id = p_resource_id;
  else
    if (select count(*) from public.sport_competition_divisions where competition_id = selected.id) <= 1 then raise exception 'Competition must keep one division'; end if;
    if exists (select 1 from public.sport_competition_entries where competition_id = selected.id and division_key = division_key_value)
      or exists (select 1 from public.sport_fixtures where competition_id = selected.id and division_key = division_key_value) then
      raise exception 'Division is already in use';
    end if;
    delete from public.sport_competition_divisions where id = p_resource_id;
  end if;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    clean_type || '_DELETED', jsonb_build_object('resource_id', p_resource_id));
end;
$$;

-- Assigned officials must be able to read their private fixture context.
create or replace function app_private.can_read_sport_competition(p_competition_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.sport_competitions competition
    where competition.id = p_competition_id and (
      (competition.visibility = 'PUBLIC' and competition.lifecycle in (
        'REGISTRATION_OPEN', 'REGISTRATION_LOCKED', 'PUBLISHED', 'LIVE', 'COMPLETED', 'ARCHIVED'
      ))
      or app_private.can_manage_sport_competition(competition.id)
      or exists (select 1 from public.sport_fixture_officials official
        where official.competition_id = competition.id and official.account_id = (select auth.uid()))
      or exists (select 1 from public.sport_competition_entries entry
        join public.sport_league_players player on player.entry_id = entry.id
        join public.sport_profiles profile on profile.id = player.sport_profile_id
        where entry.competition_id = competition.id and profile.account_id = (select auth.uid()))
      or exists (select 1 from public.sport_competition_entries entry
        join public.sport_tournament_squads squad on squad.entry_id = entry.id
        join public.sport_squad_members member on member.squad_entry_id = squad.entry_id
        join public.sport_profiles profile on profile.id = member.sport_profile_id
        where entry.competition_id = competition.id and profile.account_id = (select auth.uid()))
    )
  )
$$;

create or replace function public.update_sport_competition_points_rule(
  p_competition_id uuid, p_win_points integer, p_draw_points integer,
  p_loss_points integer, p_walkover_points integer, p_expected_version integer
)
returns integer language sql security definer set search_path = public
as $$ select app_private.update_sport_competition_points_rule(p_competition_id, p_win_points,
  p_draw_points, p_loss_points, p_walkover_points, p_expected_version) $$;
create or replace function public.assign_sport_fixture_official(p_fixture_id uuid, p_account_id uuid, p_role text)
returns uuid language sql security definer set search_path = public
as $$ select app_private.assign_sport_fixture_official(p_fixture_id, p_account_id, p_role) $$;
create or replace function public.revoke_sport_fixture_official(p_official_id uuid)
returns void language sql security definer set search_path = public
as $$ select app_private.revoke_sport_fixture_official(p_official_id) $$;
create or replace function public.reorder_sport_fixtures(p_competition_id uuid, p_fixture_ids uuid[], p_expected_schedule_version integer)
returns integer language sql security definer set search_path = public
as $$ select app_private.reorder_sport_fixtures(p_competition_id, p_fixture_ids, p_expected_schedule_version) $$;
create or replace function public.update_sport_competition_resource(p_resource_type text, p_resource_id uuid, p_name text, p_address text default null, p_capacity integer default null)
returns void language sql security definer set search_path = public
as $$ select app_private.update_sport_competition_resource(p_resource_type, p_resource_id, p_name, p_address, p_capacity) $$;
create or replace function public.delete_sport_competition_resource(p_resource_type text, p_resource_id uuid)
returns void language sql security definer set search_path = public
as $$ select app_private.delete_sport_competition_resource(p_resource_type, p_resource_id) $$;

revoke all on function app_private.enforce_sport_division_capacity() from public, anon, authenticated;
revoke all on function app_private.set_sport_fixture_check_in_window() from public, anon, authenticated;
revoke all on function app_private.create_default_sport_competition_points_rule() from public, anon, authenticated;
revoke all on function app_private.update_sport_competition_points_rule(uuid, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function app_private.assign_sport_fixture_official(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.revoke_sport_fixture_official(uuid) from public, anon, authenticated;
revoke all on function app_private.reorder_sport_fixtures(uuid, uuid[], integer) from public, anon, authenticated;
revoke all on function app_private.update_sport_competition_resource(text, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function app_private.delete_sport_competition_resource(text, uuid) from public, anon, authenticated;
revoke all on function public.update_sport_competition_points_rule(uuid, integer, integer, integer, integer, integer) from public, anon;
revoke all on function public.assign_sport_fixture_official(uuid, uuid, text) from public, anon;
revoke all on function public.revoke_sport_fixture_official(uuid) from public, anon;
revoke all on function public.reorder_sport_fixtures(uuid, uuid[], integer) from public, anon;
revoke all on function public.update_sport_competition_resource(text, uuid, text, text, integer) from public, anon;
revoke all on function public.delete_sport_competition_resource(text, uuid) from public, anon;
grant execute on function public.update_sport_competition_points_rule(uuid, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.assign_sport_fixture_official(uuid, uuid, text) to authenticated;
grant execute on function public.revoke_sport_fixture_official(uuid) to authenticated;
grant execute on function public.reorder_sport_fixtures(uuid, uuid[], integer) to authenticated;
grant execute on function public.update_sport_competition_resource(text, uuid, text, text, integer) to authenticated;
grant execute on function public.delete_sport_competition_resource(text, uuid) to authenticated;
