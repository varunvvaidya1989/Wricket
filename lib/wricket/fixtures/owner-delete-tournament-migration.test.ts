import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260804170445_owner_delete_tournament_cascade.sql'),
  'utf8',
);

describe('owner tournament deletion migration', () => {
  it('checks ownership inside the privileged deletion function', () => {
    expect(migration).toContain('app_private.delete_owned_tournament(p_tournament_id uuid)');
    expect(migration).toContain('tournament.created_by = (select auth.uid())');
    expect(migration).toContain("raise exception 'Only the tournament owner can delete this tournament'");
  });

  it('removes restrictive references before teams and the tournament', () => {
    const fixtures = migration.indexOf('delete from public.fixture_stages');
    const matches = migration.indexOf('delete from public.matches');
    const teams = migration.indexOf('delete from public.teams');
    const tournament = migration.indexOf('delete from public.tournaments');

    expect(fixtures).toBeGreaterThan(-1);
    expect(fixtures).toBeLessThan(matches);
    expect(matches).toBeLessThan(teams);
    expect(teams).toBeLessThan(tournament);
  });

  it('allows the owner to clean up tournament and moment storage', () => {
    expect(migration).toContain('tournament_media_delete_own');
    expect(migration).toContain('moment_objects_delete_tournament_owner');
    expect(migration).toContain('app_private.list_owned_tournament_media_paths');
  });
});
