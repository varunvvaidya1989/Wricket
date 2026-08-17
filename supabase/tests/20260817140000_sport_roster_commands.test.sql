begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table sport_roster_tap_output(output text not null) on commit drop;
grant insert, select on sport_roster_tap_output to authenticated;
insert into sport_roster_tap_output(output) select plan(29);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'f4100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'roster-owner@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'roster-player@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f4100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'roster-outsider@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles(id, display_name) values
  ('f4100000-0000-0000-0000-000000000001', 'Roster Owner'),
  ('f4100000-0000-0000-0000-000000000002', 'Roster Player'),
  ('f4100000-0000-0000-0000-000000000003', 'Roster Outsider');

insert into public.account_sports(account_id, sport_id, access_status, is_primary)
select account_id, sport.id, 'ACTIVE', true
from unnest(array[
  'f4100000-0000-0000-0000-000000000001'::uuid,
  'f4100000-0000-0000-0000-000000000002'::uuid
]) account_id
cross join public.sports sport
where sport.code = 'TENNIS';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4100000-0000-0000-0000-000000000001', true);

insert into sport_roster_tap_output(output) select ok(
  not has_table_privilege('authenticated', 'public.sport_profiles', 'INSERT'),
  'clients cannot self-provision sport profiles'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.create_sport_club('TENNIS', 'Phase Two Club', 'P2C', 'PRIVATE')$$,
  'an active sport account can create a club'
);
insert into sport_roster_tap_output(output) select is(
  (select count(*) from public.sport_clubs where name = 'Phase Two Club'), 1::bigint,
  'the owner can read the new private club'
);
insert into sport_roster_tap_output(output) select is(
  (select count(*) from public.sport_club_memberships where status = 'ACTIVE'), 1::bigint,
  'club creation adds the owner as an active member'
);
insert into sport_roster_tap_output(output) select is(
  (select count(*) from public.search_sport_players('TENNIS', 'Roster Player', 20)), 1::bigint,
  'sport player search returns only active same-sport accounts'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.invite_sport_club_member(
    (select id from public.sport_clubs where name = 'Phase Two Club'),
    (select sport_profile_id from public.search_sport_players('TENNIS', 'Roster Player', 20))
  )$$,
  'a club owner can invite an account-backed player'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4100000-0000-0000-0000-000000000002', true);
insert into sport_roster_tap_output(output) select is(
  (select club_name from public.list_my_sport_club_invitations('TENNIS')), 'Phase Two Club'::text,
  'the invited player can preview a pending private-club invitation'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.respond_sport_club_invitation(
    (select membership.id from public.sport_club_memberships membership
     join public.sport_profiles profile on profile.id = membership.sport_profile_id
     where profile.account_id = 'f4100000-0000-0000-0000-000000000002'), true
  )$$,
  'the invited player can accept the club invitation'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.respond_sport_club_invitation(
    (select membership.id from public.sport_club_memberships membership
     join public.sport_profiles profile on profile.id = membership.sport_profile_id
     where profile.account_id = 'f4100000-0000-0000-0000-000000000002'), true
  )$$,
  'accepting the same club invitation twice is idempotent'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4100000-0000-0000-0000-000000000001', true);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.invite_sport_club_member(
    (select id from public.sport_clubs where name = 'Phase Two Club'),
    (select sport_profile_id from public.search_sport_players('TENNIS', 'Roster Player', 20))
  )$$,
  'inviting an active club member is idempotent'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.create_sport_team(
    (select id from public.sport_clubs where name = 'Phase Two Club'),
    'Phase Two Team', 'P2T', '#3366AA'
  )$$,
  'the club owner can create a reusable team'
);
insert into sport_roster_tap_output(output) select is(
  (select count(*) from public.sport_team_memberships where status = 'ACTIVE'), 1::bigint,
  'team creation adds the owner to the team roster'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.invite_sport_team_member(
    (select id from public.sport_teams where name = 'Phase Two Team'),
    (select membership.id from public.sport_club_memberships membership
     where membership.display_name_snapshot = 'Roster Player'),
    '["DOUBLES"]'::jsonb
  )$$,
  'a team owner can invite an accepted club member'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4100000-0000-0000-0000-000000000002', true);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.respond_sport_team_invitation(
    (select membership.id from public.sport_team_memberships membership
     join public.sport_profiles profile on profile.id = membership.sport_profile_id
     where profile.account_id = 'f4100000-0000-0000-0000-000000000002'), true
  )$$,
  'the invited player can accept the team invitation'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.respond_sport_team_invitation(
    (select membership.id from public.sport_team_memberships membership
     join public.sport_profiles profile on profile.id = membership.sport_profile_id
     where profile.account_id = 'f4100000-0000-0000-0000-000000000002'), true
  )$$,
  'accepting the same team invitation twice is idempotent'
);
insert into sport_roster_tap_output(output) select is(
  (select eligibility from public.sport_team_memberships membership
   join public.sport_profiles profile on profile.id = membership.sport_profile_id
   where profile.account_id = 'f4100000-0000-0000-0000-000000000002'),
  '["DOUBLES"]'::jsonb,
  'the team roster preserves singles and doubles eligibility'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.update_sport_team_member_eligibility(
    (select membership.id from public.sport_team_memberships membership
     join public.sport_profiles profile on profile.id = membership.sport_profile_id
     where profile.account_id = 'f4100000-0000-0000-0000-000000000002'),
    '["SINGLES", "DOUBLES"]'::jsonb
  )$$,
  'a player can update their own format eligibility'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4100000-0000-0000-0000-000000000001', true);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.invite_sport_access(
    'TEAM', (select id from public.sport_teams where name = 'Phase Two Team'),
    'f4100000-0000-0000-0000-000000000002', 'CAPTAIN'
  )$$,
  'a team owner can invite an active member to be captain'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4100000-0000-0000-0000-000000000002', true);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.respond_sport_access_invitation(
    'TEAM', (select id from public.sport_team_access where account_id = 'f4100000-0000-0000-0000-000000000002'), true
  )$$,
  'the invited player can accept the captain assignment'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.respond_sport_access_invitation(
    'TEAM', (select id from public.sport_team_access where account_id = 'f4100000-0000-0000-0000-000000000002'), true
  )$$,
  'accepting the same captain assignment twice is idempotent'
);
insert into sport_roster_tap_output(output) select ok(
  app_private.can_manage_sport_team((select id from public.sport_teams where name = 'Phase Two Team')),
  'an accepted captain receives contextual team management access'
);
insert into sport_roster_tap_output(output) select ok(
  (select is_captain from public.list_sport_team_roster(
    (select id from public.sport_teams where name = 'Phase Two Team')
  ) where account_id = 'f4100000-0000-0000-0000-000000000002'),
  'the contextual roster view marks accepted captains'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4100000-0000-0000-0000-000000000001', true);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.invite_sport_access(
    'TEAM', (select id from public.sport_teams where name = 'Phase Two Team'),
    'f4100000-0000-0000-0000-000000000002', 'CAPTAIN'
  )$$,
  'inviting an active captain is idempotent'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.revoke_sport_access(
    'TEAM', (select id from public.sport_teams where name = 'Phase Two Team'),
    'f4100000-0000-0000-0000-000000000002', 'CAPTAIN'
  )$$,
  'the team owner can revoke contextual captain access'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.end_sport_team_membership(
    (select membership_id from public.list_sport_team_roster(
      (select id from public.sport_teams where name = 'Phase Two Team')
    ) where account_id = 'f4100000-0000-0000-0000-000000000002'), true
  )$$,
  'a team owner can remove an active team member'
);
insert into sport_roster_tap_output(output) select lives_ok(
  $$select public.end_sport_club_membership(
    (select membership_id from public.list_sport_club_roster(
      (select id from public.sport_clubs where name = 'Phase Two Club')
    ) where account_id = 'f4100000-0000-0000-0000-000000000002'), true
  )$$,
  'a club owner can remove a player after active team membership ends'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4100000-0000-0000-0000-000000000002', true);
insert into sport_roster_tap_output(output) select ok(
  not app_private.can_manage_sport_team((select id from public.sport_teams where name = 'Phase Two Team')),
  'revoked captain access no longer grants management capability'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4100000-0000-0000-0000-000000000003', true);
insert into sport_roster_tap_output(output) select throws_ok(
  $$select public.create_sport_club('TENNIS', 'Invalid Club', null, 'PUBLIC')$$,
  'P0001', 'An active SportStage profile is required for this sport',
  'an account cannot self-activate an unconnected sport'
);

reset role;
insert into sport_roster_tap_output(output) select ok(
  (select count(*) from public.sport_audit_events
   where actor_account_id in (
     'f4100000-0000-0000-0000-000000000001',
     'f4100000-0000-0000-0000-000000000002'
   )) >= 8,
  'roster and access mutations append audit events'
);

insert into sport_roster_tap_output(output) select * from finish();
select output from sport_roster_tap_output;
rollback;
