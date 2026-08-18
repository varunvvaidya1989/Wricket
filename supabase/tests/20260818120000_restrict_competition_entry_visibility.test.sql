begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table entry_visibility_tap_output(output text not null) on commit drop;
grant insert, select on entry_visibility_tap_output to authenticated;
insert into entry_visibility_tap_output(output) select plan(16);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'f4310000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'entry-owner@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4310000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'entry-approved@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4310000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'entry-pending@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4310000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'entry-rejected@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4310000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'entry-withdrawn@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4310000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'entry-team-controller@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4310000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'entry-outsider@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles(id, display_name) values
  ('f4310000-0000-0000-0000-000000000001', 'Entry Owner'),
  ('f4310000-0000-0000-0000-000000000002', 'Approved Player'),
  ('f4310000-0000-0000-0000-000000000003', 'Pending Player'),
  ('f4310000-0000-0000-0000-000000000004', 'Rejected Player'),
  ('f4310000-0000-0000-0000-000000000005', 'Withdrawn Player'),
  ('f4310000-0000-0000-0000-000000000006', 'Team Controller'),
  ('f4310000-0000-0000-0000-000000000007', 'Entry Outsider');

insert into public.account_sports(account_id, sport_id, access_status, is_primary)
select account_id, sport.id, 'ACTIVE', true
from unnest(array[
  'f4310000-0000-0000-0000-000000000001'::uuid,
  'f4310000-0000-0000-0000-000000000002'::uuid,
  'f4310000-0000-0000-0000-000000000003'::uuid,
  'f4310000-0000-0000-0000-000000000004'::uuid,
  'f4310000-0000-0000-0000-000000000005'::uuid,
  'f4310000-0000-0000-0000-000000000006'::uuid
]) account_id
cross join public.sports sport
where sport.code = 'TENNIS';

insert into public.sport_competitions(
  id, sport_id, kind, name, visibility, lifecycle, owner_account_id, timezone
) values
  ('f4311000-0000-0000-0000-000000000001', (select id from public.sports where code = 'TENNIS'),
    'LEAGUE', 'Entry Privacy League', 'PUBLIC', 'REGISTRATION_OPEN', 'f4310000-0000-0000-0000-000000000001', 'UTC'),
  ('f4311000-0000-0000-0000-000000000002', (select id from public.sports where code = 'TENNIS'),
    'TOURNAMENT', 'Entry Privacy Cup', 'PUBLIC', 'REGISTRATION_OPEN', 'f4310000-0000-0000-0000-000000000001', 'UTC');

insert into public.sport_competition_entries(
  id, competition_id, entry_kind, status, accepted_at, approved_at, withdrawn_at, snapshot
) values
  ('f4312000-0000-0000-0000-000000000001', 'f4311000-0000-0000-0000-000000000001', 'PLAYER', 'APPROVED', now(), now(), null, '{"display_name":"Approved Player"}'),
  ('f4312000-0000-0000-0000-000000000002', 'f4311000-0000-0000-0000-000000000001', 'PLAYER', 'PENDING', null, null, null, '{"display_name":"Pending Player"}'),
  ('f4312000-0000-0000-0000-000000000003', 'f4311000-0000-0000-0000-000000000001', 'PLAYER', 'REJECTED', null, null, null, '{"display_name":"Rejected Player"}'),
  ('f4312000-0000-0000-0000-000000000004', 'f4311000-0000-0000-0000-000000000001', 'PLAYER', 'WITHDRAWN', null, null, now(), '{"display_name":"Withdrawn Player"}');

insert into public.sport_league_players(
  entry_id, competition_id, sport_profile_id, display_name_snapshot, eligibility
)
select source.entry_id, 'f4311000-0000-0000-0000-000000000001', profile.id,
  profile.display_name, '["SINGLES"]'::jsonb
from (values
  ('f4312000-0000-0000-0000-000000000001'::uuid, 'f4310000-0000-0000-0000-000000000002'::uuid),
  ('f4312000-0000-0000-0000-000000000002'::uuid, 'f4310000-0000-0000-0000-000000000003'::uuid),
  ('f4312000-0000-0000-0000-000000000003'::uuid, 'f4310000-0000-0000-0000-000000000004'::uuid),
  ('f4312000-0000-0000-0000-000000000004'::uuid, 'f4310000-0000-0000-0000-000000000005'::uuid)
) source(entry_id, account_id)
join public.sport_profiles profile on profile.account_id = source.account_id
join public.sports sport on sport.id = profile.sport_id and sport.code = 'TENNIS';

