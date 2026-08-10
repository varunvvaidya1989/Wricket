-- Automatically preserve the tournament result in Match Moments. These are
-- code-rendered banners, so they remain crisp without generating/uploading an
-- image and can still receive reactions and comments like any other moment.

alter table public.match_moments
  add column system_type text
    check (system_type in ('TOURNAMENT_CHAMPION', 'TOURNAMENT_RUNNER_UP')),
  add column featured_team_id uuid references public.teams(id) on delete set null;

create unique index match_moments_tournament_system_type_idx
  on public.match_moments(tournament_id, system_type)
  where system_type is not null;

create or replace function app_private.create_tournament_result_moments(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_final_match_id uuid;
  v_team_a_id uuid;
  v_team_b_id uuid;
  v_winner_id uuid;
  v_runner_up_id uuid;
  v_winner_name text;
  v_runner_up_name text;
  v_author_id uuid;
begin
  -- The highest knockout round is the final. Ignore consolation fixtures.
  select match.id,
         match.team_a_id,
         match.team_b_id,
         coalesce(match.result ->> 'winnerTeamId', match.result ->> 'winner_team_id')::uuid,
         tournament.created_by
    into v_final_match_id, v_team_a_id, v_team_b_id, v_winner_id, v_author_id
  from public.fixture_stages stage
  join public.fixture_matches fixture on fixture.stage_id = stage.id
  join public.matches match on match.fixture_match_id = fixture.id
  join public.tournaments tournament on tournament.id = stage.tournament_id
  where stage.tournament_id = p_tournament_id
    and stage.type = 'KNOCKOUT'
    and fixture.status in ('COMPLETED', 'WALKOVER')
    and match.status = 'COMPLETED'
    and coalesce(fixture.round_id, '') not ilike '%3RD_PLACE%'
  order by stage.stage_order desc, fixture.round desc, match.updated_at desc
  limit 1;

  if v_final_match_id is null or v_winner_id is null
     or v_winner_id not in (v_team_a_id, v_team_b_id) then
    return;
  end if;

  v_runner_up_id := case when v_winner_id = v_team_a_id then v_team_b_id else v_team_a_id end;
  if v_runner_up_id is null then return; end if;

  select name into v_winner_name from public.teams where id = v_winner_id;
  select name into v_runner_up_name from public.teams where id = v_runner_up_id;

  insert into public.match_moments (
    tournament_id, match_id, author_id, caption, pinned_at, system_type, featured_team_id
  ) values (
    p_tournament_id, v_final_match_id, v_author_id,
    v_winner_name || ' are the tournament champions!', now(),
    'TOURNAMENT_CHAMPION', v_winner_id
  ), (
    p_tournament_id, v_final_match_id, v_author_id,
    v_runner_up_name || ' finish as tournament runners-up.', now(),
    'TOURNAMENT_RUNNER_UP', v_runner_up_id
  )
  on conflict (tournament_id, system_type) where system_type is not null do nothing;
end;
$$;

revoke all on function app_private.create_tournament_result_moments(uuid) from public, anon, authenticated;

create or replace function app_private.on_knockout_stage_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.create_tournament_result_moments(new.tournament_id);
  return new;
end;
$$;

create trigger fixture_stage_create_result_moments
after update of status on public.fixture_stages
for each row
when (
  new.type = 'KNOCKOUT'
  and new.status = 'COMPLETED'
  and old.status is distinct from new.status
)
execute function app_private.on_knockout_stage_completed();

-- Populate already-completed tournaments when this migration is installed.
do $$
declare v_tournament_id uuid;
begin
  for v_tournament_id in
    select distinct tournament_id
    from public.fixture_stages
    where type = 'KNOCKOUT' and status = 'COMPLETED'
  loop
    perform app_private.create_tournament_result_moments(v_tournament_id);
  end loop;
end;
$$;
