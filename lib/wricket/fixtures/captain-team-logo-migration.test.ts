import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260805080739_captain_update_team_logo.sql'),
  'utf8',
);

describe('captain team logo migration', () => {
  it('limits captain updates to the dedicated logo function', () => {
    expect(migration).toContain('drop policy if exists "captains_update_team"');
    expect(migration).toContain('app_private.update_team_logo');
    expect(migration).toContain("member.role = 'CAPTAIN'");
    expect(migration).toContain("member.status = 'ACTIVE'");
    expect(migration).toContain('update public.teams set logo_url');
  });
});
