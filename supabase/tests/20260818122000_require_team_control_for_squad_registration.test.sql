begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table squad_authorization_tap_output(output text not null) on commit drop;
create temporary table squad_authorization_ids(kind text primary key, id uuid not null) on commit drop;
grant insert, select on squad_authorization_tap_output, squad_authorization_ids to authenticated;
insert into squad_authorization_tap_output(output) select plan(10);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'f4330000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'squad-competition-owner@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4330000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'squad-team-owner@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4330000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'squad-organizer@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles(id, display_name) values
  ('f4330000-0000-0000-0000-000000000001', 'Squad Competition Owner'),
  ('f4330000-0000-0000-0000-000000000002', 'Squad Team Owner'),
  ('f4330000-0000-0000-0000-000000000003', 'Squad Organizer');
insert into public.account_sports(account_id, sport_id, access_status, is_primary)
select account_id, sport.id, 'ACTIVE', true
from unnest(array[
  'f4330000-0000-0000-0000-000000000001'::uuid,
  'f4330000-0000-0000-0000-000000000002'::uuid,
  'f4330000-0000-0000-0000-000000000003'::uuid
]) account_id cross join public.sports sport where sport.code = 'TENNIS';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4330000-0000-0000-0000-000000000002', true);
insert into squad_authorization_tap_output(output) select lives_ok($$select public.create_sport_club(
  'TENNIS', 'Protected Roster Club', 'PRC', 'PRIVATE'
)$$, 'a team owner can create a private club');
insert into squad_authorization_tap_output(output) select lives_ok($$select public.create_sport_team(
  (select id from public.sport_clubs where name = 'Protected Roster Club'), 'Protected Roster Team', 'PRT', '#2255AA'
)$$, 'a team owner can create a reusable team');
insert into squad_authorization_ids(kind, id)
select 'team', id from public.sport_teams where name = 'Protected Roster Team';

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4330000-0000-0000-0000-000000000001', true);
insert into squad_authorization_tap_output(output) select lives_ok($$select public.create_sport_competition(
  'TENNIS', 'TOURNAMENT', 'Protected Roster Cup', 'SINGLES', null, 'PRIVATE', 'UTC'
)$$, 'a competition owner can create a tournament');
insert into squad_authorization_ids(kind, id)
select 'competition', id from public.sport_competitions where name = 'Protected Roster Cup';
insert into squad_authorization_tap_output(output) select lives_ok($$select public.invite_sport_competition_organizer(
  (select id from squad_authorization_ids where kind = 'competition'),
  'f4330000-0000-0000-0000-000000000003'
)$$, 'the competition owner can invite an organizer');
insert into squad_authorization_tap_output(output) select lives_ok($$select public.transition_sport_competition(
  (select id from squad_authorization_ids where kind = 'competition'), 'REGISTRATION_OPEN'
)$$, 'the competition owner can open registration');
insert into squad_authorization_tap_output(output) select throws_ok($$select public.register_sport_tournament_squad(
  (select id from squad_authorization_ids where kind = 'competition'),
  (select id from squad_authorization_ids where kind = 'team')
)$$, 'P0001', 'Only the team owner, manager, or captain can submit this squad',
  'competition ownership alone cannot snapshot an unrelated team roster');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4330000-0000-0000-0000-000000000003', true);
insert into squad_authorization_tap_output(output) select lives_ok($$select public.respond_sport_competition_organizer(
  (select id from public.sport_competition_access where account_id = 'f4330000-0000-0000-0000-000000000003'), true
)$$, 'the invited organizer can accept competition access');
insert into squad_authorization_tap_output(output) select throws_ok($$select public.register_sport_tournament_squad(
  (select id from squad_authorization_ids where kind = 'competition'),
  (select id from squad_authorization_ids where kind = 'team')
)$$, 'P0001', 'Only the team owner, manager, or captain can submit this squad',
  'organizer access alone cannot snapshot an unrelated team roster');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4330000-0000-0000-0000-000000000002', true);
insert into squad_authorization_tap_output(output) select lives_ok($$select public.register_sport_tournament_squad(
  (select id from squad_authorization_ids where kind = 'competition'),
  (select id from squad_authorization_ids where kind = 'team')
)$$, 'the team owner can submit their own squad roster');
insert into squad_authorization_tap_output(output) select is(
  (select count(*) from public.sport_tournament_squads where source_team_id = (select id from squad_authorization_ids where kind = 'team')),
  1::bigint, 'authorized submission creates exactly one squad snapshot');

insert into squad_authorization_tap_output(output) select * from finish();
select output from squad_authorization_tap_output;
rollback;
