import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818120000_restrict_competition_entry_visibility.sql',
), 'utf8').toLowerCase();

describe('cloud competition entry privacy migration', () => {
  it('exposes approved entries while preserving manager and controller access', () => {
    expect(migration).toContain('function app_private.can_read_sport_entry');
    expect(migration).toContain("entry.status = 'approved'");
    expect(migration).toContain('app_private.can_control_sport_entry(entry.id)');
    expect(migration).toContain('app_private.can_read_sport_competition(entry.competition_id)');
  });

  it('applies entry-level authorization to every registration detail table', () => {
    expect(migration).toContain('using ((select app_private.can_read_sport_entry(id)))');
    expect(migration.match(/using \(\(select app_private\.can_read_sport_entry\(entry_id\)\)\)/g)).toHaveLength(2);
    expect(migration).toContain('using ((select app_private.can_read_sport_entry(squad_entry_id)))');
  });

  it('does not expose the private helper to anonymous clients', () => {
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to authenticated');
    expect(migration).not.toContain('to anon');
  });
});
