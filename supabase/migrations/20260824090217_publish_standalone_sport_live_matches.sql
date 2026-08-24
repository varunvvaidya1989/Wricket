-- Standalone matches have no competition or fixture, but they still belong in
-- the public live network once scoring starts.
alter table public.sport_public_live_snapshots
  alter column competition_id drop not null,
  alter column fixture_id drop not null;

create or replace function app_private.refresh_sport_public_live_snapshot(
  p_scoring_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_match public.sport_scoring_matches%rowtype;
  selected_competition public.sport_competitions%rowtype;
  selected_fixture public.sport_fixtures%rowtype;
  sport_code_value text;
  score_value text;
  name_a text;
  name_b text;
begin
  select * into selected_match
  from public.sport_scoring_matches
  where id = p_scoring_match_id;

  if not found then
    delete from public.sport_public_live_snapshots where scoring_match_id = p_scoring_match_id;
    return;
  end if;

  select code into sport_code_value
  from public.sports
  where id = selected_match.sport_id;

  select coalesce(
    (
      select nullif(event.payload->>'headline_score', '')
      from public.sport_scoring_events event
      where event.scoring_match_id = selected_match.id
        and nullif(event.payload->>'headline_score', '') is not null
      order by event.sequence desc
      limit 1
    ),
    (
      select snapshot.headline_score
      from public.sport_public_live_snapshots snapshot
      where snapshot.scoring_match_id = selected_match.id
    ),
    '0-0'
  ) into score_value;

  if selected_match.competition_id is null then
    select string_agg(player.display_name_snapshot, ' / ' order by player.player_order)
      filter (where player.side = 0),
      string_agg(player.display_name_snapshot, ' / ' order by player.player_order)
      filter (where player.side = 1)
    into name_a, name_b
    from public.sport_scoring_match_players player
    where player.scoring_match_id = selected_match.id;

    insert into public.sport_public_live_snapshots(
      scoring_match_id, sport_id, sport_code, competition_id, competition_name,
      fixture_id, participant_a, participant_b, match_format, status,
      headline_score, scheduled_at, started_at, completed_at, refreshed_at,
      stale_after, share_slug
    ) values (
      selected_match.id, selected_match.sport_id, sport_code_value, null, 'Friendly match',
      null, coalesce(nullif(name_a, ''), 'Side A'), coalesce(nullif(name_b, ''), 'Side B'),
      selected_match.match_format, selected_match.status, score_value, null,
      case when selected_match.status in ('LIVE', 'COMPLETED') then selected_match.updated_at end,
      selected_match.completed_at, now(), now() + interval '2 minutes',
      lower(sport_code_value) || '-' || replace(selected_match.id::text, '-', '')
    )
    on conflict (scoring_match_id) do update set
      participant_a = excluded.participant_a,
      participant_b = excluded.participant_b,
      status = excluded.status,
      headline_score = excluded.headline_score,
      started_at = coalesce(public.sport_public_live_snapshots.started_at, excluded.started_at),
      completed_at = excluded.completed_at,
      refreshed_at = now(),
      stale_after = now() + interval '2 minutes';
    return;
  end if;

  select * into selected_competition
  from public.sport_competitions
  where id = selected_match.competition_id;

  if not found
    or selected_competition.visibility <> 'PUBLIC'
    or selected_competition.lifecycle not in ('PUBLISHED', 'LIVE', 'COMPLETED', 'ARCHIVED') then
    delete from public.sport_public_live_snapshots where scoring_match_id = selected_match.id;
    return;
  end if;

  select * into selected_fixture
  from public.sport_fixtures
  where id = selected_match.fixture_id;
  if not found then
    delete from public.sport_public_live_snapshots where scoring_match_id = selected_match.id;
    return;
  end if;

  select coalesce(squad.name_snapshot, player.display_name_snapshot, entry.snapshot->>'name', 'Entrant')
  into name_a
  from public.sport_competition_entries entry
  left join public.sport_tournament_squads squad on squad.entry_id = entry.id
  left join public.sport_league_players player on player.entry_id = entry.id
  where entry.id = selected_match.entrant_a_id;

  select coalesce(squad.name_snapshot, player.display_name_snapshot, entry.snapshot->>'name', 'Entrant')
  into name_b
  from public.sport_competition_entries entry
  left join public.sport_tournament_squads squad on squad.entry_id = entry.id
  left join public.sport_league_players player on player.entry_id = entry.id
  where entry.id = selected_match.entrant_b_id;

  insert into public.sport_public_live_snapshots(
    scoring_match_id, sport_id, sport_code, competition_id, competition_name,
    fixture_id, participant_a, participant_b, match_format, status,
    headline_score, scheduled_at, started_at, completed_at, refreshed_at,
    stale_after, share_slug
  ) values (
    selected_match.id, selected_match.sport_id, sport_code_value,
    selected_competition.id, selected_competition.name, selected_fixture.id,
    name_a, name_b, selected_match.match_format, selected_match.status,
    score_value, selected_fixture.scheduled_at,
    case when selected_match.status in ('LIVE', 'COMPLETED') then selected_match.updated_at end,
    selected_match.completed_at, now(), now() + interval '2 minutes',
    lower(sport_code_value) || '-' || replace(selected_match.id::text, '-', '')
  )
  on conflict (scoring_match_id) do update set
    competition_name = excluded.competition_name,
    participant_a = excluded.participant_a,
    participant_b = excluded.participant_b,
    status = excluded.status,
    headline_score = excluded.headline_score,
    started_at = coalesce(public.sport_public_live_snapshots.started_at, excluded.started_at),
    completed_at = excluded.completed_at,
    refreshed_at = now(),
    stale_after = now() + interval '2 minutes';
end;
$$;

create or replace function app_private.refresh_sport_public_live_match_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.refresh_sport_public_live_snapshot(new.id);
  return new;
end;
$$;

drop trigger if exists sport_scoring_match_refresh_public on public.sport_scoring_matches;
create trigger sport_scoring_match_refresh_public
after update of status on public.sport_scoring_matches
for each row
when (old.status is distinct from new.status)
execute function app_private.refresh_sport_public_live_match_trigger();

revoke all on function app_private.refresh_sport_public_live_match_trigger()
from public, anon, authenticated;

-- Backfill matches that were already live before the lifecycle trigger existed.
select app_private.refresh_sport_public_live_snapshot(match.id)
from public.sport_scoring_matches match
where match.status = 'LIVE';
