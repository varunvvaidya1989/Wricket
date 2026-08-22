create or replace function app_private.create_owned_match(
  p_tournament_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_format text,
  p_rules jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default null,
  p_venue text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  match_id_value uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to create a match';
  end if;
  if p_team_a_id is null or p_team_b_id is null or p_team_a_id = p_team_b_id then
    raise exception 'Choose two different teams';
  end if;

  if p_tournament_id is null then
    if not app_private.is_standalone_team_eligible(p_team_a_id, (select auth.uid()))
      or not app_private.is_standalone_team_eligible(p_team_b_id, (select auth.uid())) then
      raise exception 'You can only start a friendly match with eligible teams';
    end if;
  elsif not exists (
    select 1
    from public.tournaments tournament
    where tournament.id = p_tournament_id
      and (
        tournament.created_by = (select auth.uid())
        or exists (
          select 1
          from public.tournament_members member
          where member.tournament_id = tournament.id
            and member.account_id = (select auth.uid())
            and member.role in ('OWNER', 'ADMIN', 'SCORER')
            and member.status = 'ACTIVE'
        )
      )
  ) then
    raise exception 'Only tournament staff can create a tournament match';
  elsif (select count(*) from public.teams team where team.id in (p_team_a_id, p_team_b_id) and team.tournament_id = p_tournament_id) <> 2 then
    raise exception 'Both teams must belong to this tournament';
  end if;

  insert into public.matches(
    tournament_id, team_a_id, team_b_id, format, status, visibility,
    rules, created_by, scheduled_at, venue
  ) values (
    p_tournament_id, p_team_a_id, p_team_b_id, p_format, 'SETUP', 'PRIVATE',
    coalesce(p_rules, '{}'::jsonb), (select auth.uid()), p_scheduled_at, nullif(trim(p_venue), '')
  )
  returning id into match_id_value;

  return match_id_value;
end;
$$;

create or replace function app_private.upsert_owned_fixture_matches(
  p_stage_id uuid,
  p_matches jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_id_value uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to create fixtures';
  end if;
  if jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) = 0 then
    raise exception 'At least one fixture is required';
  end if;

  select stage.tournament_id into tournament_id_value
  from public.fixture_stages stage
  join public.tournaments tournament on tournament.id = stage.tournament_id
  where stage.id = p_stage_id
    and tournament.created_by = (select auth.uid());
  if tournament_id_value is null then
    raise exception 'Only the tournament owner can create fixtures';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_matches) as fixture(
      group_id uuid, team_a_id uuid, team_b_id uuid, round_id text,
      round integer, leg integer, weight numeric, status text,
      score_a integer, score_b integer
    )
    left join public.teams team_a on team_a.id = fixture.team_a_id
    left join public.teams team_b on team_b.id = fixture.team_b_id
    where fixture.team_a_id is null
      or fixture.team_b_id is not null and fixture.team_a_id = fixture.team_b_id
      or team_a.tournament_id is distinct from tournament_id_value
      or fixture.team_b_id is not null and team_b.tournament_id is distinct from tournament_id_value
      or coalesce(fixture.round, 0) < 1
      or coalesce(fixture.leg, 1) < 1
      or coalesce(fixture.status, 'SCHEDULED') not in ('SCHEDULED', 'LIVE', 'COMPLETED', 'WALKOVER')
  ) then
    raise exception 'Fixtures must contain valid tournament teams and match details';
  end if;

  insert into public.fixture_matches(
    stage_id, group_id, round_id, team_a_id, team_b_id,
    round, leg, weight, status, score_a, score_b
  )
  select
    p_stage_id, fixture.group_id, fixture.round_id, fixture.team_a_id, fixture.team_b_id,
    fixture.round, coalesce(fixture.leg, 1), fixture.weight,
    coalesce(fixture.status, 'SCHEDULED'), fixture.score_a, fixture.score_b
  from jsonb_to_recordset(p_matches) as fixture(
    group_id uuid, team_a_id uuid, team_b_id uuid, round_id text,
    round integer, leg integer, weight numeric, status text,
    score_a integer, score_b integer
  )
  on conflict (stage_id, round_id, team_a_id, team_b_id, leg) do nothing;
end;
$$;

create or replace function public.create_owned_match(
  p_tournament_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_format text,
  p_rules jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default null,
  p_venue text default null
)
returns uuid
language sql
security invoker
set search_path = public
as $$
  select app_private.create_owned_match(
    p_tournament_id, p_team_a_id, p_team_b_id, p_format,
    p_rules, p_scheduled_at, p_venue
  );
$$;

create or replace function public.upsert_owned_fixture_matches(
  p_stage_id uuid,
  p_matches jsonb
)
returns void
language sql
security invoker
set search_path = public
as $$ select app_private.upsert_owned_fixture_matches(p_stage_id, p_matches) $$;

revoke all on function app_private.create_owned_match(uuid, uuid, uuid, text, jsonb, timestamptz, text) from public, anon;
revoke all on function app_private.upsert_owned_fixture_matches(uuid, jsonb) from public, anon;
revoke all on function public.create_owned_match(uuid, uuid, uuid, text, jsonb, timestamptz, text) from public, anon;
revoke all on function public.upsert_owned_fixture_matches(uuid, jsonb) from public, anon;
grant execute on function app_private.create_owned_match(uuid, uuid, uuid, text, jsonb, timestamptz, text) to authenticated;
grant execute on function app_private.upsert_owned_fixture_matches(uuid, jsonb) to authenticated;
grant execute on function public.create_owned_match(uuid, uuid, uuid, text, jsonb, timestamptz, text) to authenticated;
grant execute on function public.upsert_owned_fixture_matches(uuid, jsonb) to authenticated;
