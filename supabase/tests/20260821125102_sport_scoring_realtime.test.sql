begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(3);

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sport_scoring_events'
  ),
  'sport scoring events are published to Supabase Realtime'
);

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sport_scoring_matches'
  ),
  'sport scoring match state is published to Supabase Realtime'
);

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sport_public_live_snapshots'
  ),
  'sport public score snapshots are published to Supabase Realtime'
);

select * from finish();
rollback;
