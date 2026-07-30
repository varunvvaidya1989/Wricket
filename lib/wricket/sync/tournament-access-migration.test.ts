import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260730173042_make_tournaments_readable_to_all_users.sql',
  ),
  'utf8',
);

describe('tournament public-to-users access migration', () => {
  it.each([
    'tournaments',
    'teams',
    'team_players',
    'players',
    'matches',
    'match_events',
    'match_snapshots',
    'match_xis',
    'match_innings',
    'fixture_stages',
    'fixture_groups',
    'fixture_matches',
    'knockout_brackets',
    'fixture_tie_resolutions',
    'match_mvp_results',
  ])('makes %s readable to every authenticated user', table => {
    expect(migration).toContain(`on public.${table} for select`);
    expect(migration).toMatch(
      new RegExp(`on public\\.${table} for select\\s+to authenticated\\s+using \\(true\\)`),
    );
  });

  it('does not introduce broad write policies', () => {
    expect(migration).not.toMatch(/for (insert|update|delete|all)/i);
    expect(migration).not.toContain('to anon');
  });
});
