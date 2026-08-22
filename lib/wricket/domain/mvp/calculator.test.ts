import { describe, expect, it } from 'vitest';

import { aggregateTournamentMvp, calculateMatchMvp, getMatchMvpAwards } from './calculator';
import { battingPositionBand, DEFAULT_MVP_CONFIG, valueForMatchLength } from './config';
import type { MatchMvpInput, MvpDelivery } from './types';

const participants = [
  { playerId: 'a1', teamId: 'a', battingPosition: 1, teamSize: 3 },
  { playerId: 'a2', teamId: 'a', battingPosition: 2, teamSize: 3 },
  { playerId: 'a3', teamId: 'a', battingPosition: 3, teamSize: 3 },
  { playerId: 'b1', teamId: 'b', battingPosition: 1, teamSize: 3 },
  { playerId: 'b2', teamId: 'b', battingPosition: 2, teamSize: 3 },
  { playerId: 'b3', teamId: 'b', battingPosition: 3, teamSize: 3 },
] as const;

function delivery(input: Partial<MvpDelivery> = {}): MvpDelivery {
  return {
    inningsId: 'i1', strikerId: 'a1', bowlerId: 'b1', runsBat: 0,
    runsExtra: 0, extraKind: null, isLegal: true, ...input,
  };
}

function match(deliveries: readonly MvpDelivery[], overrides: Partial<MatchMvpInput> = {}): MatchMvpInput {
  return {
    matchId: 'm1', format: 'T20', scheduledOvers: 20, status: 'COMPLETED',
    result: { kind: 'WIN_BY_RUNS', winnerTeamId: 'a', margin: 1, marginUnit: 'RUNS' },
    participants,
    innings: [{ id: 'i1', battingTeamId: 'a', bowlingTeamId: 'b', deliveries }],
    calculatedAt: '2026-07-30T00:00:00.000Z', ...overrides,
  };
}

describe('MVP configuration', () => {
  it('maps every non-standard batting position to one proportional band', () => {
    expect([1, 2, 3, 4, 5, 6].map(position => battingPositionBand(position, 6)))
      .toEqual(['top', 'top', 'middle', 'middle', 'lower', 'lower']);
  });
  it('selects match-length and Test factors', () => {
    expect(valueForMatchLength(DEFAULT_MVP_CONFIG.bowling.baseRunsPerWicketByOvers, 20, 'T20')).toBe(18);
    expect(valueForMatchLength(DEFAULT_MVP_CONFIG.batting.performanceFactorByOvers, 50, 'ODI')).toBe(0.04);
    expect(valueForMatchLength(DEFAULT_MVP_CONFIG.batting.performanceFactorByOvers, 90, 'TURF_TEST')).toBe(0.02);
  });
});

describe('batting MVP', () => {
  it('uses bat runs only and rewards faster-than-team batting after the minimum sample', () => {
    const result = calculateMatchMvp(match([
      delivery({ runsBat: 4 }), delivery({ runsBat: 4 }), delivery({ runsBat: 2 }),
      delivery({ strikerId: 'a2', runsBat: 0 }), delivery({ strikerId: 'a2', runsBat: 0 }),
      delivery({ strikerId: 'a2', runsBat: 1, runsExtra: 1, extraKind: 'NO_BALL', isLegal: false }),
      delivery({ strikerId: 'a2', runsExtra: 1, extraKind: 'WIDE', isLegal: false }),
    ]));
    const fast = result.rankings.find(row => row.playerId === 'a1')!;
    const slow = result.rankings.find(row => row.playerId === 'a2')!;
    expect(fast.battingBreakdown.basePoints).toBe(1);
    expect(fast.battingBreakdown.strikeRateBonus).toBeGreaterThan(0);
    expect(slow.battingBreakdown.strikeRateBonus).toBe(0);
    expect(slow.battingBreakdown.legalBalls).toBe(2);
  });
  it('guards zero balls, zero team rate, and the minimum-ball threshold', () => {
    const result = calculateMatchMvp(match([delivery({ runsBat: 0 })]));
    expect(result.rankings.every(row => Number.isFinite(row.totalPoints))).toBe(true);
    expect(result.rankings.find(row => row.playerId === 'a1')?.battingBreakdown.strikeRateBonus).toBe(0);
  });
});

