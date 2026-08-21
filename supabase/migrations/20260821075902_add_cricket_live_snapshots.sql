-- Add cricket to the SportStage landing feed without exposing cricket domain tables.

create table public.cricket_live_snapshots (
  match_id uuid primary key references public.matches(id) on delete cascade,
  sport_id uuid not null references public.sports(id) on delete restrict,
  sport_code text not null default 'CRICKET' check (sport_code = 'CRICKET'),
  competition_id uuid not null,
  competition_name text not null,
  participant_a text not null,
  participant_b text not null,
  match_format text not null,
  status text not null,
  headline_score text not null,
  refreshed_at timestamptz not null,
  stale_after timestamptz not null,
  share_slug text not null unique
);

create index cricket_live_snapshots_refreshed_idx
  on public.cricket_live_snapshots(refreshed_at desc, match_id);

alter table public.cricket_live_snapshots enable row level security;
create policy "cricket_live_snapshots_read"
  on public.cricket_live_snapshots
  for select
  to anon, authenticated
  using (true);

revoke all on public.cricket_live_snapshots from public, anon, authenticated;
grant select on public.cricket_live_snapshots to anon, authenticated;

create or replace function app_private.refresh_cricket_live_snapshot(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  live_match record;
  snapshot record;
  sport_id_value uuid;
  refreshed_at_value timestamptz;
  runs_value integer;
  wickets_value integer;
  legal_balls_value integer;
  overs_value text;
begin
  select
    match.id,
    match.tournament_id,
    match.format,
    match.status,
    match.visibility,
    match.updated_at,
    team_a.name as participant_a,
    team_b.name as participant_b,
    tournament.name as tournament_name,
    tournament.visibility as tournament_visibility
  into live_match
  from public.matches as match
  join public.teams as team_a on team_a.id = match.team_a_id
  join public.teams as team_b on team_b.id = match.team_b_id
  left join public.tournaments as tournament on tournament.id = match.tournament_id
  where match.id = p_match_id;

  if not found then
    delete from public.cricket_live_snapshots where match_id = p_match_id;
    return;
  end if;

  if live_match.visibility <> 'PUBLIC'
    or live_match.status not in ('IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION')
    or (live_match.tournament_id is not null and live_match.tournament_visibility <> 'PUBLIC') then
    delete from public.cricket_live_snapshots where match_id = p_match_id;
    return;
  end if;

  select code.id into sport_id_value
  from public.sports as code
  where code.code = 'CRICKET';

  if sport_id_value is null then
    raise exception 'Cricket is missing from the sport catalog';
  end if;

  select value.scoreboard, value.updated_at
  into snapshot
  from public.match_snapshots as value
  where value.match_id = p_match_id;

  runs_value := greatest(coalesce((snapshot.scoreboard->>'total_runs')::integer, 0), 0);
  wickets_value := greatest(coalesce((snapshot.scoreboard->>'total_wickets')::integer, 0), 0);
  legal_balls_value := greatest(coalesce((snapshot.scoreboard->>'legal_balls')::integer, 0), 0);
  overs_value := (legal_balls_value / 6)::text || '.' || (legal_balls_value % 6)::text;
  refreshed_at_value := coalesce(snapshot.updated_at, live_match.updated_at, now());

  insert into public.cricket_live_snapshots(
    match_id, sport_id, competition_id, competition_name,
    participant_a, participant_b, match_format, status, headline_score,
    refreshed_at, stale_after, share_slug
  ) values (
    live_match.id,
    sport_id_value,
    coalesce(live_match.tournament_id, live_match.id),
    coalesce(live_match.tournament_name, 'Friendly match'),
    live_match.participant_a,
    live_match.participant_b,
    live_match.format,
    'LIVE',
    runs_value::text || '/' || wickets_value::text || ' (' || overs_value || ' ov)',
    refreshed_at_value,
    refreshed_at_value + interval '2 minutes',
    'cricket-' || replace(live_match.id::text, '-', '')
  )
  on conflict (match_id) do update set
    sport_id = excluded.sport_id,
    competition_id = excluded.competition_id,
    competition_name = excluded.competition_name,
    participant_a = excluded.participant_a,
    participant_b = excluded.participant_b,
    match_format = excluded.match_format,
    status = excluded.status,
    headline_score = excluded.headline_score,
    refreshed_at = excluded.refreshed_at,
    stale_after = excluded.stale_after;
end;
$$;

create or replace function app_private.refresh_cricket_live_snapshot_from_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.refresh_cricket_live_snapshot(new.id);
  return new;
end;
$$;

create or replace function app_private.refresh_cricket_live_snapshot_from_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.refresh_cricket_live_snapshot(coalesce(new.match_id, old.match_id));
  return coalesce(new, old);
end;
$$;

create or replace function app_private.refresh_cricket_live_snapshots_from_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_id_value uuid;
begin
  for match_id_value in
    select match.id
    from public.matches as match
    where match.team_a_id = new.id or match.team_b_id = new.id
  loop
    perform app_private.refresh_cricket_live_snapshot(match_id_value);
  end loop;
  return new;
end;
$$;

create or replace function app_private.refresh_cricket_live_snapshots_from_tournament()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_id_value uuid;
begin
  for match_id_value in
    select match.id from public.matches as match where match.tournament_id = new.id
  loop
    perform app_private.refresh_cricket_live_snapshot(match_id_value);
  end loop;
  return new;
end;
$$;

create trigger cricket_live_snapshot_match_changed
after insert or update of status, visibility, tournament_id, team_a_id, team_b_id, format
on public.matches
for each row execute function app_private.refresh_cricket_live_snapshot_from_match();

create trigger cricket_live_snapshot_score_changed
after insert or update or delete on public.match_snapshots
for each row execute function app_private.refresh_cricket_live_snapshot_from_score();

create trigger cricket_live_snapshot_team_changed
after update of name on public.teams
for each row execute function app_private.refresh_cricket_live_snapshots_from_team();

create trigger cricket_live_snapshot_tournament_changed
after update of name, visibility on public.tournaments
for each row execute function app_private.refresh_cricket_live_snapshots_from_tournament();

create or replace function public.discover_cricket_live(
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table (
  scoring_match_id uuid,
  sport_id uuid,
  sport_code text,
  competition_id uuid,
  competition_name text,
  participant_a text,
  participant_b text,
  match_format text,
  status text,
  headline_score text,
  refreshed_at timestamptz,
  stale_after timestamptz,
  share_slug text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    snapshot.match_id,
    snapshot.sport_id,
    snapshot.sport_code,
    snapshot.competition_id,
    snapshot.competition_name,
    snapshot.participant_a,
    snapshot.participant_b,
    snapshot.match_format,
    snapshot.status,
    snapshot.headline_score,
    snapshot.refreshed_at,
    snapshot.stale_after,
    snapshot.share_slug
  from public.cricket_live_snapshots as snapshot
  where p_before is null or snapshot.refreshed_at < p_before
  order by snapshot.refreshed_at desc, snapshot.match_id
  limit least(greatest(p_limit, 1), 50)
$$;

revoke all on function app_private.refresh_cricket_live_snapshot(uuid),
  app_private.refresh_cricket_live_snapshot_from_match(),
  app_private.refresh_cricket_live_snapshot_from_score(),
  app_private.refresh_cricket_live_snapshots_from_team(),
  app_private.refresh_cricket_live_snapshots_from_tournament()
from public, anon, authenticated;
revoke all on function public.discover_cricket_live(integer, timestamptz)
from public, anon, authenticated;
grant execute on function public.discover_cricket_live(integer, timestamptz)
to anon, authenticated;

do $$
declare
  match_id_value uuid;
begin
  for match_id_value in select id from public.matches loop
    perform app_private.refresh_cricket_live_snapshot(match_id_value);
  end loop;
end;
$$;
