begin;

do $$
declare
  target_account constant uuid := 'e9b888ec-f819-4ae1-b6af-914b8613ca4e';
  marker constant text := 'non_cricket_demo_2026_v1';
  marker_label constant text := '[SportStage demo:non_cricket_demo_2026_v1]';
  sport_row record;
  competition_def record;
  target_profile uuid;
  profile_ids uuid[];
  account_ids uuid[];
  v_club_id uuid;
  club_membership_ids uuid[];
  team_ids uuid[];
  v_competition_id uuid;
  v_stage_id uuid;
  v_venue_id uuid;
  entry_ids uuid[];
  v_fixture_id uuid;
  v_scoring_match_id uuid;
  rules jsonb;
  match_status text;
  point_total integer;
  point_index integer;
  item_index integer;
  fixture_index integer;
  entrant_a_index integer;
  entrant_b_index integer;
  player_a_index integer;
  player_b_index integer;
  player_name text;
  score_label text;
begin
  if not exists (select 1 from public.profiles where id = target_account) then
    raise exception 'Target production account was not found';
  end if;
  if (select count(*) from public.sport_profiles profile join public.sports sport on sport.id = profile.sport_id
      where profile.account_id = target_account and profile.status = 'ACTIVE'
        and sport.code in ('TENNIS','BADMINTON','PADEL','TABLE_TENNIS','PICKLEBALL')) <> 5 then
    raise exception 'Target account needs active profiles for all five non-cricket sports';
  end if;

  -- Idempotent replacement of this batch only.
  create temporary table _old_demo_competitions(id uuid primary key) on commit drop;
  create temporary table _old_demo_matches(id uuid primary key) on commit drop;
  create temporary table _old_demo_clubs(id uuid primary key) on commit drop;
  create temporary table _old_demo_fixtures(id uuid primary key) on commit drop;
  create temporary table _old_demo_accounts(id uuid primary key) on commit drop;
  insert into _old_demo_accounts select id from auth.users where raw_app_meta_data ->> 'mock_seed_batch' = marker;
  insert into _old_demo_competitions
  select id from public.sport_competitions
  where owner_account_id = target_account
    and (rules ->> 'mock_seed_batch' = marker or description like '%' || marker_label || '%');
  insert into _old_demo_matches
    select distinct match.id from public.sport_scoring_matches match
    left join public.sport_scoring_match_players player on player.scoring_match_id = match.id
    where (match.created_by = target_account and match.rules_snapshot ->> 'mock_seed_batch' = marker)
       or player.account_id in (select id from _old_demo_accounts);
  insert into _old_demo_clubs select id from public.sport_clubs where owner_account_id = target_account and short_name = 'SSD1';
  insert into _old_demo_fixtures select fixture.id from public.sport_fixtures fixture where fixture.competition_id in (select id from _old_demo_competitions);
  delete from public.sport_notifications where resource_id in (select id from _old_demo_competitions) or resource_id in (select id from _old_demo_matches) or account_id in (select id from _old_demo_accounts);
  delete from public.sport_follows where resource_id in (select id from _old_demo_competitions) or resource_id in (select id from _old_demo_matches) or account_id in (select id from _old_demo_accounts);
  delete from public.sport_operational_events where resource_id in (select id from _old_demo_competitions) or resource_id in (select id from _old_demo_matches) or actor_account_id in (select id from _old_demo_accounts);
  delete from public.sport_audit_events where resource_id in (select id from _old_demo_competitions) or resource_id in (select id from _old_demo_fixtures) or actor_account_id in (select id from _old_demo_accounts) or payload ->> 'mock_seed_batch' = marker;
  delete from public.sportstage_upcoming_snapshots snapshot where snapshot.competition_id in (select id from _old_demo_competitions) or snapshot.source_id in (select id from _old_demo_fixtures);
  delete from public.sport_public_live_snapshots snapshot where snapshot.scoring_match_id in (select id from _old_demo_matches);
  delete from public.sport_fixture_results result where result.competition_id in (select id from _old_demo_competitions) or result.scoring_match_id in (select id from _old_demo_matches);
  delete from public.sport_fixture_match_results result where result.competition_id in (select id from _old_demo_competitions);
  delete from public.sport_scoring_matches where id in (select id from _old_demo_matches);
  delete from public.sport_competitions where id in (select id from _old_demo_competitions);
  delete from public.sport_team_memberships
  where team_id in (select team.id from public.sport_teams team where team.club_id in (select id from _old_demo_clubs));
  delete from public.sport_clubs where id in (select id from _old_demo_clubs);

  create temporary table _demo_people(id uuid primary key, display_name text not null, ordinal integer not null) on commit drop;
  insert into _demo_people values
    ('2d000000-0000-4000-8000-000000000001', 'Aanya Rao', 1),
    ('2d000000-0000-4000-8000-000000000002', 'Kabir Mehta', 2),
    ('2d000000-0000-4000-8000-000000000003', 'Meera Nair', 3),
    ('2d000000-0000-4000-8000-000000000004', 'Arjun Kapoor', 4),
    ('2d000000-0000-4000-8000-000000000005', 'Diya Sharma', 5),
    ('2d000000-0000-4000-8000-000000000006', 'Rohan Singh', 6),
    ('2d000000-0000-4000-8000-000000000007', 'Kavya Patel', 7),
    ('2d000000-0000-4000-8000-000000000008', 'Ishaan Gupta', 8);

  insert into auth.users(
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
  )
  select target.instance_id, person.id, 'authenticated', 'authenticated',
    format('sportstage.demo.%s@example.invalid', lpad(person.ordinal::text, 2, '0')),
    null, now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'mock_seed_batch', marker),
    jsonb_build_object('display_name', person.display_name, 'mock_seed_batch', marker),
    now(), now(), false, false
  from _demo_people person cross join auth.users target
  where target.id = target_account
  on conflict (id) do update set
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now();

  insert into public.profiles(id, display_name, onboarding_status, onboarding_completed_at)
  select id, display_name, 'COMPLETED', now() from _demo_people
  on conflict (id) do update set display_name = excluded.display_name, onboarding_status = 'COMPLETED';

  insert into public.account_sports(account_id, sport_id, access_status, is_primary)
  select person.id, sport.id, 'ACTIVE', sport.code = 'TENNIS'
  from _demo_people person cross join public.sports sport
  where sport.code in ('TENNIS','BADMINTON','PADEL','TABLE_TENNIS','PICKLEBALL')
  on conflict (account_id, sport_id) do update set access_status = 'ACTIVE';

  update public.profiles profile
  set primary_sport_id = sport.id
  from public.sports sport
  where profile.id in (select id from _demo_people) and sport.code = 'TENNIS';

  insert into public.sport_profiles(account_id, sport_id, display_name, status)
  select person.id, sport.id, person.display_name, 'ACTIVE'
  from _demo_people person cross join public.sports sport
  where sport.code in ('TENNIS','BADMINTON','PADEL','TABLE_TENNIS','PICKLEBALL')
  on conflict (account_id, sport_id) do update set display_name = excluded.display_name, status = 'ACTIVE';

  for sport_row in
    select id, code, name from public.sports
    where code in ('TENNIS','BADMINTON','PADEL','TABLE_TENNIS','PICKLEBALL')
    order by display_order
  loop
    select id into target_profile from public.sport_profiles
    where account_id = target_account and sport_id = sport_row.id and status = 'ACTIVE';
    select array[target_profile] || array_agg(profile.id order by person.ordinal),
           array[target_account] || array_agg(person.id order by person.ordinal)
      into profile_ids, account_ids
    from _demo_people person
    join public.sport_profiles profile on profile.account_id = person.id and profile.sport_id = sport_row.id;

    rules := case sport_row.code
      when 'TENNIS' then '{"matchUnitsToWin":1,"noAd":false,"setTiebreak":true,"setCap":7,"tieBreakPoints":7}'::jsonb
      when 'PADEL' then '{"matchUnitsToWin":1,"goldenPoint":false,"setTiebreak":true,"setCap":7,"tieBreakPoints":7}'::jsonb
      when 'PICKLEBALL' then '{"matchUnitsToWin":1,"rallyScoring":true,"gamePointTarget":11}'::jsonb
      else '{"matchUnitsToWin":1}'::jsonb
    end;

    insert into public.sport_clubs(sport_id, name, short_name, visibility, owner_account_id)
    values (sport_row.id, 'SportStage Demo ' || sport_row.name || ' Club', 'SSD1', 'PUBLIC', target_account)
    returning id into v_club_id;
    insert into public.sport_club_access(club_id, account_id, role, status, granted_by, accepted_at)
    values (v_club_id, account_ids[2], 'MANAGER', 'ACTIVE', target_account, now());

    club_membership_ids := array[]::uuid[];
    for item_index in 1..8 loop
      insert into public.sport_club_memberships(
        club_id, sport_profile_id, status, display_name_snapshot, invited_by, accepted_at
      ) values (
        v_club_id, profile_ids[item_index], 'ACTIVE',
        (select display_name from public.sport_profiles where id = profile_ids[item_index]),
        target_account, now()
      ) returning id into v_fixture_id;
      club_membership_ids := array_append(club_membership_ids, v_fixture_id);
    end loop;

    team_ids := array[]::uuid[];
    for item_index in 1..4 loop
      insert into public.sport_teams(club_id, name, short_name, color_hex, owner_account_id)
      values (v_club_id, sport_row.name || ' Demo Team ' || item_index, 'D' || item_index,
        (array['#F5B700','#17C3B2','#FF5A5F','#7B61FF'])[item_index], target_account)
      returning id into v_fixture_id;
      team_ids := array_append(team_ids, v_fixture_id);
      insert into public.sport_team_memberships(team_id, sport_profile_id, club_membership_id, status, display_name_snapshot, invited_by, accepted_at, eligibility)
      values
        (v_fixture_id, profile_ids[item_index * 2 - 1], club_membership_ids[item_index * 2 - 1], 'ACTIVE',
          (select display_name from public.sport_profiles where id = profile_ids[item_index * 2 - 1]), target_account, now(), '["SINGLES","DOUBLES"]'),
        (v_fixture_id, profile_ids[item_index * 2], club_membership_ids[item_index * 2], 'ACTIVE',
          (select display_name from public.sport_profiles where id = profile_ids[item_index * 2]), target_account, now(), '["SINGLES","DOUBLES"]');
    end loop;

    for competition_def in
      select * from (values
        ('TOURNAMENT'::public.sport_competition_kind, 'LIVE'::public.sport_competition_lifecycle, 'City Open', -2, 2),
        ('TOURNAMENT'::public.sport_competition_kind, 'COMPLETED'::public.sport_competition_lifecycle, 'Masters Cup', -30, -24),
        ('LEAGUE'::public.sport_competition_kind, 'REGISTRATION_OPEN'::public.sport_competition_lifecycle, 'Community League', 7, 42)
      ) definition(kind, lifecycle, suffix, starts_in_days, ends_in_days)
    loop
      insert into public.sport_competitions(
        sport_id, kind, name, description, visibility, lifecycle, owner_account_id, timezone,
        starts_at, ends_at, registration_opens_at, registration_closes_at,
        registration_locked_at, published_at, completed_at, match_format, rules,
        organizer_phone, social_media_url, planned_entry_count
      ) values (
        sport_row.id, competition_def.kind, sport_row.name || ' Demo ' || competition_def.suffix,
        'A complete SportStage showcase covering entrants, fixtures, results, statistics and live scoring.',
        'PUBLIC', competition_def.lifecycle, target_account, 'Asia/Calcutta',
        now() + make_interval(days => competition_def.starts_in_days),
        now() + make_interval(days => competition_def.ends_in_days),
        now() - interval '14 days', now() + interval '5 days',
        case when competition_def.lifecycle in ('LIVE','COMPLETED') then now() - interval '3 days' end,
        case when competition_def.lifecycle in ('LIVE','COMPLETED') then now() - interval '2 days' end,
        case when competition_def.lifecycle = 'COMPLETED' then now() - interval '24 days' end,
        'SINGLES', rules || jsonb_build_object('mock_seed_batch', marker), '+919810000001', 'https://www.instagram.com/sportstageapp', 4
      ) returning id into v_competition_id;

      update public.sport_competition_points_rules points_rule
      set updated_by = target_account where points_rule.competition_id = v_competition_id;
      insert into public.sport_competition_divisions(competition_id, division_key, name, display_order, registration_capacity)
      values (v_competition_id, 'OPEN', 'Open', 0, 16);
      insert into public.sport_competition_stages(competition_id, name, kind, display_order, settings)
      values (v_competition_id, case when competition_def.kind = 'LEAGUE' then 'Round robin' else 'Main draw' end,
        (case when competition_def.kind = 'LEAGUE' then 'ROUND_ROBIN' else 'KNOCKOUT' end)::public.sport_stage_kind, 0,
        jsonb_build_object('mock_seed_batch', marker)) returning id into v_stage_id;
      insert into public.sport_competition_venues(
        competition_id, name, address, court_count, display_order, latitude, longitude, google_maps_url
      ) values (
        v_competition_id, 'SportStage Arena', 'Sector 21 Sports Complex, Gurugram', 4, 0,
        28.4595, 77.0266, 'https://maps.google.com/?q=28.4595,77.0266'
      ) returning id into v_venue_id;
      insert into public.sport_competition_access(competition_id, account_id, role, status, granted_by, accepted_at)
      values (v_competition_id, account_ids[2], 'ORGANIZER', 'ACTIVE', target_account, now());

      entry_ids := array[]::uuid[];
      for item_index in 1..4 loop
        insert into public.sport_competition_entries(
          competition_id, entry_kind, division_key, status, seed, accepted_at, approved_at, snapshot
        ) values (
          v_competition_id, (case when competition_def.kind = 'LEAGUE' then 'PLAYER' else 'SQUAD' end)::public.sport_entry_kind,
          'OPEN', 'APPROVED', item_index, now() - interval '10 days', now() - interval '9 days',
          jsonb_build_object('name', case when competition_def.kind = 'LEAGUE'
            then (select display_name from public.sport_profiles where id = profile_ids[item_index])
            else sport_row.name || ' Demo Team ' || item_index end, 'mock_seed_batch', marker)
        ) returning id into v_fixture_id;
        entry_ids := array_append(entry_ids, v_fixture_id);
        if competition_def.kind = 'LEAGUE' then
          insert into public.sport_league_players(entry_id, competition_id, division_key, sport_profile_id, display_name_snapshot, eligibility)
          values (v_fixture_id, v_competition_id, 'OPEN', profile_ids[item_index],
            (select display_name from public.sport_profiles where id = profile_ids[item_index]), '["SINGLES"]');
        else
          insert into public.sport_tournament_squads(
            entry_id, competition_id, division_key, source_team_id, name_snapshot, short_name_snapshot, captain_account_id, roster_locked_at
          ) values (v_fixture_id, v_competition_id, 'OPEN', team_ids[item_index], sport_row.name || ' Demo Team ' || item_index,
            'D' || item_index, account_ids[item_index * 2 - 1], case when competition_def.lifecycle in ('LIVE','COMPLETED') then now() - interval '3 days' end);
          insert into public.sport_squad_members(
            squad_entry_id, sport_profile_id, display_name_snapshot, eligibility, status, accepted_at, approved_at
          ) values
            (v_fixture_id, profile_ids[item_index * 2 - 1], (select display_name from public.sport_profiles where id = profile_ids[item_index * 2 - 1]), '["SINGLES","DOUBLES"]', 'APPROVED', now() - interval '8 days', now() - interval '7 days'),
            (v_fixture_id, profile_ids[item_index * 2], (select display_name from public.sport_profiles where id = profile_ids[item_index * 2]), '["SINGLES","DOUBLES"]', 'APPROVED', now() - interval '8 days', now() - interval '7 days');
        end if;
      end loop;

      insert into public.sport_competition_standings(
        competition_id, entry_id, points_rule_version, played, won, drawn, lost, points, rubbers_won, rubbers_lost, rank
      ) select v_competition_id, entry_ids[standing_index], 1,
        case when competition_def.lifecycle = 'REGISTRATION_OPEN' then 0 else 3 end,
        case when competition_def.lifecycle = 'REGISTRATION_OPEN' then 0 else greatest(0, 4 - standing_index) end,
        0,
        case when competition_def.lifecycle = 'REGISTRATION_OPEN' then 0 else greatest(0, standing_index - 1) end,
        case when competition_def.lifecycle = 'REGISTRATION_OPEN' then 0 else greatest(0, 4 - standing_index) * 2 end,
        case when competition_def.lifecycle = 'REGISTRATION_OPEN' then 0 else 5 - standing_index end,
        case when competition_def.lifecycle = 'REGISTRATION_OPEN' then 0 else standing_index - 1 end,
        standing_index
      from generate_series(1, 4) standing_index;

      for fixture_index in 1..3 loop
        entrant_a_index := (array[1,3,1])[fixture_index];
        entrant_b_index := (array[2,4,3])[fixture_index];
        insert into public.sport_fixtures(
          competition_id, stage_id, division_key, entrant_a_id, entrant_b_id, venue_id, court,
          scheduled_at, duration_minutes, display_order, status, idempotency_key, created_by,
          check_in_opens_at, check_in_closes_at, idempotency_fingerprint
        ) values (
          v_competition_id, v_stage_id, 'OPEN', entry_ids[entrant_a_index], entry_ids[entrant_b_index], v_venue_id,
          'Court ' || fixture_index,
          now() + make_interval(days => competition_def.starts_in_days + fixture_index - 1), 90, fixture_index - 1,
          'SCHEDULED', marker || ':' || v_competition_id || ':' || fixture_index, target_account,
          now() - interval '30 minutes', now() + interval '30 minutes', marker || ':' || fixture_index
        ) returning id into v_fixture_id;

        if competition_def.lifecycle = 'LIVE' and fixture_index = 1 then
          insert into public.sport_fixture_check_ins(fixture_id, competition_id, entry_id, status, checked_at, checked_by)
          values
            (v_fixture_id, v_competition_id, entry_ids[entrant_a_index], 'CHECKED_IN', now() - interval '20 minutes', target_account),
            (v_fixture_id, v_competition_id, entry_ids[entrant_b_index], 'CHECKED_IN', now() - interval '18 minutes', target_account);
        end if;

        if fixture_index = 1 then
          insert into public.sport_fixture_officials(
            fixture_id, competition_id, account_id, display_name_snapshot, role, assigned_by
          ) values (
            v_fixture_id, v_competition_id, account_ids[9],
            (select display_name from public.sport_profiles where id = profile_ids[9]),
            case when competition_def.kind = 'LEAGUE' then 'REFEREE' else 'SCOREKEEPER' end,
            target_account
          );
        end if;

        if competition_def.lifecycle in ('LIVE','COMPLETED') and fixture_index <= 2 then
          player_a_index := case when competition_def.kind = 'TOURNAMENT' then entrant_a_index * 2 - 1 else entrant_a_index end;
          player_b_index := case when competition_def.kind = 'TOURNAMENT' then entrant_b_index * 2 - 1 else entrant_b_index end;
          match_status := case when competition_def.lifecycle = 'COMPLETED' then 'COMPLETED'
            when fixture_index = 1 then 'LIVE' else 'SCHEDULED' end;
          insert into public.sport_scoring_matches(
            sport_id, competition_id, fixture_id, entrant_a_id, entrant_b_id, match_format,
            side_a_players, side_b_players, rules_snapshot, status, current_sequence,
            completed_at, completed_by, created_by, created_at, updated_at
          ) values (
            sport_row.id, v_competition_id, v_fixture_id, entry_ids[entrant_a_index], entry_ids[entrant_b_index], 'SINGLES',
            jsonb_build_array(case when competition_def.kind = 'LEAGUE' then
              (select display_name from public.sport_profiles where id = profile_ids[entrant_a_index])
              else sport_row.name || ' Demo Team ' || entrant_a_index end),
            jsonb_build_array(case when competition_def.kind = 'LEAGUE' then
              (select display_name from public.sport_profiles where id = profile_ids[entrant_b_index])
              else sport_row.name || ' Demo Team ' || entrant_b_index end),
            jsonb_build_object('initial_server', 0, 'options', rules, 'mock_seed_batch', marker),
            match_status, 0, case when match_status = 'COMPLETED' then now() - interval '24 days' end,
            case when match_status = 'COMPLETED' then target_account end, target_account,
            now() - interval '40 minutes', now() - interval '2 minutes'
          ) returning id into v_scoring_match_id;

          insert into public.sport_scoring_match_players(scoring_match_id, side, player_order, sport_profile_id, account_id, display_name_snapshot)
          values
            (v_scoring_match_id, 0, 0, profile_ids[player_a_index], account_ids[player_a_index],
              (select display_name from public.sport_profiles where id = profile_ids[player_a_index])),
            (v_scoring_match_id, 1, 0, profile_ids[player_b_index], account_ids[player_b_index],
              (select display_name from public.sport_profiles where id = profile_ids[player_b_index]));

          if match_status in ('LIVE','COMPLETED') then
            point_total := case when match_status = 'LIVE' then 9 when sport_row.code in ('TENNIS','PADEL') then 24 when sport_row.code = 'BADMINTON' then 21 else 11 end;
            for point_index in 1..point_total loop
              score_label := case
                when sport_row.code in ('TENNIS','PADEL') then floor(point_index / 4.0)::int || '-0 · ' ||
                  (array['15-Love','30-Love','40-Love','Game'])[((point_index - 1) % 4) + 1]
                else point_index || '-0'
              end;
              insert into public.sport_scoring_events(
                scoring_match_id, sequence, client_event_id, kind, payload, created_by, created_at
              ) values (
                v_scoring_match_id, point_index, gen_random_uuid(), 'POINT',
                jsonb_build_object(
                  'winner', case when match_status = 'LIVE' and point_index % 4 = 0 then 1 else 0 end,
                  'point_type', case
                    when sport_row.code in ('TENNIS','PADEL') and point_index % 5 = 1 then 'ACE'
                    when sport_row.code = 'BADMINTON' and point_index % 5 = 1 then 'SMASH_WINNER'
                    when sport_row.code = 'TABLE_TENNIS' and point_index % 5 = 1 then 'SERVICE_WINNER'
                    when sport_row.code = 'PICKLEBALL' and point_index % 5 = 1 then 'FORCED_ERROR'
                    when point_index % 5 = 2 then 'UNFORCED_ERROR'
                    else 'RALLY_WINNER' end,
                  'headline_score', score_label
                ), target_account, now() - make_interval(secs => (point_total - point_index) * 18)
              );
            end loop;
            update public.sport_scoring_matches set current_sequence = point_total, updated_at = now() where id = v_scoring_match_id;
            if match_status = 'COMPLETED' then
              insert into public.sport_scoring_events(scoring_match_id, sequence, client_event_id, kind, payload, created_by, created_at)
              values (v_scoring_match_id, point_total + 1, gen_random_uuid(), 'COMPLETED',
                jsonb_build_object('winner_side', 0, 'winner_entry_id', entry_ids[entrant_a_index], 'headline_score', '1-0'),
                target_account, now());
              update public.sport_scoring_matches set current_sequence = point_total + 1 where id = v_scoring_match_id;
              insert into public.sport_fixture_results(fixture_id, competition_id, winner_entry_id, scoring_match_id, completed_at)
              values (v_fixture_id, v_competition_id, entry_ids[entrant_a_index], v_scoring_match_id, now() - interval '24 days');
            end if;
            perform app_private.refresh_sport_public_live_snapshot(v_scoring_match_id);
          end if;
        end if;
      end loop;

      insert into public.sport_player_statistics(
        sport_profile_id, sport_id, competition_id, match_format, opponent_profile_id, period_start,
        matches_played, wins, losses, retirements, walkovers, display_name_snapshot
      ) select profile_ids[stat_index], sport_row.id, v_competition_id, 'SINGLES',
        profile_ids[case when stat_index = 1 then 2 else 1 end], current_date - 30,
        case when competition_def.lifecycle = 'REGISTRATION_OPEN' then 0 else 3 end,
        case when competition_def.lifecycle = 'REGISTRATION_OPEN' then 0 else greatest(0, 4 - stat_index) end,
        case when competition_def.lifecycle = 'REGISTRATION_OPEN' then 0 else greatest(0, stat_index - 1) end,
        0, 0, (select display_name from public.sport_profiles where id = profile_ids[stat_index])
      from generate_series(1, 4) stat_index;
    end loop;

    -- Account-backed friendlies per sport: live singles, completed singles, scheduled doubles.
    for item_index in 1..3 loop
      match_status := case when item_index = 1 then 'LIVE' when item_index = 2 then 'COMPLETED' else 'SCHEDULED' end;
      insert into public.sport_scoring_matches(
        sport_id, match_format, side_a_players, side_b_players, rules_snapshot, status,
        current_sequence, completed_at, completed_by, created_by, created_at, updated_at
      ) values (
        sport_row.id, case when item_index = 3 then 'DOUBLES' else 'SINGLES' end,
        case when item_index = 3 then jsonb_build_array('Varun Vaidya', (select display_name from public.sport_profiles where id = profile_ids[2])) else jsonb_build_array('Varun Vaidya') end,
        case when item_index = 3 then jsonb_build_array(
          (select display_name from public.sport_profiles where id = profile_ids[3]),
          (select display_name from public.sport_profiles where id = profile_ids[4])
        ) else jsonb_build_array((select display_name from public.sport_profiles where id = profile_ids[item_index + 1])) end,
        jsonb_build_object('initial_server', 0, 'options', rules, 'mock_seed_batch', marker, 'demo_kind', 'FRIENDLY'),
        match_status, 0, case when match_status = 'COMPLETED' then now() - interval '2 days' end,
        case when match_status = 'COMPLETED' then target_account end, target_account,
        now() - make_interval(days => item_index), now() - interval '1 minute'
      ) returning id into v_scoring_match_id;
      insert into public.sport_scoring_match_players(scoring_match_id, side, player_order, sport_profile_id, account_id, display_name_snapshot)
      values
        (v_scoring_match_id, 0, 0, target_profile, target_account, 'Varun Vaidya'),
        (v_scoring_match_id, 1, 0, profile_ids[case when item_index = 3 then 3 else item_index + 1 end], account_ids[case when item_index = 3 then 3 else item_index + 1 end],
          (select display_name from public.sport_profiles where id = profile_ids[case when item_index = 3 then 3 else item_index + 1 end]));
      if item_index = 3 then
        insert into public.sport_scoring_match_players(scoring_match_id, side, player_order, sport_profile_id, account_id, display_name_snapshot)
        values
          (v_scoring_match_id, 0, 1, profile_ids[2], account_ids[2], (select display_name from public.sport_profiles where id = profile_ids[2])),
          (v_scoring_match_id, 1, 1, profile_ids[4], account_ids[4], (select display_name from public.sport_profiles where id = profile_ids[4]));
      end if;
      point_total := 0;
      if match_status in ('LIVE','COMPLETED') then
        point_total := case when match_status = 'LIVE' then 7 when sport_row.code in ('TENNIS','PADEL') then 24 when sport_row.code = 'BADMINTON' then 21 else 11 end;
        for point_index in 1..point_total loop
          insert into public.sport_scoring_events(scoring_match_id, sequence, client_event_id, kind, payload, created_by, created_at)
          values (v_scoring_match_id, point_index, gen_random_uuid(), 'POINT',
            jsonb_build_object('winner', case when match_status = 'LIVE' and point_index % 3 = 0 then 1 else 0 end,
              'point_type', case when point_index % 4 = 1 then 'SERVICE_WINNER' when point_index % 4 = 2 then 'UNFORCED_ERROR' else 'RALLY_WINNER' end,
              'headline_score', case when sport_row.code in ('TENNIS','PADEL') then '0-0 · 40-30' else point_index || '-0' end),
            target_account, now() - make_interval(secs => (point_total - point_index) * 15));
        end loop;
        if match_status = 'COMPLETED' then
          insert into public.sport_scoring_events(scoring_match_id, sequence, client_event_id, kind, payload, created_by)
          values (v_scoring_match_id, point_total + 1, gen_random_uuid(), 'COMPLETED',
            jsonb_build_object('winner_side', 0, 'headline_score', '1-0'), target_account);
          point_total := point_total + 1;
        end if;
      end if;
      update public.sport_scoring_matches set current_sequence = point_total, updated_at = now() where id = v_scoring_match_id;
      perform app_private.refresh_sport_public_live_snapshot(v_scoring_match_id);
    end loop;
  end loop;
end
$$;

select jsonb_build_object(
  'batch', 'non_cricket_demo_2026_v1',
  'mock_accounts', (select count(*) from auth.users where raw_app_meta_data ->> 'mock_seed_batch' = 'non_cricket_demo_2026_v1'),
  'sport_profiles', (select count(*) from public.sport_profiles where account_id in (select id from auth.users where raw_app_meta_data ->> 'mock_seed_batch' = 'non_cricket_demo_2026_v1')),
  'competitions', (select count(*) from public.sport_competitions where rules ->> 'mock_seed_batch' = 'non_cricket_demo_2026_v1'),
  'matches', (select count(*) from public.sport_scoring_matches where rules_snapshot ->> 'mock_seed_batch' = 'non_cricket_demo_2026_v1'),
  'events', (select count(*) from public.sport_scoring_events where scoring_match_id in (select id from public.sport_scoring_matches where rules_snapshot ->> 'mock_seed_batch' = 'non_cricket_demo_2026_v1'))
) as seed_result;

commit;
