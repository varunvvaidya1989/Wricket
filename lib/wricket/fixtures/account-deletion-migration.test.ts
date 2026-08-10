import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260806091415_account_deletion.sql'),
  'utf8',
).toLowerCase();

describe('SportStage account deletion migration', () => {
  it('requires authentication and an explicit destructive confirmation', () => {
    expect(migration).toContain("if account_id_value is null then raise exception 'authentication is required'");
    expect(migration).toContain("if p_confirmation <> 'delete'");
  });

  it('clears restrictive owned data before deleting the auth identity', () => {
    expect(migration.indexOf('perform app_private.delete_owned_tournament')).toBeLessThan(migration.indexOf('delete from auth.users'));
    expect(migration.indexOf('delete from public.match_moments')).toBeLessThan(migration.indexOf('delete from auth.users'));
    expect(migration.indexOf('delete from public.tournament_scorers')).toBeLessThan(migration.indexOf('delete from auth.users'));
  });
});
