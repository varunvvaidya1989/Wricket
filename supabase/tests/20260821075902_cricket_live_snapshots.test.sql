begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

set local role anon;
select lives_ok(
  $$select * from public.discover_cricket_live(20, null)$$,
  'signed-out cricket discovery executes successfully'
);
reset role;

select has_table(
  'public',
  'cricket_live_snapshots',
  'cricket landing snapshots exist'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.cricket_live_snapshots'::regclass),
  'cricket landing snapshots use RLS'
);
select hasnt_column(
  'public',
  'cricket_live_snapshots',
  'account_id',
  'cricket landing snapshots do not contain account identifiers'
);
select hasnt_column(
  'public',
  'cricket_live_snapshots',
  'scorecard',
  'cricket landing snapshots do not expose detailed scorecards'
);
select ok(
  has_table_privilege('anon', 'public.cricket_live_snapshots', 'SELECT'),
  'signed-out clients can read cricket landing snapshots'
);
select has_function(
  'public',
  'discover_cricket_live',
  array['integer', 'timestamp with time zone'],
  'cricket landing discovery function exists'
);
select ok(
  has_function_privilege('anon', 'public.discover_cricket_live(integer,timestamp with time zone)', 'EXECUTE'),
  'signed-out clients can request cricket landing scores'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.discover_cricket_live(integer,timestamp with time zone)'::regprocedure),
  'the exposed cricket discovery function uses caller permissions'
);
select ok(
  not has_function_privilege('anon', 'app_private.refresh_cricket_live_snapshot(uuid)', 'EXECUTE'),
  'signed-out clients cannot invoke cricket projection maintenance'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.matches'::regclass),
  'legacy cricket match reads remain constrained by RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.match_events'::regclass),
  'legacy cricket event reads remain constrained by RLS'
);

select * from finish();
rollback;
