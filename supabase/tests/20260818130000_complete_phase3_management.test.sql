begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temporary table phase3_completion_tap_output(output text not null) on commit drop;
create temporary table phase3_completion_ids(kind text primary key, id uuid not null) on commit drop;
grant insert, select on phase3_completion_tap_output, phase3_completion_ids to authenticated;
insert into phase3_completion_tap_output(output) select plan(29);

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'f4350000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'phase3-owner@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4350000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'phase3-player-one@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4350000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'phase3-player-two@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4350000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'phase3-player-three@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4350000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'phase3-official@example.invalid', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, display_name) values
  ('f4350000-0000-0000-0000-000000000001', 'Phase Three Owner'),
  ('f4350000-0000-0000-0000-000000000002', 'Phase Three Player One'),
  ('f4350000-0000-0000-0000-000000000003', 'Phase Three Player Two'),
  ('f4350000-0000-0000-0000-000000000004', 'Phase Three Player Three'),
  ('f4350000-0000-0000-0000-000000000005', 'Phase Three Official');
insert into public.account_sports(account_id, sport_id, access_status, is_primary)
select account_id, sport.id, 'ACTIVE', true from unnest(array[
  'f4350000-0000-0000-0000-000000000001'::uuid, 'f4350000-0000-0000-0000-000000000002'::uuid,
  'f4350000-0000-0000-0000-000000000003'::uuid, 'f4350000-0000-0000-0000-000000000004'::uuid,
  'f4350000-0000-0000-0000-000000000005'::uuid
]) account_id cross join public.sports sport where sport.code = 'TENNIS';
insert into phase3_completion_ids(kind, id)
select 'player-one', id from public.sport_profiles where account_id = 'f4350000-0000-0000-0000-000000000002'
union all
select 'player-two', id from public.sport_profiles where account_id = 'f4350000-0000-0000-0000-000000000003'
union all
select 'player-three', id from public.sport_profiles where account_id = 'f4350000-0000-0000-0000-000000000004';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4350000-0000-0000-0000-000000000001', true);
insert into phase3_completion_tap_output(output) select lives_ok($$select public.create_sport_competition(
  'TENNIS', 'LEAGUE', 'Phase Three Completion League', 'SINGLES', null, 'PRIVATE', 'UTC'
)$$, 'an owner can create the completion-test league');
insert into phase3_completion_ids(kind, id) select 'competition', id from public.sport_competitions where name = 'Phase Three Completion League';
insert into phase3_completion_tap_output(output) select lives_ok($$select public.update_sport_competition_resource(
  'DIVISION', (select id from public.sport_competition_divisions where competition_id = (select id from phase3_completion_ids where kind = 'competition')),
  'Open', null, 2
)$$, 'an owner can configure division capacity');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.register_sport_league_player(
  (select id from phase3_completion_ids where kind = 'competition'), (select id from phase3_completion_ids where kind = 'player-one')
)$$, 'the first player occupies a capacity place');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.register_sport_league_player(
  (select id from phase3_completion_ids where kind = 'competition'), (select id from phase3_completion_ids where kind = 'player-two')
)$$, 'the second player fills the division');
insert into phase3_completion_tap_output(output) select throws_ok($$select public.register_sport_league_player(
  (select id from phase3_completion_ids where kind = 'competition'), (select id from phase3_completion_ids where kind = 'player-three')
)$$, 'P0001', 'Division registration capacity has been reached', 'capacity rejects an additional registration');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.set_sport_entry_status(
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player Two'), 'REJECTED'
)$$, 'a rejected entry releases its capacity place');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.register_sport_league_player(
  (select id from phase3_completion_ids where kind = 'competition'), (select id from phase3_completion_ids where kind = 'player-three')
)$$, 'a new player can use a released place');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.set_sport_entry_status(
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player One'), 'APPROVED', 1
)$$, 'the first active entrant can be approved');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.set_sport_entry_status(
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player Three'), 'APPROVED', 2
)$$, 'the replacement entrant can be approved');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.add_sport_competition_stage(
  (select id from phase3_completion_ids where kind = 'competition'), 'Manual order', 'ROUND_ROBIN', 0
)$$, 'the owner can add a manual stage');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.schedule_sport_fixture(
  (select id from phase3_completion_ids where kind = 'competition'), (select id from public.sport_competition_stages where name = 'Manual order'), 'OPEN',
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player One'),
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player Three'),
  null, 'Court 1', now() + interval '2 hours', 60, 0, 0, 'phase3-order-0001'
)$$, 'the first fixture is manually scheduled');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.schedule_sport_fixture(
  (select id from phase3_completion_ids where kind = 'competition'), (select id from public.sport_competition_stages where name = 'Manual order'), 'OPEN',
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player One'),
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player Three'),
  null, 'Court 1', now() + interval '2 hours', 60, 0, 0, 'phase3-order-0001'
)$$, 'an identical idempotency-key replay returns the existing fixture');
insert into phase3_completion_tap_output(output) select throws_ok($$select public.schedule_sport_fixture(
  (select id from phase3_completion_ids where kind = 'competition'), (select id from public.sport_competition_stages where name = 'Manual order'), 'OPEN',
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player One'),
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player Three'),
  null, 'Changed Court', now() + interval '2 hours', 60, 0, 0, 'phase3-order-0001'
)$$, 'P0001', 'Idempotency key was already used for a different fixture request',
  'an idempotency key cannot be reused for a different fixture request');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.schedule_sport_fixture(
  (select id from phase3_completion_ids where kind = 'competition'), (select id from public.sport_competition_stages where name = 'Manual order'), 'OPEN',
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player Three'),
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player One'),
  null, 'Court 2', now() + interval '3 hours', 60, 1, 1, 'phase3-order-0002'
)$$, 'the second fixture is manually scheduled');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.reorder_sport_fixtures(
  (select id from phase3_completion_ids where kind = 'competition'),
  (select array_agg(id order by display_order desc) from public.sport_fixtures
    where competition_id = (select id from phase3_completion_ids where kind = 'competition')), 2
)$$, 'the full fixture set can be reordered atomically');
insert into phase3_completion_tap_output(output) select is(
  (select court from public.sport_fixtures
    where competition_id = (select id from phase3_completion_ids where kind = 'competition')
    order by display_order limit 1), 'Court 2', 'the requested manual order is persisted');
