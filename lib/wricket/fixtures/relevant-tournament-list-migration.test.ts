import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260804100454_relevant_tournament_list.sql'),
  'utf8',
);

describe('relevant tournament list migration', () => {
  it('includes only owner, team, tournament-role, or followed tournaments', () => {
    expect(migration).toContain('app_private.list_relevant_tournament_ids()');
    expect(migration).toContain("then 'OWNER'");
    expect(migration).toContain("then 'MY_TEAM'");
    expect(migration).toContain("then 'TOURNAMENT_MEMBER'");
    expect(migration).toContain("else 'FOLLOWING'");
    expect(migration).toContain('public.tournament_follows follow');
  });
});
