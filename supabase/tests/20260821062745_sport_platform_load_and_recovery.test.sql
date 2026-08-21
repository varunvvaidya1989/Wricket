begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local statement_timeout = '30s';

select plan(8);

create temporary table sport_discovery_load_metrics (
  duration_ms double precision not null
) on commit drop;

do $$
declare
  started_at timestamptz;
  request_number integer;
begin
  for request_number in 1..200 loop
    started_at := clock_timestamp();
    perform count(*)
    from public.discover_sport_public_live(
      'release-load-' || request_number::text || '-' || gen_random_uuid()::text,
      20,
      null
    );
    insert into sport_discovery_load_metrics(duration_ms)
    values (extract(epoch from clock_timestamp() - started_at) * 1000);
  end loop;
end;
$$;

select is(
  (select count(*)::integer from sport_discovery_load_metrics),
  200,
  'public discovery completes 200 isolated requests'
);
select cmp_ok(
  (select percentile_cont(0.95) within group (order by duration_ms) from sport_discovery_load_metrics),
  '<',
  250::double precision,
  'public discovery database p95 stays below 250 ms'
);
select cmp_ok(
  (select max(duration_ms) from sport_discovery_load_metrics),
  '<',
  1000::double precision,
  'every public discovery database request stays below 1 second'
);

create temporary table sport_recovery_metrics (
  selected_competition boolean not null,
  first_checksum text,
  second_checksum text,
  first_duration_ms double precision,
  second_duration_ms double precision
) on commit drop;

do $$
declare
  selected_competition public.sport_competitions%rowtype;
  started_at timestamptz;
  first_checksum_value text;
  second_checksum_value text;
  first_duration double precision;
  second_duration double precision;
begin
  select competition.* into selected_competition
  from public.sport_competitions competition
  join public.sport_competition_points_rules rule
    on rule.competition_id = competition.id
  order by competition.created_at
  limit 1;

  if not found then
    insert into sport_recovery_metrics(selected_competition)
    values (false);
    return;
  end if;

  perform set_config('request.jwt.claim.sub', selected_competition.owner_account_id::text, true);

  started_at := clock_timestamp();
  perform app_private.rebuild_sport_competition_projections(selected_competition.id);
  perform app_private.rebuild_sport_player_statistics(selected_competition.id);
  first_duration := extract(epoch from clock_timestamp() - started_at) * 1000;

  select md5(coalesce(jsonb_agg(jsonb_build_object(
    'entry_id', standing.entry_id,
    'points_rule_version', standing.points_rule_version,
    'played', standing.played,
    'won', standing.won,
    'drawn', standing.drawn,
    'lost', standing.lost,
    'points', standing.points,
    'rubbers_won', standing.rubbers_won,
    'rubbers_lost', standing.rubbers_lost,
    'rank', standing.rank
  ) order by standing.entry_id)::text, '[]'))
  into first_checksum_value
  from public.sport_competition_standings standing
  where standing.competition_id = selected_competition.id;

  started_at := clock_timestamp();
  perform app_private.rebuild_sport_competition_projections(selected_competition.id);
  perform app_private.rebuild_sport_player_statistics(selected_competition.id);
  second_duration := extract(epoch from clock_timestamp() - started_at) * 1000;

  select md5(coalesce(jsonb_agg(jsonb_build_object(
    'entry_id', standing.entry_id,
    'points_rule_version', standing.points_rule_version,
    'played', standing.played,
    'won', standing.won,
    'drawn', standing.drawn,
    'lost', standing.lost,
    'points', standing.points,
    'rubbers_won', standing.rubbers_won,
    'rubbers_lost', standing.rubbers_lost,
    'rank', standing.rank
  ) order by standing.entry_id)::text, '[]'))
  into second_checksum_value
  from public.sport_competition_standings standing
  where standing.competition_id = selected_competition.id;

  insert into sport_recovery_metrics(
    selected_competition,
    first_checksum,
    second_checksum,
    first_duration_ms,
    second_duration_ms
  ) values (
    true,
    first_checksum_value,
    second_checksum_value,
    first_duration,
    second_duration
  );
end;
$$;

select ok(
  (select selected_competition from sport_recovery_metrics),
  'linked project provides a points-enabled competition for recovery exercise'
);
select is(
  (select second_checksum from sport_recovery_metrics),
  (select first_checksum from sport_recovery_metrics),
  'two full projection rebuilds produce the same standings checksum'
);
select cmp_ok(
  (select first_duration_ms from sport_recovery_metrics),
  '<',
  5000::double precision,
  'cold projection recovery completes within 5 seconds'
);
select cmp_ok(
  (select second_duration_ms from sport_recovery_metrics),
  '<',
  5000::double precision,
  'repeat projection recovery completes within 5 seconds'
);
select ok(
  not exists (
    select 1 from public.sport_rollout_plans
    where not validated_web or not validated_native
  ),
  'every sport rollout plan records web and native validation'
);

select * from finish();
rollback;