insert into phase3_completion_tap_output(output) select is(public.update_sport_competition_points_rule(
  (select id from phase3_completion_ids where kind = 'competition'), 3, 1, 0, 3, 1
), 2, 'points rules update with optimistic versioning');
insert into phase3_completion_tap_output(output) select throws_ok($$select public.update_sport_competition_points_rule(
  (select id from phase3_completion_ids where kind = 'competition'), 4, 2, 0, 4, 1
)$$, 'P0001', 'Points rules changed; reload before saving', 'stale points-rule updates are rejected');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.assign_sport_fixture_official(
  (select id from public.sport_fixtures
    where competition_id = (select id from phase3_completion_ids where kind = 'competition')
    order by display_order limit 1), 'f4350000-0000-0000-0000-000000000005', 'SCOREKEEPER'
)$$, 'an account-backed scorekeeper can be assigned');
insert into phase3_completion_tap_output(output) select is((
  select count(*) from public.sport_fixture_officials official
  join public.sport_fixtures fixture on fixture.id = official.fixture_id
  where fixture.competition_id = (select id from phase3_completion_ids where kind = 'competition')
), 1::bigint, 'one official assignment is stored');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4350000-0000-0000-0000-000000000002', true);
insert into phase3_completion_tap_output(output) select throws_ok($$select public.check_in_sport_fixture_entry(
  (select id from public.sport_fixtures where court = 'Court 1'
    and competition_id = (select id from phase3_completion_ids where kind = 'competition')),
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player One')
)$$, 'P0001', 'Fixture check-in is not open', 'an entrant cannot check in before the window opens');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4350000-0000-0000-0000-000000000001', true);
insert into phase3_completion_tap_output(output) select lives_ok($$select public.check_in_sport_fixture_entry(
  (select id from public.sport_fixtures where court = 'Court 1'
    and competition_id = (select id from phase3_completion_ids where kind = 'competition')),
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Phase Three Player One')
)$$, 'an organizer can override the check-in window');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.add_sport_competition_venue(
  (select id from phase3_completion_ids where kind = 'competition'), 'Temporary Venue'
)$$, 'an owner can add a venue');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.update_sport_competition_resource(
  'VENUE', (select id from public.sport_competition_venues where name = 'Temporary Venue'), 'Renamed Venue', '1 Main Street', null
)$$, 'an owner can correct venue details');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.add_sport_competition_venue(
  (select id from phase3_completion_ids where kind = 'competition'), 'Second Venue'
)$$, 'an owner can add another manually ordered venue');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.reorder_sport_competition_resources(
  (select id from phase3_completion_ids where kind = 'competition'), 'VENUE',
  (select array_agg(id order by display_order desc) from public.sport_competition_venues
    where competition_id = (select id from phase3_completion_ids where kind = 'competition'))
)$$, 'the complete venue set can be reordered atomically');
insert into phase3_completion_tap_output(output) select is(
  (select name from public.sport_competition_venues
    where competition_id = (select id from phase3_completion_ids where kind = 'competition')
    order by display_order limit 1),
  'Second Venue', 'the requested venue order is persisted');
insert into phase3_completion_tap_output(output) select lives_ok($$select public.delete_sport_competition_resource(
  'VENUE', (select id from public.sport_competition_venues where name = 'Renamed Venue')
)$$, 'an unused venue can be removed');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4350000-0000-0000-0000-000000000005', true);
insert into phase3_completion_tap_output(output) select is(
  (select count(*) from public.sport_competitions where name = 'Phase Three Completion League'),
  1::bigint, 'an assigned official can read their private competition context');

insert into phase3_completion_tap_output(output) select * from finish();
select output from phase3_completion_tap_output;
rollback;
