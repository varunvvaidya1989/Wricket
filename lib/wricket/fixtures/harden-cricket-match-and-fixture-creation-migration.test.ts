import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260822125242_harden_cricket_match_and_fixture_creation.sql'),
  'utf8',
);

describe('hardened cricket match and fixture creation migration', () => {
  it('keeps match creation behind an authenticated, owner-aware private function', () => {
    expect(migration).toContain('function app_private.create_owned_match(');
    expect(migration).toContain('app_private.is_standalone_team_eligible');
    expect(migration).toContain("raise exception 'Only tournament staff can create a tournament match'");
  });

  it('validates and writes fixture batches through the private owner function', () => {
    expect(migration).toContain('function app_private.upsert_owned_fixture_matches(');
    expect(migration).toContain("raise exception 'Only the tournament owner can create fixtures'");
    expect(migration).toContain('on conflict (stage_id, round_id, team_a_id, team_b_id, leg) do nothing');
  });

  it('exposes invoker wrappers only to authenticated users', () => {
    expect(migration).toContain('function public.create_owned_match(');
    expect(migration).toContain('function public.upsert_owned_fixture_matches(');
    expect(migration).toContain('grant execute on function public.create_owned_match');
    expect(migration).toContain('grant execute on function public.upsert_owned_fixture_matches');
  });
});
