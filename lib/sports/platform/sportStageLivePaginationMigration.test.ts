import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260824053150_add_paginated_sportstage_live_discovery.sql'),
  'utf8',
).toLowerCase();

describe('SportStage live pagination migration', () => {
  it('combines cricket and other sports while returning only live snapshots', () => {
    expect(source).toContain('from public.sport_public_live_snapshots');
    expect(source).toContain('from public.cricket_live_snapshots');
    expect(source.match(/where snapshot.status = 'live'/g)).toHaveLength(2);
    expect(source).toContain('union all');
  });

  it('uses a deterministic bounded keyset cursor', () => {
    expect(source).toContain('(snapshot.refreshed_at, snapshot.scoring_match_id) < (p_before, p_before_match_id)');
    expect(source).toContain('order by snapshot.refreshed_at desc, snapshot.scoring_match_id desc');
    expect(source).toContain('limit least(greatest(p_limit, 1), 50)');
  });

  it('runs with caller permissions and grants only explicit execution', () => {
    expect(source).toContain('security invoker');
    expect(source).toContain('revoke all on function public.discover_sportstage_live');
    expect(source).toContain('grant execute on function public.discover_sportstage_live');
  });
});
