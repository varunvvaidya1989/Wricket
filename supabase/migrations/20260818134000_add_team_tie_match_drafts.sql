-- A tournament fixture is a team tie. Its owner-defined ordered child matches,
-- rather than the deprecated competition-level match_format, determine whether
-- each contest is singles or doubles.

create table public.sport_fixture_matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  fixture_id uuid not null,
  display_order integer not null check (display_order >= 0),
  match_format text not null check (match_format in ('SINGLES', 'DOUBLES')),
  label text not null check (length(trim(label)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (fixture_id, competition_id)
    references public.sport_fixtures(id, competition_id) on delete cascade,
  unique (fixture_id, display_order)
);

create index sport_fixture_matches_competition_idx
on public.sport_fixture_matches(competition_id, fixture_id, display_order);

alter table public.sport_fixture_matches enable row level security;
create policy "sport_fixture_matches_read_authorized"
on public.sport_fixture_matches for select to authenticated
using ((select app_private.can_read_sport_competition(competition_id)));
revoke all on public.sport_fixture_matches from public, anon, authenticated;
grant select on public.sport_fixture_matches to authenticated;

insert into public.sport_fixture_matches(
  competition_id, fixture_id, display_order, match_format, label
)
select fixture.competition_id, fixture.id, 0, competition.match_format, 'Match 1'
from public.sport_fixtures fixture
join public.sport_competitions competition on competition.id = fixture.competition_id
where competition.kind = 'TOURNAMENT';

create or replace function app_private.write_sport_team_tie_matches(
  p_fixture_id uuid, p_matches jsonb
)
returns void language plpgsql security definer set search_path = public
as $$
declare selected_fixture public.sport_fixtures%rowtype;
declare selected public.sport_competitions%rowtype;
begin
  select * into selected_fixture from public.sport_fixtures where id = p_fixture_id;
  if not found then raise exception 'Team tie was not found'; end if;
  select * into selected from public.sport_competitions where id = selected_fixture.competition_id;
  if selected.kind <> 'TOURNAMENT' then raise exception 'Only tournaments contain team ties'; end if;
  if jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) < 1 then
    raise exception 'A team tie must contain at least one match';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_matches) item
    where upper(trim(coalesce(item->>'format', ''))) not in ('SINGLES', 'DOUBLES')
      or length(trim(coalesce(item->>'label', ''))) > 80
  ) then raise exception 'Every team-tie match needs a supported format and a label of at most 80 characters'; end if;

  delete from public.sport_fixture_matches where fixture_id = selected_fixture.id;
  insert into public.sport_fixture_matches(
    competition_id, fixture_id, display_order, match_format, label
  )
  select selected_fixture.competition_id, selected_fixture.id,
    (item.ordinality - 1)::integer,
    upper(trim(item.value->>'format')),
    coalesce(nullif(trim(item.value->>'label'), ''), 'Match ' || item.ordinality)
  from jsonb_array_elements(p_matches) with ordinality item(value, ordinality);
end;
$$;

create or replace function app_private.schedule_sport_team_tie(
  p_competition_id uuid, p_stage_id uuid, p_division_key text,
  p_entrant_a_id uuid, p_entrant_b_id uuid, p_venue_id uuid, p_court text,
  p_scheduled_at timestamptz, p_duration_minutes integer, p_display_order integer,
  p_expected_schedule_version integer, p_idempotency_key text, p_matches jsonb
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare result jsonb;
declare fixture_id_value uuid;
declare stored_matches jsonb;
declare requested_matches jsonb;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if selected.kind <> 'TOURNAMENT' then raise exception 'Only tournaments contain team ties'; end if;
  result := app_private.schedule_sport_fixture(
    p_competition_id, p_stage_id, p_division_key, p_entrant_a_id, p_entrant_b_id,
    p_venue_id, p_court, p_scheduled_at, p_duration_minutes, p_display_order,
    p_expected_schedule_version, p_idempotency_key
  );
  fixture_id_value := (result->>'fixture_id')::uuid;
  select jsonb_agg(jsonb_build_object('format', match_format, 'label', label) order by display_order)
  into stored_matches from public.sport_fixture_matches where fixture_id = fixture_id_value;
  select jsonb_agg(jsonb_build_object(
    'format', upper(trim(item.value->>'format')),
    'label', coalesce(nullif(trim(item.value->>'label'), ''), 'Match ' || item.ordinality)
  ) order by item.ordinality)
  into requested_matches from jsonb_array_elements(p_matches) with ordinality item(value, ordinality);
  if stored_matches is null then
    perform app_private.write_sport_team_tie_matches(fixture_id_value, p_matches);
    perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
      'TEAM_TIE_DRAFTED', jsonb_build_object('fixture_id', fixture_id_value, 'match_count', jsonb_array_length(p_matches)));
  elsif stored_matches <> requested_matches then
    raise exception 'Idempotency key was already used for a different team-tie draft';
  end if;
  return result;
