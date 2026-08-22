do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sport_scoring_events'
  ) then
    alter publication supabase_realtime add table public.sport_scoring_events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sport_scoring_matches'
  ) then
    alter publication supabase_realtime add table public.sport_scoring_matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sport_public_live_snapshots'
  ) then
    alter publication supabase_realtime add table public.sport_public_live_snapshots;
  end if;
end;
$$;
