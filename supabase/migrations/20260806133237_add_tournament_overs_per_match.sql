alter table public.tournaments
add column overs_per_match integer;

update public.tournaments
set overs_per_match = case format
  when 'BOX' then 5 when 'TURF' then 10 when 'TURF_TEST' then 90
  when 'T20' then 20 when 'T10' then 10 when 'ODI' then 50 else 20
end
where overs_per_match is null;

alter table public.tournaments
alter column overs_per_match set not null,
alter column overs_per_match set default 20,
add constraint tournaments_overs_per_match_check check (overs_per_match between 1 and 100);

update public.matches match
set rules = coalesce(match.rules, '{}'::jsonb) || jsonb_build_object(
  'oversPerInnings', tournament.overs_per_match,
  'playersPerSide', tournament.players_per_team
)
from public.tournaments tournament
where tournament.id = match.tournament_id
  and match.status in ('SETUP', 'SCHEDULED');

create or replace function app_private.create_match_for_fixture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_b_id is null then return new; end if;
  insert into public.matches (
    tournament_id, team_a_id, team_b_id, format, status, visibility,
    rules, created_by, fixture_match_id
  )
  select
    stage.tournament_id, new.team_a_id, new.team_b_id, tournament.format,
    case new.status
      when 'LIVE' then 'IN_PROGRESS'::public.match_status
      when 'COMPLETED' then 'COMPLETED'::public.match_status
      when 'WALKOVER' then 'COMPLETED'::public.match_status
      else 'SCHEDULED'::public.match_status
    end,
    tournament.visibility::text::public.match_visibility,
    jsonb_build_object(
      'oversPerInnings', tournament.overs_per_match,
      'playersPerSide', tournament.players_per_team
    ),
    tournament.created_by,
    new.id
  from public.fixture_stages stage
  join public.tournaments tournament on tournament.id = stage.tournament_id
  where stage.id = new.stage_id
  on conflict (fixture_match_id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.create_match_for_fixture() from public, anon, authenticated;
