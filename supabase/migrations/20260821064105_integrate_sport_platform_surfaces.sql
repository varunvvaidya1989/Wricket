alter table public.sport_public_live_snapshots
  add column sport_id uuid references public.sports(id) on delete cascade;

update public.sport_public_live_snapshots snapshot
set sport_id = match.sport_id
from public.sport_scoring_matches match
where match.id = snapshot.scoring_match_id;

alter table public.sport_public_live_snapshots
  alter column sport_id set not null;

create index sport_public_live_snapshots_sport_idx
on public.sport_public_live_snapshots(sport_id, refreshed_at desc);

create or replace function app_private.refresh_sport_public_live_snapshot(p_scoring_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare match public.sport_scoring_matches%rowtype; declare competition public.sport_competitions%rowtype;
declare fixture public.sport_fixtures%rowtype; declare sport_code_value text; declare score_value text;
declare name_a text; declare name_b text;
begin
  select * into match from public.sport_scoring_matches where id = p_scoring_match_id;
  if not found or match.competition_id is null then return; end if;
  select * into competition from public.sport_competitions where id = match.competition_id;
  if competition.visibility <> 'PUBLIC' or competition.lifecycle not in ('PUBLISHED', 'LIVE', 'COMPLETED', 'ARCHIVED') then delete from public.sport_public_live_snapshots where scoring_match_id = match.id; return; end if;
  select * into fixture from public.sport_fixtures where id = match.fixture_id;
  select code into sport_code_value from public.sports where id = match.sport_id;
  select coalesce(squad.name_snapshot, player.display_name_snapshot, entry.snapshot->>'name', 'Entrant') into name_a from public.sport_competition_entries entry left join public.sport_tournament_squads squad on squad.entry_id = entry.id left join public.sport_league_players player on player.entry_id = entry.id where entry.id = match.entrant_a_id;
  select coalesce(squad.name_snapshot, player.display_name_snapshot, entry.snapshot->>'name', 'Entrant') into name_b from public.sport_competition_entries entry left join public.sport_tournament_squads squad on squad.entry_id = entry.id left join public.sport_league_players player on player.entry_id = entry.id where entry.id = match.entrant_b_id;
  select coalesce(payload->>'headline_score', '0-0') into score_value from public.sport_scoring_events where scoring_match_id = match.id order by sequence desc limit 1;
  insert into public.sport_public_live_snapshots(scoring_match_id, sport_id, sport_code, competition_id, competition_name, fixture_id, participant_a, participant_b, match_format, status, headline_score, scheduled_at, started_at, completed_at, refreshed_at, stale_after, share_slug)
  values (match.id, match.sport_id, sport_code_value, competition.id, competition.name, fixture.id, name_a, name_b, match.match_format, match.status, coalesce(score_value, '0-0'), fixture.scheduled_at, case when match.status in ('LIVE','COMPLETED') then match.updated_at end, match.completed_at, now(), now() + interval '2 minutes', lower(sport_code_value) || '-' || replace(match.id::text, '-', ''))
  on conflict (scoring_match_id) do update set sport_id = excluded.sport_id, status = excluded.status, headline_score = excluded.headline_score, completed_at = excluded.completed_at, refreshed_at = now(), stale_after = now() + interval '2 minutes';
end;
$$;

update public.sport_notifications notification
set deep_link = coalesce(sport.app_route, '/')
from public.sports sport
where sport.id = notification.sport_id and notification.deep_link = '/sports';

create or replace function app_private.capture_sport_audit_operation()
returns trigger language plpgsql security definer set search_path = public as $$
declare sport_route text;
begin
  select coalesce(app_route, '/') into sport_route from public.sports where id = new.sport_id;
  insert into public.sport_operational_events(sport_id, category, operation, actor_account_id, resource_type, resource_id, payload, occurred_at)
  values (new.sport_id, 'AUDIT', new.action, new.actor_account_id, new.resource_type, new.resource_id, new.payload, new.occurred_at);
  if new.payload ? 'account_id' and (new.payload->>'account_id') ~* '^[0-9a-f-]{36}$' then
    insert into public.sport_notifications(account_id, sport_id, kind, title, body, resource_type, resource_id, deep_link)
    values ((new.payload->>'account_id')::uuid, new.sport_id,
      case when new.action like '%INVITED%' then 'INVITATION' when new.action like '%OFFICIAL%' then 'OFFICIAL_ASSIGNMENT' else 'SYSTEM' end,
      replace(initcap(lower(new.action)), '_', ' '), 'Open SportStage to review this update.', new.resource_type, new.resource_id, sport_route);
  end if;
  if new.action in ('TEAM_TIE_STARTED', 'TEAM_TIE_RUBBER_OUTCOME_RECORDED', 'SPORT_SCORING_PREPARED') then
    insert into public.sport_notifications(account_id, sport_id, kind, title, body, resource_type, resource_id, deep_link)
    select distinct squad.captain_account_id, new.sport_id,
      case when new.action = 'TEAM_TIE_STARTED' then 'MATCH_START' when new.action = 'TEAM_TIE_RUBBER_OUTCOME_RECORDED' then 'FINAL_RESULT' else 'SCHEDULE_CHANGE' end,
      replace(initcap(lower(new.action)), '_', ' '), 'Your team competition has a new update.', new.resource_type, new.resource_id, sport_route
    from public.sport_fixtures fixture join public.sport_tournament_squads squad on squad.entry_id in (fixture.entrant_a_id, fixture.entrant_b_id)
    where fixture.id = new.resource_id and squad.captain_account_id is not null;
  end if;
  return new;
end;
$$;

create or replace function app_private.list_my_sport_statistics()
returns table(sport_code text, matches_played bigint, wins bigint, losses bigint)
language sql stable security definer set search_path = public as $$
  with my_profiles as (
    select id from public.sport_profiles where account_id = (select auth.uid()) and status = 'ACTIVE'
  ), completed as (
    select scoring.id, scoring.sport_id, scoring.entrant_a_id, scoring.entrant_b_id,
      coalesce(revision.revised_winner_entry_id, fixture_result.winner_entry_id, rubber_result.winner_entry_id) winner_entry_id,
      scoring.side_a_players, scoring.side_b_players
    from public.sport_scoring_matches scoring
    left join public.sport_fixture_results fixture_result on fixture_result.scoring_match_id = scoring.id
    left join public.sport_fixture_match_results rubber_result on rubber_result.fixture_match_id = scoring.fixture_match_id
    left join lateral (select revised_winner_entry_id from public.sport_result_revisions where scoring_match_id = scoring.id order by created_at desc limit 1) revision on true
    where scoring.status = 'COMPLETED'
  ), mine as (
    select distinct completed.id, completed.sport_id,
      case
        when exists (select 1 from jsonb_array_elements_text(completed.side_a_players) player join my_profiles profile on profile.id::text = player) then completed.entrant_a_id
        when exists (select 1 from jsonb_array_elements_text(completed.side_b_players) player join my_profiles profile on profile.id::text = player) then completed.entrant_b_id
      end own_entry_id,
      completed.winner_entry_id
    from completed
    where exists (select 1 from jsonb_array_elements_text(completed.side_a_players || completed.side_b_players) player join my_profiles profile on profile.id::text = player)
  )
  select sport.code, count(distinct mine.id),
    count(distinct mine.id) filter (where mine.own_entry_id = mine.winner_entry_id),
    count(distinct mine.id) filter (where mine.winner_entry_id is not null and mine.own_entry_id <> mine.winner_entry_id)
  from mine join public.sports sport on sport.id = mine.sport_id
  group by sport.code order by sport.code
$$;

create or replace function public.list_my_sport_statistics()
returns table(sport_code text, matches_played bigint, wins bigint, losses bigint)
language sql security definer set search_path = public as $$
  select * from app_private.list_my_sport_statistics()
$$;

revoke all on function app_private.list_my_sport_statistics() from public, anon, authenticated;
revoke all on function public.list_my_sport_statistics() from public, anon;
grant execute on function public.list_my_sport_statistics() to authenticated;
