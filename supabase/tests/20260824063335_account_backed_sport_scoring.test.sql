begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

select has_table('public', 'sport_scoring_match_players', 'match-player identity table exists');
select has_column('public', 'sport_scoring_match_players', 'sport_profile_id', 'sport profile identity is persisted');
select has_column('public', 'sport_scoring_match_players', 'account_id', 'SportStage account identity is persisted');
select col_not_null('public', 'sport_scoring_match_players', 'sport_profile_id', 'guest players cannot be persisted');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sport_scoring_match_players'::regclass),
  'match player identities are protected by RLS'
);
select has_function(
  'public', 'create_standalone_sport_scoring_match',
  array['text', 'text', 'uuid[]', 'uuid[]', 'jsonb'],
  'standalone matches accept profile ids rather than names'
);
select has_function(
  'public', 'prepare_sport_fixture_scoring', array['uuid', 'uuid', 'jsonb'],
  'competition fixtures have an account-backed scoring command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_standalone_sport_scoring_match(text,text,uuid[],uuid[],jsonb)',
    'EXECUTE'
  ),
  'authenticated accounts can create account-backed standalone matches'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_standalone_sport_scoring_match(text,text,uuid[],uuid[],jsonb)',
    'EXECUTE'
  ),
  'anonymous clients cannot create scoring matches'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.add_sport_scoring_match_players(uuid,uuid,uuid[],uuid[],integer)',
    'EXECUTE'
  ),
  'clients cannot bypass the trusted match-player command'
);
select matches(
  pg_get_functiondef('app_private.can_read_sport_scoring_match(uuid)'::regprocedure),
  'player.account_id',
  'detailed feeds authorize participating accounts'
);
select matches(
  pg_get_functiondef('app_private.validate_sport_scoring_completion()'::regprocedure),
  'winner_entry_id',
  'competition completion events require an entrant winner'
);

select * from finish();
rollback;
