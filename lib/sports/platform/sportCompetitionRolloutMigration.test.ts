import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818124000_disable_cloud_competitions_rollout.sql',
), 'utf8').toLowerCase();
const componentRoot = resolve(__dirname, '../../../components/sports/scoring');

describe('cloud competition rollout correction', () => {
  it('returns every supported sport to a disabled zero-percent rollout', () => {
    expect(migration).toContain('enabled = false');
    expect(migration).toContain('rollout_percentage = 0');
    for (const code of ['tennis', 'badminton', 'padel', 'table_tennis', 'pickleball']) {
      expect(migration).toContain(`'${code}'`);
    }
  });

  it.each([
    'SportCompetitionsScreen.tsx',
    'SportCloudCompetitionDetailScreen.tsx',
    'SportSearchScreen.tsx',
    'SportShell.tsx',
  ])('gates cloud API entry path %s', fileName => {
    const source = readFileSync(resolve(componentRoot, fileName), 'utf8');
    expect(source).toContain("useSportFeatureFlag(");
    expect(source).toContain("'cloud_competitions'");
    expect(source).toContain('cloudCompetitions.enabled');
  });

  it('renders a non-error unavailable state for disabled direct routes', () => {
    const source = readFileSync(resolve(componentRoot, 'SportCloudCompetitionDetailScreen.tsx'), 'utf8');
    expect(source).toContain('SportCloudCompetitionUnavailable');
  });
});
