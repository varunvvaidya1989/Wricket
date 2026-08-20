begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table reregistration_tap_output(output text not null) on commit drop;
create temporary table reregistration_ids(kind text primary key, id uuid not null) on commit drop;
grant insert, select on reregistration_tap_output, reregistration_ids to authenticated;
insert into reregistration_tap_output(output) select plan(34);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'f4320000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'reregister-owner@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4320000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'reregister-player@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles(id, display_name) values
  ('f4320000-0000-0000-0000-000000000001', 'Reregister Owner'),
  ('f4320000-0000-0000-0000-000000000002', 'Reregister Player');
insert into public.account_sports(account_id, sport_id, access_status, is_primary)
select account_id, sport.id, 'ACTIVE', true
from unnest(array[
  'f4320000-0000-0000-0000-000000000001'::uuid,
  'f4320000-0000-0000-0000-000000000002'::uuid
]) account_id cross join public.sports sport where sport.code = 'TENNIS';
insert into reregistration_ids(kind, id)
select 'player_profile', id from public.sport_profiles
where account_id = 'f4320000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4320000-0000-0000-0000-000000000001', true);

insert into reregistration_tap_output(output) select lives_ok($$select public.create_sport_competition(
  'TENNIS', 'LEAGUE', 'Reregistration League', 'SINGLES', null, 'PRIVATE', 'UTC'
)$$, 'the owner can create a league for re-registration tests');
insert into reregistration_ids(kind, id)
select 'league_competition', id from public.sport_competitions where name = 'Reregistration League';
insert into reregistration_ids(kind, id)
select 'league_entry', public.register_sport_league_player(
  (select id from reregistration_ids where kind = 'league_competition'),
  (select id from reregistration_ids where kind = 'player_profile')
);

insert into reregistration_tap_output(output) select lives_ok($$select public.withdraw_sport_entry(
  (select id from reregistration_ids where kind = 'league_entry')
)$$, 'a league entry can be withdrawn');
insert into reregistration_tap_output(output) select is(
  public.register_sport_league_player(
    (select id from reregistration_ids where kind = 'league_competition'),
    (select id from reregistration_ids where kind = 'player_profile')
  ),
  (select id from reregistration_ids where kind = 'league_entry'),
  'a withdrawn player registration reuses its entry identity');
insert into reregistration_tap_output(output) select is(
  (select status::text from public.sport_competition_entries where id = (select id from reregistration_ids where kind = 'league_entry')),
  'PENDING', 'withdrawn player re-registration returns to pending');
insert into reregistration_tap_output(output) select is(
  (select withdrawn_at from public.sport_competition_entries where id = (select id from reregistration_ids where kind = 'league_entry')),
  null::timestamptz, 'player re-registration clears the withdrawal timestamp');

insert into reregistration_tap_output(output) select lives_ok($$select public.set_sport_entry_status(
  (select id from reregistration_ids where kind = 'league_entry'), 'REJECTED'
)$$, 'the re-registered player can be rejected');
insert into reregistration_tap_output(output) select is(
  public.register_sport_league_player(
    (select id from reregistration_ids where kind = 'league_competition'),
    (select id from reregistration_ids where kind = 'player_profile')
  ),
  (select id from reregistration_ids where kind = 'league_entry'),
  'a rejected player registration reuses its entry identity');
insert into reregistration_tap_output(output) select is(
  (select status::text from public.sport_competition_entries where id = (select id from reregistration_ids where kind = 'league_entry')),
  'PENDING', 'rejected player re-registration returns to pending');

insert into reregistration_tap_output(output) select lives_ok($$select public.set_sport_entry_status(
  (select id from reregistration_ids where kind = 'league_entry'), 'APPROVED', 7
)$$, 'the player can be approved before disqualification');
insert into reregistration_tap_output(output) select lives_ok($$select public.set_sport_entry_status(
  (select id from reregistration_ids where kind = 'league_entry'), 'DISQUALIFIED'
)$$, 'the approved player can be disqualified');
insert into reregistration_tap_output(output) select is(
  public.register_sport_league_player(
    (select id from reregistration_ids where kind = 'league_competition'),
    (select id from reregistration_ids where kind = 'player_profile')
  ),
  (select id from reregistration_ids where kind = 'league_entry'),
  'a disqualified player registration reuses its entry identity');
insert into reregistration_tap_output(output) select is(
  (select status::text from public.sport_competition_entries where id = (select id from reregistration_ids where kind = 'league_entry')),
  'PENDING', 'disqualified player re-registration returns to pending');
insert into reregistration_tap_output(output) select is(
  (select seed from public.sport_competition_entries where id = (select id from reregistration_ids where kind = 'league_entry')),
  null::integer, 'disqualified player re-registration clears the prior seed');
insert into reregistration_tap_output(output) select is(
  (select approved_at from public.sport_competition_entries where id = (select id from reregistration_ids where kind = 'league_entry')),
  null::timestamptz, 'disqualified player re-registration clears the prior approval timestamp');
insert into reregistration_tap_output(output) select is(
  public.register_sport_league_player(
    (select id from reregistration_ids where kind = 'league_competition'),
    (select id from reregistration_ids where kind = 'player_profile')
  ),
  (select id from reregistration_ids where kind = 'league_entry'),
  'retrying an active player registration remains idempotent');
