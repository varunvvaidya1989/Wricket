import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const setup = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportMatchSetupScreen.tsx',
), 'utf8');
const rosterApi = readFileSync(resolve(__dirname, '../../supabase/sportRosterApi.ts'), 'utf8');
const migrations = [
  readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260824074331_require_creator_and_list_sport_match_opponents.sql',
  ), 'utf8'),
  readFileSync(resolve(
    __dirname,
    '../../../supabase/migrations/20260824074925_fix_same_sport_match_opponent_functions.sql',
  ), 'utf8'),
  readFileSync(resolve(
    __dirname,
    '../../../supabase/migrations/20260824075120_restore_sport_scoring_command_execution.sql',
  ), 'utf8'),
].join('\n').toLowerCase();

describe('same-sport match opponent selection', () => {
  it('lets the signed-in player choose any slot from the same player picker', () => {
    expect(setup).toContain('setSelfPlayer({');
    expect(setup).toContain('selfPlayer ? [selfPlayer, ...results] : results');
    expect(setup).toContain("player.accountId === auth.session?.user.id ? 'YOU' : 'SELECT'");
    expect(setup).not.toContain('if (slot === 0) return');
    expect(setup).toContain('openPlayerPicker(slot)');
    expect(setup).toContain('<Modal visible={playerPickerOpen}');
    expect(setup).toContain('sportRosterApi.listMatchOpponents');
    expect(setup).toContain('title="Start scoring"');
    expect(setup).not.toContain('Start cloud scoring');
    expect(setup).not.toContain("'Please try again.'");
  });

  it('loads the current sport profile without an embedded relationship query', () => {
    expect(rosterApi).toContain("client.from('sports')");
    expect(rosterApi).toContain("client.from('sport_profiles')");
    expect(rosterApi).toContain(".eq('sport_id', sport.id)");
    expect(rosterApi).not.toContain("select('id, sport_id, sports!inner(code)')");
  });

  it('lists only active accounts in the same sport and excludes the requester', () => {
    expect(rosterApi).toContain('listMatchOpponents');
    expect(migrations).toContain("account_sport.access_status = 'active'");
    expect(migrations).toContain("profile.status = 'active'");
    expect(migrations).toContain('profile.sport_id = requester.sport_id');
    expect(migrations).toContain('profile.account_id <> (select auth.uid())');
  });

  it('requires the match creator to be one of the selected players', () => {
    expect(setup).toContain('players[slot]?.accountId === auth.session?.user.id');
    expect(setup).toContain('Select yourself in one of the player slots.');
    expect(migrations).toContain('p_side_a_profile_ids || p_side_b_profile_ids');
    expect(migrations).toContain('profile.account_id = (select auth.uid())');
    expect(migrations).toContain('you must be one of the players in a standalone match');
    expect(migrations).toContain(
      'grant execute on function app_private.create_standalone_sport_scoring_match(',
    );
  });
});