end;
$$;

create or replace function app_private.update_sport_team_tie_matches(
  p_fixture_id uuid, p_matches jsonb,
  p_expected_schedule_version integer, p_expected_row_version integer
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare selected_fixture public.sport_fixtures%rowtype;
declare selected public.sport_competitions%rowtype;
declare next_version integer;
begin
  select * into selected_fixture from public.sport_fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Team tie was not found'; end if;
  selected := app_private.require_managed_competition(selected_fixture.competition_id);
  select * into selected from public.sport_competitions where id = selected.id for update;
  if selected.kind <> 'TOURNAMENT' then raise exception 'Only tournaments contain team ties'; end if;
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_LOCKED', 'PUBLISHED') then
    raise exception 'Team-tie drafts are locked in the current lifecycle';
  end if;
  if selected_fixture.status = 'CANCELLED' then raise exception 'Cancelled team ties cannot be edited'; end if;
  if selected.schedule_version <> p_expected_schedule_version
    or selected_fixture.row_version <> p_expected_row_version then
    raise exception 'Schedule changed; reload before saving';
  end if;
  perform app_private.write_sport_team_tie_matches(selected_fixture.id, p_matches);
  next_version := selected.schedule_version + 1;
  update public.sport_fixtures set row_version = row_version + 1, updated_at = now()
  where id = selected_fixture.id;
  update public.sport_competitions set schedule_version = next_version, updated_at = now()
  where id = selected.id;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'TEAM_TIE_DRAFT_UPDATED', jsonb_build_object(
      'fixture_id', selected_fixture.id, 'match_count', jsonb_array_length(p_matches),
      'schedule_version', next_version));
  return jsonb_build_object('fixture_id', selected_fixture.id, 'schedule_version', next_version,
    'row_version', selected_fixture.row_version + 1);
end;
$$;

create or replace function public.schedule_sport_team_tie(
  p_competition_id uuid, p_stage_id uuid, p_division_key text,
  p_entrant_a_id uuid, p_entrant_b_id uuid, p_venue_id uuid, p_court text,
  p_scheduled_at timestamptz, p_duration_minutes integer, p_display_order integer,
  p_expected_schedule_version integer, p_idempotency_key text, p_matches jsonb
)
returns jsonb language sql security definer set search_path = public
as $$ select app_private.schedule_sport_team_tie(
  p_competition_id, p_stage_id, p_division_key, p_entrant_a_id, p_entrant_b_id,
  p_venue_id, p_court, p_scheduled_at, p_duration_minutes, p_display_order,
  p_expected_schedule_version, p_idempotency_key, p_matches
) $$;

create or replace function public.update_sport_team_tie_matches(
  p_fixture_id uuid, p_matches jsonb,
  p_expected_schedule_version integer, p_expected_row_version integer
)
returns jsonb language sql security definer set search_path = public
as $$ select app_private.update_sport_team_tie_matches(
  p_fixture_id, p_matches, p_expected_schedule_version, p_expected_row_version
) $$;

revoke all on function app_private.write_sport_team_tie_matches(uuid, jsonb) from public, anon, authenticated;
revoke all on function app_private.schedule_sport_team_tie(uuid, uuid, text, uuid, uuid, uuid, text,
  timestamptz, integer, integer, integer, text, jsonb) from public, anon, authenticated;
revoke all on function app_private.update_sport_team_tie_matches(uuid, jsonb, integer, integer)
  from public, anon, authenticated;
revoke all on function public.schedule_sport_team_tie(uuid, uuid, text, uuid, uuid, uuid, text,
  timestamptz, integer, integer, integer, text, jsonb) from public, anon;
revoke all on function public.update_sport_team_tie_matches(uuid, jsonb, integer, integer)
  from public, anon;
grant execute on function public.schedule_sport_team_tie(uuid, uuid, text, uuid, uuid, uuid, text,
  timestamptz, integer, integer, integer, text, jsonb) to authenticated;
grant execute on function public.update_sport_team_tie_matches(uuid, jsonb, integer, integer)
  to authenticated;

