import { describe, expect, it } from 'vitest';

import {
  canEnforceFollowOn,
  followOnThresholdForOvers,
  scoreAtLegalBalls,
  testMatchSituation,
} from './test-match';

const names: Record<string, string> = { a: 'Team A', b: 'Team B' };
const teamName = (id: string) => names[id];

describe('Test-match situation', () => {
  it('reports the first-innings deficit and exact runs needed to avoid the follow-on', () => {
    expect(testMatchSituation({
      format: 'TURF_TEST', followOnEnabled: true, oversPerInnings: 90,
      currentInnings: { id: 'i2', sequence: 2, battingTeamId: 'b' }, currentRuns: 150,
      innings: [
        { id: 'i1', sequence: 1, battingTeamId: 'a', totalRuns: 400, totalBalls: 600 },
        { id: 'i2', sequence: 2, battingTeamId: 'b', totalRuns: 150, totalBalls: 300 },
      ], teamName,
    })).toEqual({
      positionText: 'Team B trail by 250 runs',
      followOnText: 'Team B need 51 more runs to avoid the follow-on',
    });
    expect(canEnforceFollowOn(400, 200, 200)).toBe(true);
    expect(canEnforceFollowOn(400, 201, 200)).toBe(false);
  });

  it('uses a 25-run deficit for Tests shorter than 10 overs', () => {
    expect(followOnThresholdForOvers(9)).toBe(25);
    expect(followOnThresholdForOvers(10)).toBe(200);
    expect(followOnThresholdForOvers(90)).toBe(200);
    expect(canEnforceFollowOn(40, 15, 25)).toBe(true);
    expect(canEnforceFollowOn(40, 16, 25)).toBe(false);
  });

  it('does not allow a traditional follow-on when the first innings is below 200', () => {
    expect(canEnforceFollowOn(199, 0, 200)).toBe(false);
  });

  it('uses aggregate scores during a follow-on innings', () => {
    expect(testMatchSituation({
      format: 'TURF_TEST', followOnEnabled: true, oversPerInnings: 90,
      currentInnings: { id: 'i3', sequence: 3, battingTeamId: 'b' }, currentRuns: 175,
      innings: [
        { id: 'i1', sequence: 1, battingTeamId: 'a', totalRuns: 450, totalBalls: 600 },
        { id: 'i2', sequence: 2, battingTeamId: 'b', totalRuns: 200, totalBalls: 400 },
        { id: 'i3', sequence: 3, battingTeamId: 'b', totalRuns: 175, totalBalls: 300, isFollowOn: true },
      ], teamName,
    }).positionText).toBe('Team B trail by 75 runs');
  });
});

describe('same-over comparison', () => {
  it('replays runs only through the requested legal-ball mark', () => {
    const events = [
      { kind: 'BALL_RECORDED', sequence: 1, payload: { innings_id: 'i1', runs_bat: 1, runs_extra: 0, is_legal: true } },
      { kind: 'BALL_RECORDED', sequence: 2, payload: { innings_id: 'i1', runs_bat: 0, runs_extra: 1, is_legal: false } },
      { kind: 'BALL_RECORDED', sequence: 3, payload: { innings_id: 'i1', runs_bat: 4, runs_extra: 0, is_legal: true } },
      { kind: 'BALL_RECORDED', sequence: 4, payload: { innings_id: 'i1', runs_bat: 6, runs_extra: 0, is_legal: true } },
    ];
    expect(scoreAtLegalBalls(events, 'i1', 2)).toBe(6);
  });
});
