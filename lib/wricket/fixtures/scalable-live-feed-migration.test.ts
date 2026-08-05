import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260804094943_scalable_tournament_discovery_and_live_feed.sql'),
  'utf8',
);

describe('scalable tournament discovery and live feed migration', () => {
  it('secures tournament follows with RLS and account indexes', () => {
    expect(migration).toContain('create table public.tournament_follows');
    expect(migration).toContain('alter table public.tournament_follows enable row level security');
    expect(migration).toContain('tournament_follows_account_status_idx');
    expect(migration).toContain('account_id = (select auth.uid())');
  });

  it('limits live matches to relevant tournament relationships', () => {
    expect(migration).toContain('app_private.list_eligible_live_matches');
    expect(migration).toContain("then 'OWNER'");
    expect(migration).toContain("then 'MY_TEAM'");
    expect(migration).toContain("then 'TOURNAMENT_MEMBER'");
    expect(migration).toContain("else 'FOLLOWING'");
    expect(migration).toContain('limit least(greatest(p_limit, 1), 20)');
  });

  it('uses one batched recent-event function instead of per-match client queries', () => {
    expect(migration).toContain('app_private.list_recent_live_events(p_match_ids uuid[])');
    expect(migration).toContain('from unnest(p_match_ids)');
    expect(migration).toContain('cross join lateral');
  });

  it('adds indexed tournament discovery', () => {
    expect(migration).toContain('pg_trgm');
    expect(migration).toContain('tournaments_name_trgm_idx');
    expect(migration).toContain('app_private.search_tournaments');
  });
});
