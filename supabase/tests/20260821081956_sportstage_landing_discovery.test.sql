begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

set local role anon;
select lives_ok(
  $$select * from public.discover_sportstage_upcoming(30, null)$$,
  'signed-out upcoming discovery executes successfully'
);
reset role;

select has_table('public', 'sportstage_upcoming_snapshots', 'upcoming snapshot projection exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sportstage_upcoming_snapshots'::regclass),
  'upcoming snapshots use RLS'
);
select hasnt_column('public', 'sportstage_upcoming_snapshots', 'account_id', 'upcoming snapshots omit account identifiers');
select hasnt_column('public', 'sportstage_upcoming_snapshots', 'player_id', 'upcoming snapshots omit player identifiers');
select ok(
  has_table_privilege('anon', 'public.sportstage_upcoming_snapshots', 'SELECT'),
  'signed-out clients can read upcoming snapshots'
);
select has_function(
  'public',
  'discover_sportstage_upcoming',
  array['integer', 'text'],
  'upcoming discovery function exists'
);
select ok(
  has_function_privilege('anon', 'public.discover_sportstage_upcoming(integer,text)', 'EXECUTE'),
  'signed-out clients can request upcoming matches'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.discover_sportstage_upcoming(integer,text)'::regprocedure),
  'upcoming discovery uses caller permissions'
);
select ok(
  not has_function_privilege('anon', 'app_private.rebuild_sportstage_upcoming_snapshots()', 'EXECUTE'),
  'signed-out clients cannot rebuild upcoming snapshots'
);
select matches(
  pg_get_functiondef('app_private.list_my_sport_following_feed(integer,timestamp with time zone)'::regprocedure),
  'resource_type = ''PLAYER''',
  'personalized live discovery includes followed players'
);
select matches(
  pg_get_functiondef('app_private.list_my_sport_following_feed(integer,timestamp with time zone)'::regprocedure),
  'resource_type = ''CLUB''',
  'personalized live discovery includes followed clubs'
);

select * from finish();
rollback;
