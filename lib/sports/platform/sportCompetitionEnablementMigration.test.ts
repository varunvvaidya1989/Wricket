import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818133000_enable_cloud_competitions.sql',
), 'utf8').toLowerCase();

describe('cloud competition enablement migration', () => {
  it('enables the complete rollout for every supported non-cricket sport', () => {
    expect(migration).toContain('set enabled = true, rollout_percentage = 100');
    for (const sport of ['tennis', 'badminton', 'padel', 'table_tennis', 'pickleball']) {
      expect(migration).toContain(`'${sport}'`);
    }
  });

  it('fails migration application when any expected flag is missing', () => {
    expect(migration).toContain("raise exception 'cloud competition flags are missing for one or more supported sports'");
    expect(migration).toContain(') <> 5 then');
  });
});
