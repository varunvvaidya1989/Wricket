-- Make public.matches the canonical lifecycle row for every playable fixture.
-- fixture_matches remains stage/group metadata during the transition.
alter table public.matches
add column fixture_match_id uuid unique
references public.fixture_matches(id) on delete cascade;

create index matches_fixture_match_idx
on public.matches(fixture_match_id)
where fixture_match_id is not null;

create or replace function app_private.create_match_for_fixture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_b_id is null then
    return new;
  end if;

  insert into public.matches (
    tournament_id,
    team_a_id,
    team_b_id,
    format,
    status,
    visibility,
    rules,
    created_by,
    fixture_match_id
  )
  select
    stage.tournament_id,
    new.team_a_id,
    new.team_b_id,
    tournament.format,
    case new.status
      when 'LIVE' then 'IN_PROGRESS'::public.match_status
      when 'COMPLETED' then 'COMPLETED'::public.match_status
      when 'WALKOVER' then 'COMPLETED'::public.match_status
      else 'SCHEDULED'::public.match_status
    end,
    tournament.visibility::text::public.match_visibility,
    '{}'::jsonb,
    tournament.created_by,
    new.id
  from public.fixture_stages stage
  join public.tournaments tournament on tournament.id = stage.tournament_id
  where stage.id = new.stage_id
  on conflict (fixture_match_id) do nothing;

  return new;
end;
$$;

create trigger create_match_after_fixture_insert
after insert on public.fixture_matches
for each row execute function app_private.create_match_for_fixture();

revoke all on function app_private.create_match_for_fixture() from public, anon, authenticated;

-- Backfill canonical match rows for fixtures generated before this migration.
insert into public.matches (
  tournament_id,
  team_a_id,
  team_b_id,
  format,
  status,
  visibility,
  rules,
  created_by,
  fixture_match_id
)
select
  stage.tournament_id,
  fixture.team_a_id,
  fixture.team_b_id,
  tournament.format,
  case fixture.status
    when 'LIVE' then 'IN_PROGRESS'::public.match_status
    when 'COMPLETED' then 'COMPLETED'::public.match_status
    when 'WALKOVER' then 'COMPLETED'::public.match_status
    else 'SCHEDULED'::public.match_status
  end,
  tournament.visibility::text::public.match_visibility,
  '{}'::jsonb,
  tournament.created_by,
  fixture.id
from public.fixture_matches fixture
join public.fixture_stages stage on stage.id = fixture.stage_id
join public.tournaments tournament on tournament.id = stage.tournament_id
where fixture.team_b_id is not null
on conflict (fixture_match_id) do nothing;

create or replace function app_private.sync_fixture_status_to_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.matches
  set
    status = case new.status
      when 'LIVE' then 'IN_PROGRESS'::public.match_status
      when 'COMPLETED' then 'COMPLETED'::public.match_status
      when 'WALKOVER' then 'COMPLETED'::public.match_status
      else 'SCHEDULED'::public.match_status
    end,
    updated_at = now()
  where fixture_match_id = new.id;
  return new;
end;
$$;

create trigger sync_fixture_status_to_match_after_update
after update of status on public.fixture_matches
for each row
when (old.status is distinct from new.status)
execute function app_private.sync_fixture_status_to_match();

revoke all on function app_private.sync_fixture_status_to_match() from public, anon, authenticated;

create or replace function app_private.sync_match_status_to_fixture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fixture_match_id is null then
    return new;
  end if;

  update public.fixture_matches
  set
    status = case new.status
      when 'IN_PROGRESS' then 'LIVE'
      when 'INNINGS_BREAK' then 'LIVE'
      when 'FOLLOW_ON_DECISION' then 'LIVE'
      when 'COMPLETED' then 'COMPLETED'
      when 'ABANDONED' then 'COMPLETED'
      else 'SCHEDULED'
    end,
    updated_at = now()
  where id = new.fixture_match_id;
  return new;
end;
$$;

create trigger sync_match_status_to_fixture_after_update
after update of status on public.matches
for each row
when (old.status is distinct from new.status)
execute function app_private.sync_match_status_to_fixture();

revoke all on function app_private.sync_match_status_to_fixture() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end;
$$;