insert into public.sport_clubs(id, sport_id, name, visibility, owner_account_id)
values ('f4313000-0000-0000-0000-000000000001', (select id from public.sports where code = 'TENNIS'),
  'Entry Privacy Club', 'PRIVATE', 'f4310000-0000-0000-0000-000000000006');
insert into public.sport_teams(id, club_id, name, owner_account_id) values
  ('f4314000-0000-0000-0000-000000000001', 'f4313000-0000-0000-0000-000000000001', 'Approved Privacy Team', 'f4310000-0000-0000-0000-000000000006'),
  ('f4314000-0000-0000-0000-000000000002', 'f4313000-0000-0000-0000-000000000001', 'Pending Privacy Team', 'f4310000-0000-0000-0000-000000000006');

insert into public.sport_competition_entries(
  id, competition_id, entry_kind, status, accepted_at, approved_at, snapshot
) values
  ('f4312000-0000-0000-0000-000000000005', 'f4311000-0000-0000-0000-000000000002', 'SQUAD', 'APPROVED', now(), now(), '{"name":"Approved Privacy Team"}'),
  ('f4312000-0000-0000-0000-000000000006', 'f4311000-0000-0000-0000-000000000002', 'SQUAD', 'PENDING', null, null, '{"name":"Pending Privacy Team"}');
insert into public.sport_tournament_squads(
  entry_id, competition_id, source_team_id, name_snapshot, captain_account_id
) values
  ('f4312000-0000-0000-0000-000000000005', 'f4311000-0000-0000-0000-000000000002', 'f4314000-0000-0000-0000-000000000001', 'Approved Privacy Team', 'f4310000-0000-0000-0000-000000000006'),
  ('f4312000-0000-0000-0000-000000000006', 'f4311000-0000-0000-0000-000000000002', 'f4314000-0000-0000-0000-000000000002', 'Pending Privacy Team', 'f4310000-0000-0000-0000-000000000006');
insert into public.sport_squad_members(
  squad_entry_id, sport_profile_id, display_name_snapshot, eligibility, status, accepted_at, approved_at
) values
  ('f4312000-0000-0000-0000-000000000005', (select id from public.sport_profiles where account_id = 'f4310000-0000-0000-0000-000000000002'), 'Approved Player', '["SINGLES"]', 'APPROVED', now(), now()),
  ('f4312000-0000-0000-0000-000000000006', (select id from public.sport_profiles where account_id = 'f4310000-0000-0000-0000-000000000003'), 'Pending Player', '["SINGLES"]', 'PENDING', null, null);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4310000-0000-0000-0000-000000000007', true);
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_competition_entries), 2::bigint,
  'an authenticated public viewer sees only approved entries');
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_league_players), 1::bigint,
  'an authenticated public viewer sees only approved league-player details');
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_tournament_squads), 1::bigint,
  'an authenticated public viewer sees only approved squad snapshots');
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_squad_members), 1::bigint,
  'an authenticated public viewer sees only approved squad rosters');
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_competition_entries where status = 'PENDING'), 0::bigint,
  'pending registrations are hidden from public viewers');
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_competition_entries where status = 'REJECTED'), 0::bigint,
  'rejected registrations are hidden from public viewers');
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_competition_entries where status = 'WITHDRAWN'), 0::bigint,
  'withdrawn registrations are hidden from public viewers');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4310000-0000-0000-0000-000000000003', true);
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_competition_entries), 3::bigint,
  'a player sees approved public entries plus their own pending entry');
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_league_players where display_name_snapshot = 'Pending Player'), 1::bigint,
  'a player can read their own pending league-player detail');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4310000-0000-0000-0000-000000000004', true);
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_competition_entries where status = 'REJECTED'), 1::bigint,
  'a player can read their own rejected registration');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4310000-0000-0000-0000-000000000005', true);
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_competition_entries where status = 'WITHDRAWN'), 1::bigint,
  'a player can read their own withdrawn registration');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4310000-0000-0000-0000-000000000006', true);
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_tournament_squads), 2::bigint,
  'a team controller sees both approved and pending squads for their teams');
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_squad_members), 2::bigint,
  'a team controller sees private roster snapshots for their entries');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4310000-0000-0000-0000-000000000001', true);
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_competition_entries), 6::bigint,
  'the competition owner sees every registration state');
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_league_players), 4::bigint,
  'the competition owner sees every league-player detail');
insert into entry_visibility_tap_output(output) select is(
  (select count(*) from public.sport_squad_members), 2::bigint,
  'the competition owner sees every squad roster snapshot');

insert into entry_visibility_tap_output(output) select * from finish();
select output from entry_visibility_tap_output;
rollback;
