begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table cloud_competition_tap_output(output text not null) on commit drop;
grant insert, select on cloud_competition_tap_output to authenticated;
insert into cloud_competition_tap_output(output) select plan(38);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'f4200000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cloud-owner@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4200000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cloud-player@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4200000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cloud-organizer@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4200000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'cloud-outsider@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles(id, display_name) values
  ('f4200000-0000-0000-0000-000000000001', 'Cloud Owner'),
  ('f4200000-0000-0000-0000-000000000002', 'Cloud Player'),
  ('f4200000-0000-0000-0000-000000000003', 'Cloud Organizer'),
  ('f4200000-0000-0000-0000-000000000004', 'Cloud Outsider');

insert into public.account_sports(account_id, sport_id, access_status, is_primary)
select account_id, sport.id, 'ACTIVE', true
from unnest(array[
  'f4200000-0000-0000-0000-000000000001'::uuid,
  'f4200000-0000-0000-0000-000000000002'::uuid,
  'f4200000-0000-0000-0000-000000000003'::uuid
]) account_id cross join public.sports sport where sport.code = 'TENNIS';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4200000-0000-0000-0000-000000000001', true);

insert into cloud_competition_tap_output(output) select ok(not has_table_privilege('authenticated', 'public.sport_competitions', 'INSERT'),
  'clients cannot insert cloud competitions directly');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.create_sport_competition(
  'TENNIS', 'LEAGUE', 'Cloud League', 'SINGLES', null, 'PUBLIC', 'UTC'
)$$, 'an active sport account can create an individual league');
insert into cloud_competition_tap_output(output) select is((select lifecycle::text from public.sport_competitions where name = 'Cloud League'),
  'DRAFT', 'new competitions begin in draft');
insert into cloud_competition_tap_output(output) select is((select count(*) from public.sport_competition_divisions), 1::bigint,
  'competition creation adds the default open division');
insert into cloud_competition_tap_output(output) select throws_ok($$select public.create_sport_competition(
  'TENNIS', 'LEAGUE', 'Invalid Doubles League', 'DOUBLES'
)$$, 'P0001', 'Individual-player leagues use singles matches',
  'leagues cannot be created with doubles entrants');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.add_sport_competition_stage(
  (select id from public.sport_competitions where name = 'Cloud League'), 'League Schedule', 'ROUND_ROBIN', 0
)$$, 'the owner can add an explicitly named stage');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.add_sport_competition_venue(
  (select id from public.sport_competitions where name = 'Cloud League'), 'Centre Courts', '1 Main Street', 4
)$$, 'the owner can add a venue');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.invite_sport_competition_organizer(
  (select id from public.sport_competitions where name = 'Cloud League'),
  'f4200000-0000-0000-0000-000000000003'
)$$, 'the owner can invite an organizer');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.transition_sport_competition(
  (select id from public.sport_competitions where name = 'Cloud League'), 'REGISTRATION_OPEN'
)$$, 'the owner can open registration');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4200000-0000-0000-0000-000000000002', true);
insert into cloud_competition_tap_output(output) select lives_ok($$select public.register_sport_league_player(
  (select id from public.sport_competitions where name = 'Cloud League'),
  (select id from public.sport_profiles where account_id = 'f4200000-0000-0000-0000-000000000002')
)$$, 'a player can register their own account-backed sport profile');
insert into cloud_competition_tap_output(output) select is((select entry_kind::text from public.sport_competition_entries), 'PLAYER',
  'league registration creates a player entry');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4200000-0000-0000-0000-000000000003', true);
insert into cloud_competition_tap_output(output) select lives_ok($$select public.respond_sport_competition_organizer(
  (select id from public.sport_competition_access where account_id = 'f4200000-0000-0000-0000-000000000003'), true
)$$, 'the invited organizer can accept contextual access');
insert into cloud_competition_tap_output(output) select ok(public.can_manage_sport_competition(
  (select id from public.sport_competitions where name = 'Cloud League')),
  'accepted organizers can manage the competition');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.register_sport_league_player(
  (select id from public.sport_competitions where name = 'Cloud League'),
  (select sport_profile_id from public.search_sport_players('TENNIS', 'Cloud Owner', 20))
)$$, 'an organizer can register another account-backed league player');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.set_sport_entry_status(
  (select entry.id from public.sport_competition_entries entry
   join public.sport_league_players player on player.entry_id = entry.id
   where player.display_name_snapshot = 'Cloud Player'), 'APPROVED', 1
)$$, 'an organizer can approve a pending entry');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.set_sport_entry_status(
  (select entry.id from public.sport_competition_entries entry
   join public.sport_league_players player on player.entry_id = entry.id
   where player.display_name_snapshot = 'Cloud Owner'), 'APPROVED', 2
)$$, 'an organizer can approve the second entry');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.add_sport_competition_stage(
  (select id from public.sport_competitions where name = 'Cloud League'), 'Final', 'FINALS', 1
)$$, 'an accepted organizer can add stages');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.transition_sport_competition(
  (select id from public.sport_competitions where name = 'Cloud League'), 'REGISTRATION_LOCKED'
)$$, 'an organizer can lock registration');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.schedule_sport_fixture(
  (select id from public.sport_competitions where name = 'Cloud League'),
  (select id from public.sport_competition_stages where name = 'League Schedule'), 'OPEN',
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Cloud Player'),
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Cloud Owner'),
  (select id from public.sport_competition_venues where name = 'Centre Courts'), 'Court 1', now() + interval '1 day', 90, 0, 0, 'cloud-fixture-0001'
)$$, 'an organizer manually schedules two approved entrants');
insert into cloud_competition_tap_output(output) select is((select schedule_version from public.sport_competitions where name = 'Cloud League'), 1,
  'manual scheduling increments the competition schedule version');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.schedule_sport_fixture(
  (select id from public.sport_competitions where name = 'Cloud League'),
  (select id from public.sport_competition_stages where name = 'League Schedule'), 'OPEN',
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Cloud Player'),
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Cloud Owner'),
  (select venue_id from public.sport_fixtures where idempotency_key = 'cloud-fixture-0001'),
  (select court from public.sport_fixtures where idempotency_key = 'cloud-fixture-0001'),
  (select scheduled_at from public.sport_fixtures where idempotency_key = 'cloud-fixture-0001'),
  (select duration_minutes from public.sport_fixtures where idempotency_key = 'cloud-fixture-0001'),
  0, 0, 'cloud-fixture-0001'
)$$, 'replaying the same schedule idempotency key is safe');
insert into cloud_competition_tap_output(output) select is((select count(*) from public.sport_fixtures), 1::bigint,
  'an idempotent retry does not duplicate the fixture');
