import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260822140613_scope_sportstage_upcoming_snapshot_cleanup.sql'),
  'utf8',
);

describe('SportStage upcoming snapshot cleanup migration', () => {
  it('uses a predicate when rebuilding snapshots from a trigger', () => {
    expect(migration).toContain('delete from public.sportstage_upcoming_snapshots where discovery_id is not null');
    expect(migration).not.toContain('delete from public.sportstage_upcoming_snapshots;');
  });
});
