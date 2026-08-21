-- Record completed web/native release validation without widening rollout.
update public.sport_rollout_plans plan set
  validated_web = true,
  validated_native = true,
  current_stage = coalesce((
    select flag.rollout_percentage from public.sport_feature_flags flag
    where flag.feature_key = plan.feature_key and (flag.sport_id = plan.sport_id or flag.sport_id is null)
    order by (flag.sport_id is not null) desc limit 1
  ), 0),
  updated_at = now();

update public.sport_feature_flags set
  owner_label = coalesce(owner_label, 'SportStage platform'),
  monitoring_signal = coalesce(monitoring_signal, case feature_key
    when 'offline_scoring' then 'sync conflicts and p95 scoring latency'
    when 'public_live' then 'feed freshness and public endpoint error rate'
    when 'follows_and_insights' then 'feed error rate and notification delivery rate'
    else 'command failure and authorization-denial rate' end),
  rollback_procedure = coalesce(rollback_procedure, 'Disable the flag and set rollout percentage to zero; preserve authoritative data for recovery.'),
  updated_at = now()
where feature_key in ('cloud_competitions', 'offline_scoring', 'public_live', 'follows_and_insights');

-- Result corrections must rebuild the parent tie before standings consume it.
create or replace function app_private.recalculate_sport_team_tie_state(p_fixture_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture public.sport_fixtures%rowtype;
  wins_a integer;
  wins_b integer;
  completed_count integer;
  rubber_count integer;
  threshold integer;
  winner uuid;
begin
  select * into fixture from public.sport_fixtures where id = p_fixture_id for update;
  if not found then
    raise exception 'Team tie was not found';
  end if;

  select
    count(*) filter (where winner_entry_id = fixture.entrant_a_id),
    count(*) filter (where winner_entry_id = fixture.entrant_b_id),
    count(*)
  into wins_a, wins_b, completed_count
  from public.sport_fixture_match_results
  where fixture_id = fixture.id and status = 'COMPLETED';

  select count(*) into rubber_count
  from public.sport_fixture_matches
  where fixture_id = fixture.id;

  threshold := floor(rubber_count / 2.0)::integer + 1;
  winner := case
    when wins_a >= threshold then fixture.entrant_a_id
    when wins_b >= threshold then fixture.entrant_b_id
    else null
  end;

  update public.sport_team_tie_states set
    winner_entry_id = winner,
    clinched_at = case
      when winner is not null then coalesce(clinched_at, now())
      else null
    end,
    status = case
      when completed_count = rubber_count then 'COMPLETED'
      when winner is not null then 'CLINCHED'
      else 'IN_PROGRESS'
    end,
    updated_at = now()
  where fixture_id = fixture.id;
end;
$$;

create or replace function app_private.correct_sport_scoring_result(
  p_scoring_match_id uuid,
  p_winner_entry_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.sport_scoring_matches%rowtype;
  previous_winner uuid;
  tie_fixture_id uuid;
begin
  select * into match
  from public.sport_scoring_matches
  where id = p_scoring_match_id
  for update;

  if not found or not app_private.can_score_sport_scoring_match(match.id) then
    raise exception 'Only an assigned official or competition manager can correct this result';
  end if;
  if match.status <> 'COMPLETED'
    or p_winner_entry_id not in (match.entrant_a_id, match.entrant_b_id)
    or nullif(trim(p_reason), '') is null then
    raise exception 'A completed match, valid winner, and correction reason are required';
  end if;

  if match.fixture_match_id is null then
    select winner_entry_id into previous_winner
    from public.sport_fixture_results
    where scoring_match_id = match.id;
  else
    select winner_entry_id, fixture_id into previous_winner, tie_fixture_id
    from public.sport_fixture_match_results
    where fixture_match_id = match.fixture_match_id;
  end if;

  insert into public.sport_result_revisions(
    scoring_match_id,
    previous_winner_entry_id,
    revised_winner_entry_id,
    reason,
    revised_by
  ) values (
    match.id,
    previous_winner,
    p_winner_entry_id,
    trim(p_reason),
    (select auth.uid())
  );

  if match.fixture_match_id is null then
    update public.sport_fixture_results
    set winner_entry_id = p_winner_entry_id
    where scoring_match_id = match.id;
  else
    update public.sport_fixture_match_results set
      winner_entry_id = p_winner_entry_id,
      recorded_by = (select auth.uid()),
      recorded_at = now(),
      reason = trim(p_reason)
    where fixture_match_id = match.fixture_match_id;
    perform app_private.recalculate_sport_team_tie_state(tie_fixture_id);
  end if;

  perform app_private.rebuild_sport_competition_projections(match.competition_id);
  perform app_private.rebuild_sport_player_statistics(match.competition_id);
  return jsonb_build_object(
    'previous_winner_entry_id', previous_winner,
    'winner_entry_id', p_winner_entry_id
  );
end;
$$;

revoke all on function app_private.recalculate_sport_team_tie_state(uuid) from public, anon, authenticated;
