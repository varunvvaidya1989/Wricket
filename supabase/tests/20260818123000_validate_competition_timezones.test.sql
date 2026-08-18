begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table competition_timezone_tap_output(output text not null) on commit drop;
grant insert, select on competition_timezone_tap_output to authenticated;
insert into competition_timezone_tap_output(output) select plan(7);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', 'f4340000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'competition-timezone@example.invalid', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.profiles(id, display_name)
values ('f4340000-0000-0000-0000-000000000001', 'Competition Timezone Owner');
insert into public.account_sports(account_id, sport_id, access_status, is_primary)
select 'f4340000-0000-0000-0000-000000000001', id, 'ACTIVE', true
from public.sports where code = 'TENNIS';

insert into competition_timezone_tap_output(output) select has_trigger(
  'public', 'sport_competitions', 'sport_competitions_validate_timezone',
  'sport competitions have a table-level time-zone guard');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4340000-0000-0000-0000-000000000001', true);
insert into competition_timezone_tap_output(output) select lives_ok($$select public.create_sport_competition(
  'TENNIS', 'LEAGUE', 'Timezone League', 'SINGLES', null, 'PRIVATE', 'Asia/Kolkata'
)$$, 'a catalog-backed IANA time zone is accepted');
insert into competition_timezone_tap_output(output) select is(
  (select timezone from public.sport_competitions where name = 'Timezone League'),
  'Asia/Kolkata', 'the IANA identifier is stored without device-local conversion');
insert into competition_timezone_tap_output(output) select lives_ok($$select public.update_sport_competition(
  (select id from public.sport_competitions where name = 'Timezone League'),
  'Timezone League', null, 'PRIVATE', 'America/New_York', null, null, null, null
)$$, 'an existing competition can move to another valid IANA time zone');
insert into competition_timezone_tap_output(output) select throws_ok($$select public.create_sport_competition(
  'TENNIS', 'LEAGUE', 'Invalid Timezone League', 'SINGLES', null, 'PRIVATE', 'Not/A_Real_Zone'
)$$, 'P0001', 'Invalid IANA time zone: Not/A_Real_Zone',
  'competition creation rejects an invalid time-zone identifier');
insert into competition_timezone_tap_output(output) select throws_ok($$select public.update_sport_competition(
  (select id from public.sport_competitions where name = 'Timezone League'),
  'Timezone League', null, 'PRIVATE', 'Mars/Olympus_Mons', null, null, null, null
)$$, 'P0001', 'Invalid IANA time zone: Mars/Olympus_Mons',
  'competition updates reject an invalid time-zone identifier');
insert into competition_timezone_tap_output(output) select is(
  (select timezone from public.sport_competitions where name = 'Timezone League'),
  'America/New_York', 'a rejected update leaves the valid time zone unchanged');

insert into competition_timezone_tap_output(output) select * from finish();
select output from competition_timezone_tap_output;
rollback;