insert into cloud_competition_tap_output(output) select throws_ok($$select public.schedule_sport_fixture(
  (select id from public.sport_competitions where name = 'Cloud League'),
  (select id from public.sport_competition_stages where name = 'League Schedule'), 'OPEN',
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Cloud Player'),
  (select entry.id from public.sport_competition_entries entry join public.sport_league_players player on player.entry_id = entry.id where player.display_name_snapshot = 'Cloud Owner'),
  null, 'Different court', null, null, 0, 1, 'cloud-fixture-0001'
)$$, 'P0001', 'Idempotency key was already used for a different fixture request',
  'reusing an idempotency key for another request is rejected');
insert into cloud_competition_tap_output(output) select throws_ok($$select public.reschedule_sport_fixture(
  (select id from public.sport_fixtures), null, 'Court 2', now() + interval '2 days', 90, 0, 0, 1
)$$, 'P0001', 'Schedule changed; reload before saving',
  'stale schedule versions are rejected');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.reschedule_sport_fixture(
  (select id from public.sport_fixtures), null, 'Court 2', now(), 90, 0, 1, 1
)$$, 'a current schedule version can reschedule the fixture');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4200000-0000-0000-0000-000000000002', true);
insert into cloud_competition_tap_output(output) select lives_ok($$select public.check_in_sport_fixture_entry(
  (select id from public.sport_fixtures),
  (select entry.id from public.sport_competition_entries entry
   join public.sport_league_players player on player.entry_id = entry.id
   where player.display_name_snapshot = 'Cloud Player')
)$$, 'an entrant can check themselves into a scheduled fixture');
insert into cloud_competition_tap_output(output) select is((select status::text from public.sport_fixture_check_ins),
  'CHECKED_IN', 'fixture check-in is stored against the account-backed entry');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4200000-0000-0000-0000-000000000003', true);
insert into cloud_competition_tap_output(output) select lives_ok($$select public.cancel_sport_fixture(
  (select id from public.sport_fixtures), 'Court unavailable', 2, 2
)$$, 'an organizer can cancel a fixture with a reason');
insert into cloud_competition_tap_output(output) select is((select status::text from public.sport_fixtures), 'CANCELLED',
  'fixture cancellation is persisted');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.transition_sport_competition(
  (select id from public.sport_competitions where name = 'Cloud League'), 'PUBLISHED'
)$$, 'the locked schedule can be published');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4200000-0000-0000-0000-000000000004', true);
insert into cloud_competition_tap_output(output) select is((select count(*) from public.sport_competitions where name = 'Cloud League'), 1::bigint,
  'an authenticated outsider can read a published public competition');
insert into cloud_competition_tap_output(output) select throws_ok($$select public.transition_sport_competition(
  (select id from public.sport_competitions where name = 'Cloud League'), 'LIVE'
)$$, 'P0001', 'Only the competition owner or an organizer can perform this action',
  'outsiders cannot mutate competition lifecycle');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4200000-0000-0000-0000-000000000001', true);
insert into cloud_competition_tap_output(output) select lives_ok($$select public.create_sport_club('TENNIS', 'Cloud Club', 'CLC', 'PRIVATE')$$,
  'the owner can create a club for a tournament squad');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.create_sport_team(
  (select id from public.sport_clubs where name = 'Cloud Club'), 'Cloud Team', 'CLT', '#2255AA'
)$$, 'the owner can create a reusable team');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.create_sport_competition(
  'TENNIS', 'TOURNAMENT', 'Cloud Cup', 'SINGLES', null, 'PRIVATE', 'UTC'
)$$, 'the owner can create a squad tournament');
insert into cloud_competition_tap_output(output) select lives_ok($$select public.register_sport_tournament_squad(
  (select id from public.sport_competitions where name = 'Cloud Cup'),
  (select id from public.sport_teams where name = 'Cloud Team')
)$$, 'a reusable team can register an account-backed squad snapshot');
insert into cloud_competition_tap_output(output) select is((select count(*) from public.sport_squad_members), 1::bigint,
  'tournament registration snapshots the active reusable roster');
insert into cloud_competition_tap_output(output) select ok((select count(*) from public.sport_audit_events
  where actor_account_id in ('f4200000-0000-0000-0000-000000000001', 'f4200000-0000-0000-0000-000000000003')) >= 15,
  'competition, registration, lifecycle, and schedule mutations are audited');

insert into cloud_competition_tap_output(output) select * from finish();
select output from cloud_competition_tap_output;
rollback;
