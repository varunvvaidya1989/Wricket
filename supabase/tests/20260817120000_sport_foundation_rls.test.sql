begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table sport_foundation_tap_output (
  output text not null
) on commit drop;
grant insert, select on sport_foundation_tap_output to anon, authenticated;

insert into sport_foundation_tap_output(output) select plan(25);

insert into sport_foundation_tap_output(output)
select has_table('public', table_name, table_name || ' exists')
from unnest(array[
  'sport_feature_flags',
  'sport_clubs',
  'sport_club_access',
  'sport_club_memberships',
  'sport_teams',
  'sport_team_access',
  'sport_team_memberships',
  'sport_competitions',
  'sport_competition_access',
  'sport_competition_stages',
  'sport_competition_entries',
  'sport_tournament_squads',
  'sport_squad_members',
  'sport_league_players',
  'sport_audit_events'
]) as table_name;

insert into auth.users(
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'f1000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'sport-foundation-owner@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f1000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'sport-foundation-outsider@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.profiles(id, display_name)
values
  ('f1000000-0000-0000-0000-000000000001', 'Foundation Owner'),
  ('f1000000-0000-0000-0000-000000000002', 'Foundation Outsider');

insert into public.sport_profiles(account_id, sport_id, display_name, status)
select 'f1000000-0000-0000-0000-000000000001', sport.id, 'Foundation Owner', 'ACTIVE'
from public.sports sport where sport.code = 'TENNIS';
insert into public.sport_profiles(account_id, sport_id, display_name, status)
select 'f1000000-0000-0000-0000-000000000002', sport.id, 'Foundation Outsider', 'ACTIVE'
from public.sports sport where sport.code = 'TENNIS';

insert into public.sport_competitions(
  id, sport_id, kind, name, visibility, lifecycle, owner_account_id
)
select
  'f2000000-0000-0000-0000-000000000001',
  sport.id,
  'TOURNAMENT',
  'Published Public Competition',
  'PUBLIC',
  'PUBLISHED',
  'f1000000-0000-0000-0000-000000000001'
from public.sports sport where sport.code = 'TENNIS';

insert into public.sport_clubs(id, sport_id, name, owner_account_id)
select
  'f3000000-0000-0000-0000-000000000001',
  sport.id,
  'Foundation Tennis Club',
  'f1000000-0000-0000-0000-000000000001'
from public.sports sport where sport.code = 'TENNIS';

insert into public.sport_competitions(
  id, sport_id, kind, name, visibility, lifecycle, owner_account_id
)
select
  'f2000000-0000-0000-0000-000000000002',
  sport.id,
  'TOURNAMENT',
  'Private Competition',
  'PRIVATE',
  'PUBLISHED',
  'f1000000-0000-0000-0000-000000000001'
from public.sports sport where sport.code = 'TENNIS';

insert into public.sport_competitions(
  id, sport_id, kind, name, visibility, lifecycle, owner_account_id
)
select
  'f2000000-0000-0000-0000-000000000003',
  sport.id,
  'TOURNAMENT',
  'Public Draft Competition',
  'PUBLIC',
  'DRAFT',
  'f1000000-0000-0000-0000-000000000001'
from public.sports sport where sport.code = 'TENNIS';

insert into public.sport_audit_events(
  sport_id, actor_account_id, resource_type, resource_id, action
)
select
  sport.id,
  'f1000000-0000-0000-0000-000000000001',
  'COMPETITION',
  'f2000000-0000-0000-0000-000000000001',
  'COMPETITION_CREATED'
from public.sports sport where sport.code = 'TENNIS';

set local role anon;
insert into sport_foundation_tap_output(output) select ok(
  has_table_privilege('anon', 'public.sport_feature_flags', 'SELECT'),
  'anonymous users can read rollout flags'
);
insert into sport_foundation_tap_output(output) select ok(
  not has_table_privilege('anon', 'public.sport_competitions', 'SELECT'),
  'anonymous users cannot read competition records directly'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000002', true);
insert into sport_foundation_tap_output(output) select ok(
  has_table_privilege('authenticated', 'public.sport_competitions', 'SELECT'),
  'authenticated users have RLS-filtered competition reads'
);
insert into sport_foundation_tap_output(output) select is(
  (select count(*) from public.sport_competitions),
  1::bigint,
  'an outsider sees only published public competitions'
);
insert into sport_foundation_tap_output(output) select is(
  (select count(*) from public.sport_competitions where visibility = 'PRIVATE'),
  0::bigint,
  'an outsider cannot see private competitions'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', true);
insert into sport_foundation_tap_output(output) select is(
  (select count(*) from public.sport_competitions),
  3::bigint,
  'the owner sees public, private, and draft competitions'
);
insert into sport_foundation_tap_output(output) select ok(
  not has_table_privilege('authenticated', 'public.sport_competitions', 'INSERT'),
  'authenticated clients cannot bypass server competition commands'
);
insert into sport_foundation_tap_output(output) select ok(
  not has_table_privilege('authenticated', 'public.sport_audit_events', 'UPDATE'),
  'authenticated clients cannot edit audit history'
);

reset role;
insert into sport_foundation_tap_output(output) select col_not_null(
  'public',
  'sport_team_memberships',
  'club_membership_id',
  'team membership always identifies its accepted club membership'
);
insert into sport_foundation_tap_output(output) select throws_ok(
  $$
    insert into public.sport_club_memberships(
      club_id, sport_profile_id, display_name_snapshot
    ) values (
      'f3000000-0000-0000-0000-000000000001', null, 'Unlinked Player'
    )
  $$,
  'P0001',
  'Every sport participant must have a SportStage account',
  'an unlinked player cannot be added to a club'
);

insert into sport_foundation_tap_output(output) select * from finish();
select output from sport_foundation_tap_output;
rollback;
