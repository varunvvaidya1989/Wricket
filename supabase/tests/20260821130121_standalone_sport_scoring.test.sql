begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select has_function(
  'public',
  'create_standalone_sport_scoring_match',
  array['text', 'text', 'jsonb', 'jsonb', 'jsonb'],
  'authenticated clients can create a standalone sport scoring match through an RPC'
);
select has_function(
  'app_private',
  'create_standalone_sport_scoring_match',
  array['text', 'text', 'jsonb', 'jsonb', 'jsonb'],
  'standalone scoring creation remains implemented in the private schema'
);
select has_function(
  'app_private',
  'can_score_sport_scoring_match',
  array['uuid'],
  'the scorer authorization function remains available to lease and append commands'
);
select ok(
  has_function_privilege('authenticated', 'public.create_standalone_sport_scoring_match(text,text,jsonb,jsonb,jsonb)', 'EXECUTE'),
  'authenticated clients can execute standalone scoring setup'
);
select ok(
  not has_function_privilege('anon', 'public.create_standalone_sport_scoring_match(text,text,jsonb,jsonb,jsonb)', 'EXECUTE'),
  'guests cannot create standalone scoring matches'
);
select ok(
  (select prosecdef from pg_proc where oid = 'app_private.create_standalone_sport_scoring_match(text,text,jsonb,jsonb,jsonb)'::regprocedure),
  'standalone scoring setup uses the private security-definer command'
);

select * from finish();
rollback;