describe('bowling and fielding MVP', () => {
  it('values top/middle/lower wickets, gives the bowler full assisted value, and applies only highest haul bonus', () => {
    const wickets = (['a1', 'a2', 'a3'] as const).map(outPlayerId => delivery({
      wicket: { kind: 'CAUGHT', outPlayerId, creditedToBowler: true, fielders: ['b2'] },
    }));
    const result = calculateMatchMvp(match(wickets));
    const bowler = result.rankings.find(row => row.playerId === 'b1')!;
    const fielder = result.rankings.find(row => row.playerId === 'b2')!;
    expect(bowler.bowlingBreakdown.wickets).toBe(3);
    expect(bowler.bowlingBreakdown.wicketPoints).toBeCloseTo(4.32); // 1.8 + 1.44 + 1.08
    expect(bowler.bowlingBreakdown.wicketHaulBonus).toBe(0.5);
    expect(fielder.fieldingBreakdown.catchPoints).toBeCloseTo(0.864);
  });
  it('does not credit run-outs to the bowler and splits assisted fielding value', () => {
    const result = calculateMatchMvp(match([delivery({
      wicket: { kind: 'RUN_OUT', outPlayerId: 'a1', creditedToBowler: false, fielders: ['b2', 'b3'] },
    })]));
    expect(result.rankings.find(row => row.playerId === 'b1')?.bowlingBreakdown.wickets).toBe(0);
    expect(result.rankings.find(row => row.playerId === 'b2')?.fieldingPoints).toBeCloseTo(0.9);
    expect(result.rankings.find(row => row.playerId === 'b3')?.fieldingPoints).toBeCloseTo(0.9);
  });
  it('awards caught-and-bowled in both roles and handles direct-hit/stumping', () => {
    const result = calculateMatchMvp(match([
      delivery({ wicket: { kind: 'CAUGHT', outPlayerId: 'a1', creditedToBowler: true, fielders: ['b1'] } }),
      delivery({ wicket: { kind: 'STUMPED', outPlayerId: 'a2', creditedToBowler: true, fielders: ['b2'] } }),
      delivery({ wicket: { kind: 'RUN_OUT', outPlayerId: 'a3', creditedToBowler: false, fielders: ['b3'], directHit: true } }),
    ]));
    expect(result.rankings.find(row => row.playerId === 'b1')?.fieldingBreakdown.catches).toBe(1);
    expect(result.rankings.find(row => row.playerId === 'b2')?.fieldingBreakdown.stumpings).toBe(1);
    expect(result.rankings.find(row => row.playerId === 'b3')?.fieldingBreakdown.directHitRunOuts).toBe(1);
  });
  it('rewards qualifying efficient bowling without dividing by zero or penalizing expense', () => {
    const balls = [
      ...Array.from({ length: 6 }, () => delivery({ bowlerId: 'b1', runsBat: 0 })),
      ...Array.from({ length: 6 }, () => delivery({ bowlerId: 'b2', runsBat: 2 })),
    ];
    const result = calculateMatchMvp(match(balls));
    expect(result.rankings.find(row => row.playerId === 'b1')?.bowlingBreakdown.performanceBonus).toBe(0);
    expect(result.rankings.find(row => row.playerId === 'b2')?.bowlingBreakdown.performanceBonus).toBe(0);
    expect(result.rankings.every(row => Number.isFinite(row.totalPoints))).toBe(true);
  });
  it('calculates maiden bonuses and innings-specific wicket milestones', () => {
    const innings = [1, 2].map(sequence => ({
      id: `i${sequence}`, battingTeamId: 'a', bowlingTeamId: 'b',
      deliveries: Array.from({ length: 6 }, (_, index) => delivery({
        inningsId: `i${sequence}`,
        wicket: index < 3
          ? { kind: 'BOWLED', outPlayerId: participants[index].playerId, creditedToBowler: true, fielders: [] }
          : undefined,
      })),
    }));
    const row = calculateMatchMvp(match([], { innings })).rankings.find(item => item.playerId === 'b1')!;
    expect(row.bowlingBreakdown.wicketHaulBonus).toBe(1);
    expect(row.bowlingBreakdown.maidenBonus).toBe(1.8);
  });
});

describe('awards, rankings, and aggregation', () => {
  it('uses the top MVP row as Player of the Match, regardless of team', () => {
    const result = calculateMatchMvp(match([
      delivery({ strikerId: 'a1', runsBat: 4 }),
      ...(['a1', 'a2', 'a3'] as const).map(outPlayerId => delivery({
        wicket: { kind: 'CAUGHT', outPlayerId, creditedToBowler: true, fielders: ['b2'] },
      })),
    ]));
    expect(result.rankings[0].playerId).toBe('b1');
    expect(result.playerOfTheMatchId).toBe(result.rankings[0].playerId);
    expect(result.rankings.find(row => row.isPlayerOfTheMatch)?.teamId).toBe('b');
    expect(getMatchMvpAwards(result).bestBatter?.playerId).toBe('a1');
    expect(getMatchMvpAwards(result).bestBowler?.playerId).toBe('b1');
    expect(getMatchMvpAwards(result).bestFielder?.playerId).toBe('b2');
  });
  it('skips awards for no-result and fighter for ties', () => {
    const result = calculateMatchMvp(match([delivery({ runsBat: 6 })], {
      result: { kind: 'NO_RESULT' },
    }));
    expect(result.playerOfTheMatchId).toBeUndefined();
    expect(result.fighterOfTheMatchId).toBeUndefined();
  });
  it('is deterministic for exact ties', () => {
    const result = calculateMatchMvp(match([]));
    expect(result.rankings.map(row => row.playerId)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
    expect(result.rankings.every(row => row.rank === 1)).toBe(true);
  });
  it('aggregates versions and multiple teams without double-counting a replacement match', () => {
    const first = calculateMatchMvp(match([delivery({ runsBat: 4 })]));
    const second = calculateMatchMvp(match([delivery({ strikerId: 'a1', runsBat: 6 })], { matchId: 'm2' }));
    const rows = aggregateTournamentMvp([first, second]);
    const a1 = rows.find(row => row.playerId === 'a1')!;
    expect(a1.matchesPlayed).toBe(2);
    expect(a1.totalPoints).toBeCloseTo(
      first.rankings.find(row => row.playerId === 'a1')!.totalPoints +
      second.rankings.find(row => row.playerId === 'a1')!.totalPoints,
    );
    expect(a1.algorithmVersions).toEqual(['wricket-mvp-v1']);
  });
});
