import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260820140721_add_team_tie_lineups.sql',
), 'utf8').toLowerCase();

describe('team-tie lineup migration', () => {
  it('stores captain-submitted lineup snapshots below an ordered team-tie match', () => {
    expect(migration).toContain('create table public.sport_fixture_match_lineups');
    expect(migration).toContain('create table public.sport_fixture_match_lineup_players');
    expect(migration).toContain('unique (fixture_match_id, entry_id)');
    expect(migration).toContain("match_format in ('singles', 'doubles', 'mixed_doubles')");
  });

  it('authorizes captains against approved locked tournament squad members', () => {
    expect(migration).toContain('selected_squad.roster_locked_at is null');
    expect(migration).toContain('selected_squad.captain_account_id <> (select auth.uid())');
    expect(migration).toContain("member.status = 'approved'");
  });

  it('enforces lineup shape, participation limits, and optimistic revisions on the server', () => {
    expect(migration).toContain('count(distinct id)');
    expect(migration).toContain('max_rubbers_per_player');
    expect(migration).toContain('allow_singles_and_doubles');
    expect(migration).toContain('lineup version is out of date');
  });

  it('uses RLS and exposes only the authenticated submission command', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('can_read_sport_competition');
    expect(migration).toContain('revoke all on public.sport_competition_team_tie_rules');
    expect(migration).toContain('grant execute on function public.submit_sport_team_tie_lineup');
  });
});
