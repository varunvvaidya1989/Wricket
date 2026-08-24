import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const setup = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportMatchSetupScreen.tsx',
), 'utf8');
const cloudScoreScreen = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportCloudLiveScoreScreen.tsx',
), 'utf8');
const matchesScreen = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportMatchesScreen.tsx',
), 'utf8');
const statsScreen = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportStatsScreen.tsx',
), 'utf8');
const scoringApi = readFileSync(resolve(__dirname, '../../supabase/sportScoringApi.ts'), 'utf8');
const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260821130121_add_standalone_sport_scoring.sql',
), 'utf8');

describe('cloud sport scoring flow', () => {
  it('creates new sport matches in Supabase instead of local session storage', () => {
    expect(setup).toContain('sportScoringApi.createStandalone');
    expect(setup).not.toContain('saveScoringSession');
    expect(setup).toContain('rulesSnapshot: { initial_server: initialServer, options: rules }');
    expect(setup).toContain('<SportMatchRulesEditor');
  });

  it('replays cloud events and appends points, undo records, and completion records', () => {
    expect(cloudScoreScreen).toContain('activePointEvents(feed.events)');
    expect(cloudScoreScreen).toContain("kind: 'POINT'");
    expect(cloudScoreScreen).toContain("kind: 'UNDO'");
    expect(cloudScoreScreen).toContain("kind: 'COMPLETED'");
    expect(cloudScoreScreen).toContain('sportScoringApi.subscribe');
  });

  it('uses a protected standalone creation command and creator-scoring authorization', () => {
    expect(scoringApi).toContain("rpc('create_standalone_sport_scoring_match'");
    expect(migration).toContain('match.created_by = (select auth.uid())');
    expect(migration).toContain("and match.fixture_id is not null then");
  });

  it('derives match history and sport statistics from participating cloud match logs', () => {
    expect(matchesScreen).toContain('sportScoringApi.listMine');
    expect(matchesScreen).toContain('activePointEvents(match.events)');
    expect(matchesScreen).not.toContain('listScoringSessions');
    expect(statsScreen).toContain('sportScoringApi.listMine');
    expect(statsScreen).toContain('activePointEvents(match.events)');
    expect(statsScreen).not.toContain('listScoringSessions');
  });
});