-- Squad registration is no longer filtered by one competition-wide format.
create or replace function app_private.register_sport_tournament_squad(
  p_competition_id uuid, p_team_id uuid, p_division_key text default 'OPEN'
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare selected_team public.sport_teams%rowtype;
declare selected_entry public.sport_competition_entries%rowtype;
declare entry_id_value uuid;
declare manager boolean;
declare clean_division text := upper(trim(coalesce(p_division_key, 'OPEN')));
declare roster_count integer;
declare captain_id uuid;
begin
  select * into selected from public.sport_competitions where id = p_competition_id for update;
  if not found or selected.kind <> 'TOURNAMENT' then raise exception 'Choose a team tournament'; end if;
  manager := app_private.can_manage_sport_competition(selected.id);
  if not manager and not app_private.can_manage_sport_team(p_team_id) then
    raise exception 'Only a team owner, captain, or competition organizer can register this squad';
  end if;
  if not app_private.registration_is_open(selected, manager) then raise exception 'Registration is not open'; end if;
  select team.* into selected_team from public.sport_teams team
  join public.sport_clubs club on club.id = team.club_id
  where team.id = p_team_id and club.sport_id = selected.sport_id;
  if not found then raise exception 'Choose a reusable team for this sport'; end if;
  if not exists (select 1 from public.sport_competition_divisions where competition_id = selected.id and division_key = clean_division) then
    raise exception 'Competition division was not found';
  end if;
  select count(*) into roster_count from public.sport_team_memberships
  where team_id = selected_team.id and status = 'ACTIVE';
  if roster_count < 1 then raise exception 'Team needs at least one active player'; end if;
  select access.account_id into captain_id
  from public.sport_team_access access
  where access.team_id = selected_team.id and access.role = 'CAPTAIN' and access.status = 'ACTIVE'
  order by access.accepted_at limit 1;
  captain_id := coalesce(captain_id, selected_team.owner_account_id);

  select entry.* into selected_entry
  from public.sport_competition_entries entry
  join public.sport_tournament_squads squad on squad.entry_id = entry.id
  where entry.competition_id = selected.id and entry.division_key = clean_division
    and squad.source_team_id = selected_team.id
  for update of entry;

  if found then
    if selected_entry.status not in ('WITHDRAWN', 'REJECTED', 'DISQUALIFIED') then
      return selected_entry.id;
    end if;
    update public.sport_competition_entries set
      status = 'PENDING', seed = null, accepted_at = null, approved_at = null,
      withdrawn_at = null,
      snapshot = jsonb_build_object(
        'team_id', selected_team.id, 'name', selected_team.name,
        'short_name', selected_team.short_name, 'logo_url', selected_team.logo_url
      ), updated_at = now()
    where id = selected_entry.id;
    update public.sport_tournament_squads set
      name_snapshot = selected_team.name, short_name_snapshot = selected_team.short_name,
      logo_url_snapshot = selected_team.logo_url, captain_account_id = captain_id,
      roster_locked_at = null, updated_at = now()
    where entry_id = selected_entry.id;
    delete from public.sport_squad_members where squad_entry_id = selected_entry.id;
    insert into public.sport_squad_members(
      squad_entry_id, sport_profile_id, display_name_snapshot, avatar_url_snapshot,
      eligibility, status, accepted_at, approved_at
    )
    select selected_entry.id, membership.sport_profile_id, membership.display_name_snapshot,
      membership.avatar_url_snapshot, membership.eligibility, 'ACCEPTED', now(), null
    from public.sport_team_memberships membership
    where membership.team_id = selected_team.id and membership.status = 'ACTIVE';
    perform app_private.write_sport_audit(selected.sport_id, 'ENTRY', selected_entry.id,
      'ENTRY_REREGISTERED', jsonb_build_object(
        'from_status', selected_entry.status, 'team_id', selected_team.id, 'division', clean_division));
    return selected_entry.id;
  end if;

  insert into public.sport_competition_entries(
    competition_id, entry_kind, division_key, status, snapshot
  ) values (
    selected.id, 'SQUAD', clean_division, 'PENDING',
    jsonb_build_object('team_id', selected_team.id, 'name', selected_team.name,
      'short_name', selected_team.short_name, 'logo_url', selected_team.logo_url)
  ) returning id into entry_id_value;
  insert into public.sport_tournament_squads(
    entry_id, competition_id, division_key, source_team_id,
    name_snapshot, short_name_snapshot, logo_url_snapshot, captain_account_id
  ) values (
    entry_id_value, selected.id, clean_division, selected_team.id,
    selected_team.name, selected_team.short_name, selected_team.logo_url, captain_id
  );
  insert into public.sport_squad_members(
    squad_entry_id, sport_profile_id, display_name_snapshot, avatar_url_snapshot,
    eligibility, status, accepted_at, approved_at
  )
  select entry_id_value, membership.sport_profile_id, membership.display_name_snapshot,
    membership.avatar_url_snapshot, membership.eligibility, 'ACCEPTED', now(), null
  from public.sport_team_memberships membership
  where membership.team_id = selected_team.id and membership.status = 'ACTIVE';
  perform app_private.write_sport_audit(selected.sport_id, 'ENTRY', entry_id_value,
    'TOURNAMENT_SQUAD_REGISTERED', jsonb_build_object(
      'team_id', selected_team.id, 'division', clean_division));
  return entry_id_value;
end;
$$;
revoke all on function app_private.register_sport_tournament_squad(uuid, uuid, text)
  from public, anon, authenticated;

comment on column public.sport_competitions.match_format is
  'Deprecated compatibility field. Match format is defined per fixture match in sport_fixture_matches.';
comment on table public.sport_fixture_matches is
  'Owner-defined ordered singles/doubles matches that comprise one tournament team tie.';