insert into reregistration_tap_output(output) select is(
  (select count(*) from public.sport_league_players where competition_id = (select id from reregistration_ids where kind = 'league_competition')),
  1::bigint, 'player re-registration never creates a duplicate detail row');

insert into reregistration_tap_output(output) select lives_ok($$select public.create_sport_club(
  'TENNIS', 'Reregistration Club', 'RRC', 'PRIVATE'
)$$, 'the owner can create a club for squad re-registration');
insert into reregistration_tap_output(output) select lives_ok($$select public.create_sport_team(
  (select id from public.sport_clubs where name = 'Reregistration Club'), 'Reregistration Team', 'RRT', '#2255AA'
)$$, 'the owner can create a reusable squad');
insert into reregistration_tap_output(output) select lives_ok($$select public.create_sport_competition(
  'TENNIS', 'TOURNAMENT', 'Reregistration Cup', 'SINGLES', null, 'PRIVATE', 'UTC'
)$$, 'the owner can create a tournament for squad re-registration');
insert into reregistration_ids(kind, id)
select 'tournament_competition', id from public.sport_competitions where name = 'Reregistration Cup';
insert into reregistration_ids(kind, id)
select 'squad_entry', public.register_sport_tournament_squad(
  (select id from reregistration_ids where kind = 'tournament_competition'),
  (select id from public.sport_teams where name = 'Reregistration Team')
);

insert into reregistration_tap_output(output) select lives_ok($$select public.withdraw_sport_entry(
  (select id from reregistration_ids where kind = 'squad_entry')
)$$, 'a squad entry can be withdrawn');
insert into reregistration_tap_output(output) select is(
  public.register_sport_tournament_squad(
    (select id from reregistration_ids where kind = 'tournament_competition'),
    (select id from public.sport_teams where name = 'Reregistration Team')
  ),
  (select id from reregistration_ids where kind = 'squad_entry'),
  'a withdrawn squad registration reuses its entry identity');
insert into reregistration_tap_output(output) select is(
  (select status::text from public.sport_competition_entries where id = (select id from reregistration_ids where kind = 'squad_entry')),
  'PENDING', 'withdrawn squad re-registration returns to pending');
insert into reregistration_tap_output(output) select is(
  (select count(*) from public.sport_squad_members where squad_entry_id = (select id from reregistration_ids where kind = 'squad_entry')),
  1::bigint, 'squad re-registration rebuilds the current active roster once');

insert into reregistration_tap_output(output) select lives_ok($$select public.set_sport_entry_status(
  (select id from reregistration_ids where kind = 'squad_entry'), 'REJECTED'
)$$, 'the re-registered squad can be rejected');
insert into reregistration_tap_output(output) select is(
  public.register_sport_tournament_squad(
    (select id from reregistration_ids where kind = 'tournament_competition'),
    (select id from public.sport_teams where name = 'Reregistration Team')
  ),
  (select id from reregistration_ids where kind = 'squad_entry'),
  'a rejected squad registration reuses its entry identity');
insert into reregistration_tap_output(output) select is(
  (select count(*) from public.sport_tournament_squads where competition_id = (select id from reregistration_ids where kind = 'tournament_competition')),
  1::bigint, 'squad re-registration never creates a duplicate squad row');

insert into reregistration_tap_output(output) select lives_ok($$select public.set_sport_entry_status(
  (select id from reregistration_ids where kind = 'squad_entry'), 'APPROVED', 3
)$$, 'the squad can be approved before disqualification');
insert into reregistration_tap_output(output) select lives_ok($$select public.set_sport_entry_status(
  (select id from reregistration_ids where kind = 'squad_entry'), 'DISQUALIFIED'
)$$, 'the approved squad can be disqualified');
insert into reregistration_tap_output(output) select is(
  public.register_sport_tournament_squad(
    (select id from reregistration_ids where kind = 'tournament_competition'),
    (select id from public.sport_teams where name = 'Reregistration Team')
  ),
  (select id from reregistration_ids where kind = 'squad_entry'),
  'a disqualified squad registration reuses its entry identity');
insert into reregistration_tap_output(output) select is(
  (select status::text from public.sport_competition_entries where id = (select id from reregistration_ids where kind = 'squad_entry')),
  'PENDING', 'disqualified squad re-registration returns to pending');
insert into reregistration_tap_output(output) select is(
  (select seed from public.sport_competition_entries where id = (select id from reregistration_ids where kind = 'squad_entry')),
  null::integer, 'disqualified squad re-registration clears the prior seed');
insert into reregistration_tap_output(output) select is(
  (select approved_at from public.sport_competition_entries where id = (select id from reregistration_ids where kind = 'squad_entry')),
  null::timestamptz, 'disqualified squad re-registration clears the prior approval timestamp');
insert into reregistration_tap_output(output) select is(
  public.register_sport_tournament_squad(
    (select id from reregistration_ids where kind = 'tournament_competition'),
    (select id from public.sport_teams where name = 'Reregistration Team')
  ),
  (select id from reregistration_ids where kind = 'squad_entry'),
  'retrying an active squad registration remains idempotent');

insert into reregistration_tap_output(output) select ok(
  (select count(*) from public.sport_audit_events where action = 'ENTRY_REREGISTERED') >= 6,
  'every closed-entry re-registration is retained in audit history');

insert into reregistration_tap_output(output) select * from finish();
select output from reregistration_tap_output;
rollback;
