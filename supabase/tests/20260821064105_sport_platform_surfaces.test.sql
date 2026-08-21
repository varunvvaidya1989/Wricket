begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select has_column(
  'public',
  'sport_public_live_snapshots',
  'sport_id',
  'public snapshots expose the safe sport identifier needed for follows'
);
select col_not_null(
  'public',
  'sport_public_live_snapshots',
  'sport_id',
  'every public snapshot has a sport identifier'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sport_public_live_snapshots'::regclass),
  'public snapshots remain protected by RLS'
);
select hasnt_column(
  'public',
  'sport_public_live_snapshots',
  'account_id',
  'guest snapshots do not expose account identifiers'
);
select has_function(
  'public',
  'list_my_sport_statistics',
  array[]::text[],
  'authenticated unified statistics RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'public.list_my_sport_statistics()', 'EXECUTE'),
  'authenticated accounts can request their unified statistics'
);
select ok(
  not has_function_privilege('anon', 'public.list_my_sport_statistics()', 'EXECUTE'),
  'guests cannot request account statistics'
);
select ok(
  not has_function_privilege('anon', 'app_private.list_my_sport_statistics()', 'EXECUTE'),
  'guests cannot bypass the statistics gateway'
);
select is(
  (select count(*)::integer from public.sport_notifications where deep_link = '/sports'),
  0,
  'placeholder notification routes are fully migrated'
);
select matches(
  pg_get_functiondef('app_private.capture_sport_audit_operation()'::regprocedure),
  'app_route',
  'new notifications resolve their destination from the sport catalog'
);

select * from finish();
rollback;
