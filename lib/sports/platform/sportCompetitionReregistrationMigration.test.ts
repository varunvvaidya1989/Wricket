import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818121000_allow_closed_entry_reregistration.sql',
), 'utf8').toLowerCase();

describe('cloud competition re-registration migration', () => {
  it('reactivates each closed registration state without inserting a duplicate', () => {
    expect(migration.match(/status not in \('withdrawn', 'rejected', 'disqualified'\)/g)).toHaveLength(2);
    expect(migration.match(/status = 'pending'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("'entry_reregistered'");
  });

  it('clears stale decision state for a new registration attempt', () => {
    expect(migration.match(/seed = null, accepted_at = null, approved_at = null/g)).toHaveLength(2);
    expect(migration.match(/withdrawn_at = null/g)).toHaveLength(2);
  });

  it('refreshes squad identity and roster snapshots atomically', () => {
    expect(migration).toContain('update public.sport_tournament_squads set');
    expect(migration).toContain('roster_locked_at = null');
    expect(migration).toContain('delete from public.sport_squad_members');
    expect(migration).toContain('insert into public.sport_squad_members');
  });
});
