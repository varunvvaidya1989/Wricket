import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const feed = readFileSync(resolve(
  __dirname,
  '../../../components/sports/platform/SportCloudMatchFeedScreen.tsx',
), 'utf8');
const scorer = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportCloudLiveScoreScreen.tsx',
), 'utf8');
const scoringApi = readFileSync(resolve(
  __dirname,
  '../../supabase/sportScoringApi.ts',
), 'utf8');

describe('non-cricket live feed copy and hierarchy', () => {
  it('uses player, point, and score language instead of storage terminology', () => {
    expect(feed).toContain("sportId === 'pickleball' ? 'RALLY' : 'POINT'");
    expect(feed).toContain('ScoreUnit label={matchView.unitLabel}');
    expect(feed).toContain('ScoreUnit label="CURRENT GAME"');
    expect(feed).not.toContain('EVENT {feed.currentSequence}');
    expect(feed).not.toContain('Event awarded to side');
  });

  it('relies on scoped Realtime delivery without a redundant refresh button', () => {
    expect(feed).toContain("realtimeConnected ? 'Updating live' : 'Reconnecting'");
    expect(feed).not.toContain('Refresh match feed');
    expect(feed).not.toContain('name="refresh"');
  });

  it('lets scorers classify new points using sport-appropriate details', () => {
    expect(scorer).toContain('pointDetailOptions(sportId)');
    expect(scorer).toContain('point_type: selectedPointDetail');
    expect(scorer).toContain('visible={pendingWinner !== undefined}');
    expect(scorer).toContain('setPendingWinner(winner)');
    expect(scorer).toContain('pointDetailChoiceLabel(option.value, pendingWinner, setup.sideNames)');
    expect(scorer).toContain('onPoint={choosePointWinner}');
    expect(scorer).not.toContain('POINT DETAIL');
  });

  it('loads live score snapshots for individual sport-home match rows', () => {
    expect(scoringApi).toContain("client.from('sport_public_live_snapshots')");
    expect(scoringApi).toContain('snapshotResult.data');
  });
});
