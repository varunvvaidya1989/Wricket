import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260725074248_unify_fixtures_with_matches.sql',
  ),
  'utf8',
);

describe('canonical fixture match migration', () => {
  it('links every playable fixture to one canonical match and backfills existing rows', () => {
    expect(migration).toContain('fixture_match_id uuid unique');
    expect(migration).toContain('create_match_after_fixture_insert');
    expect(migration).toContain('where fixture.team_b_id is not null');
    expect(migration).toContain('on conflict (fixture_match_id) do nothing');
  });

  it('keeps lifecycle status synchronized during the transition', () => {
    expect(migration).toContain('sync_fixture_status_to_match_after_update');
    expect(migration).toContain('sync_match_status_to_fixture_after_update');
    expect(migration).toContain("when 'IN_PROGRESS' then 'LIVE'");
  });

  it('keeps security-definer trigger functions outside the exposed schema', () => {
    expect(migration).toContain('function app_private.create_match_for_fixture()');
    expect(migration).toContain(
      'revoke all on function app_private.create_match_for_fixture() from public, anon, authenticated',
    );
  });
});
