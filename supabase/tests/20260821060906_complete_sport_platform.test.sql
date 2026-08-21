begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(36);

select has_table('public', 'sport_competition_standings', 'standings table exists');
select has_table('public', 'sport_player_statistics', 'player statistics table exists');
select has_table('public', 'sport_partnership_statistics', 'partnership statistics table exists');
select has_table('public', 'sport_result_revisions', 'result revisions table exists');
select has_table('public', 'sport_manual_progressions', 'manual progression table exists');
select has_table('public', 'sport_public_live_snapshots', 'public snapshot table exists');
select has_table('public', 'sport_follows', 'follows table exists');
select has_table('public', 'sport_public_player_cards', 'public player cards table exists');
select has_table('public', 'sport_notifications', 'notifications table exists');
select has_table('public', 'sport_operational_events', 'operational events table exists');
select has_table('public', 'sport_support_actions', 'support actions table exists');
select has_table('public', 'sport_retention_policies', 'retention table exists');
select has_table('public', 'sport_recovery_checkpoints', 'recovery table exists');
select has_table('public', 'sport_rollout_plans', 'rollout table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.sport_competition_standings'::regclass), 'standings RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sport_player_statistics'::regclass), 'statistics RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sport_public_live_snapshots'::regclass), 'public snapshots RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sport_follows'::regclass), 'follows RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sport_notifications'::regclass), 'notifications RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sport_operational_events'::regclass), 'operations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sport_rollout_plans'::regclass), 'rollout RLS enabled');

select has_function('public', 'rebuild_sport_competition_projections', array['uuid']);
select has_function('public', 'rebuild_sport_player_statistics', array['uuid']);
select has_function('public', 'correct_sport_scoring_result', array['uuid','uuid','text']);
select has_function('public', 'record_sport_manual_progression', array['uuid','uuid','text','text']);
select has_function('public', 'discover_sport_public_live', array['text','integer','timestamp with time zone']);
select has_function('public', 'set_sport_follow', array['text','uuid','uuid','boolean']);
select has_function('public', 'list_my_sport_following_feed', array['integer','timestamp with time zone']);
select has_function('public', 'set_my_sport_public_player_card', array['uuid','boolean','text']);
select has_function('public', 'mark_sport_notification_read', array['uuid']);
select has_function('public', 'execute_sport_support_action', array['uuid','text','text']);

select ok(has_table_privilege('anon', 'public.sport_public_live_snapshots', 'SELECT'), 'guests can select public snapshots');
select ok(not has_table_privilege('anon', 'public.sport_scoring_events', 'SELECT'), 'guests cannot read scoring events');
select ok(not has_table_privilege('authenticated', 'public.sport_operational_events', 'SELECT'), 'clients cannot read operational telemetry');
select ok(not has_table_privilege('authenticated', 'public.sport_notifications', 'INSERT'), 'clients cannot insert notifications');
select ok(not has_table_privilege('authenticated', 'public.sport_competition_standings', 'UPDATE'), 'clients cannot alter standings');

select * from finish();
rollback;
