import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260824063335_require_account_backed_sport_match_players.sql',
), 'utf8').toLowerCase();
const scoringApi = readFileSync(resolve(__dirname, '../../../lib/supabase/sportScoringApi.ts'), 'utf8');
const setupScreen = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportMatchSetupScreen.tsx',
), 'utf8');
const competitionScreen = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportCloudCompetitionDetailScreen.tsx',
), 'utf8');

describe('account-backed non-cricket cloud scoring', () => {
  it('persists profile identity separately from immutable display snapshots', () => {
    expect(migration).toContain('create table public.sport_scoring_match_players');
    expect(migration).toContain('sport_profile_id uuid not null references public.sport_profiles');
    expect(migration).toContain('account_id uuid not null references public.profiles');
    expect(migration).toContain('display_name_snapshot text not null');
  });

  it('rejects guest and cross-sport player identities on the server', () => {
    expect(migration).toContain("profile.status = 'active'");
    expect(migration).toContain('profile.sport_id = p_sport_id');
    expect(migration).toContain('every player needs an active sportstage profile for this sport');
    expect(migration).not.toContain('p_side_a_players jsonb');
  });

  it('limits detailed standalone feeds to creators and participating accounts', () => {
    expect(migration).toContain('app_private.can_read_sport_scoring_match');
    expect(migration).toContain('player.account_id = (select auth.uid())');
    expect(migration).toContain('match.created_by = (select auth.uid())');
  });

  it('requires competition completion events to carry a fixture winner', () => {
    expect(migration).toContain('validate_sport_scoring_completion');
    expect(migration).toContain("new.payload->>'winner_entry_id'");
    expect(migration).toContain('competition completion must name one of the fixture entrants as winner');
  });

  it('wires account selection and competition fixtures to cloud scoring', () => {
    expect(setupScreen).toContain('sportRosterApi.listMatchOpponents');
    expect(setupScreen).toContain('sideAProfileIds');
    expect(setupScreen).not.toContain('placeholder="Player name"');
    expect(competitionScreen).toContain('sportScoringApi.prepareFixture');
    expect(competitionScreen).toContain('overrideTeamTieLineup');
    expect(competitionScreen).toContain('startTeamTie');
    expect(scoringApi).toContain('sport_scoring_match_players');
    expect(scoringApi).toContain('listMine(');
  });

  it('keeps all five non-cricket cloud capabilities enabled', () => {
    for (const code of ['badminton', 'tennis', 'padel', 'table_tennis', 'pickleball']) {
      expect(migration).toContain(`'${code}'`);
    }
    for (const feature of ['cloud_competitions', 'offline_scoring', 'public_live', 'follows_and_insights']) {
      expect(migration).toContain(`'${feature}'`);
    }
  });
});
