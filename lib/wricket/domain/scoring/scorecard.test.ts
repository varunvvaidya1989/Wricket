import { describe, expect, it } from 'vitest';

import {
  createDeliveryEvent,
  createInitialInningsState,
  scorecardForEvents,
  type DeliveryEvent,
  type ScoringEvent,
  type ScoringRules,
} from './index';

const rules: ScoringRules = {
  format: 'CUSTOM',
  inningsKind: 'LIMITED_OVERS',
  ballsPerOver: 6,
  oversLimit: 5,
  playersPerSide: 6,
  wicketsAvailable: 5,
  allowLbw: true,
  allowFreeHit: true,
  allowRetiredBatterReturn: true,
};

const initial = createInitialInningsState({
  inningsId: 'innings-1',
  battingTeamId: 'team-a',
  bowlingTeamId: 'team-b',
  strikerId: 'batter-1',
  nonStrikerId: 'batter-2',
  bowlerId: 'bowler-1',
});

describe('canonical scorecard integration', () => {
  it('derives batter, bowler, extras, wickets, and totals from a mixed golden innings', () => {
    const events: ScoringEvent[] = [
      ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 4, extras: 0 }),
      ball(2, 'batter-1', 'batter-2', 'bowler-1', { extraKind: 'WIDE', bat: 0, extras: 2 }),
      ball(3, 'batter-2', 'batter-1', 'bowler-1', { extraKind: 'NO_BALL', bat: 2, extras: 1 }),
      ball(4, 'batter-2', 'batter-1', 'bowler-1', { extraKind: 'BYE', bat: 0, extras: 1 }),
      ball(5, 'batter-1', 'batter-2', 'bowler-1', { extraKind: 'LEG_BYE', bat: 0, extras: 2 }),
      ball(
        6,
        'batter-1',
        'batter-2',
        'bowler-1',
        { extraKind: null, bat: 0, extras: 0 },
        { kind: 'CAUGHT', outPlayerId: 'batter-1', fielderId: 'fielder-1', creditedToBowler: true },
      ),
      ball(7, 'batter-3', 'batter-2', 'bowler-1', { extraKind: null, bat: 6, extras: 0 }),
      { type: 'RETIREMENT', sequence: 8, inningsId: 'innings-1', playerId: 'batter-3', kind: 'RETIRED_HURT' },
      ball(9, 'batter-4', 'batter-2', 'bowler-1', { extraKind: null, bat: 1, extras: 0 }),
      { type: 'ADJUSTMENT', sequence: 10, inningsId: 'innings-1', kind: 'PENALTY', runs: 5 },
    ];

    const scorecard = scorecardForEvents(initial, events, rules);

    expect(scorecard.innings).toMatchObject({
      totalRuns: 24,
      totalWickets: 1,
      legalBalls: 6,
      oversText: '1.0',
      isClosed: false,
    });
    expect(scorecard.extras).toEqual({
      byes: 1,
      legByes: 2,
      wides: 2,
      noBalls: 1,
      penalties: 5,
      bonuses: 0,
      total: 11,
    });
    expect(scorecard.batters).toEqual([
      {
        userId: 'batter-1',
        runs: 4,
        balls: 3,
        fours: 1,
        sixes: 0,
        isOut: true,
        dismissalText: 'c fiel b bowl',
        strikeRate: 133.33333333333331,
      },
      {
        userId: 'batter-2',
        runs: 2,
        balls: 1,
        fours: 0,
        sixes: 0,
        isOut: false,
        strikeRate: 200,
      },
      {
        userId: 'batter-3',
        runs: 6,
        balls: 1,
        fours: 0,
        sixes: 1,
        isOut: false,
        dismissalText: 'retired hurt',
        strikeRate: 600,
      },
      {
        userId: 'batter-4',
        runs: 1,
        balls: 1,
        fours: 0,
        sixes: 0,
        isOut: false,
        strikeRate: 100,
      },
    ]);
    expect(scorecard.bowlers).toEqual([
      {
        userId: 'bowler-1',
        legalBalls: 6,
        runsConceded: 16,
        wickets: 1,
        wides: 1,
        noBalls: 1,
        economy: 16,
        oversText: '1.0',
      },
    ]);
    expect(reconciledTotal(scorecard)).toBe(scorecard.innings.totalRuns);
  });

  it('formats dismissals with cricket-style player names when supplied', () => {
    const scorecard = scorecardForEvents(initial, [
      ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 },
        { kind: 'CAUGHT', outPlayerId: 'batter-1', fielderId: 'fielder-1', creditedToBowler: true }),
    ], rules, id => ({ 'fielder-1': 'Rohan Mehta', 'bowler-1': 'Arjun Singh' }[id] ?? id));
    expect(scorecard.batters[0].dismissalText).toBe('c Rohan Mehta b Arjun Singh');
  });

  it.each([
    ['dot ball', [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 })], 0, 0, 1],
    ['single', [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 1, extras: 0 })], 1, 0, 1],
    ['four', [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 4, extras: 0 })], 4, 0, 1],
    ['six', [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 6, extras: 0 })], 6, 0, 1],
    ['wide', [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: 'WIDE', bat: 0, extras: 1 })], 1, 1, 0],
    ['wide plus run', [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: 'WIDE', bat: 0, extras: 3 })], 3, 3, 0],
    ['no-ball', [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: 'NO_BALL', bat: 0, extras: 1 })], 1, 1, 0],
    ['no-ball boundary', [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: 'NO_BALL', bat: 4, extras: 1 })], 5, 1, 0],
    ['bye', [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: 'BYE', bat: 0, extras: 2 })], 2, 2, 1],
    ['leg-bye', [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: 'LEG_BYE', bat: 0, extras: 1 })], 1, 1, 1],
    [
      'bowled',
      [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 }, { kind: 'BOWLED', outPlayerId: 'batter-1', creditedToBowler: true })],
      0,
      0,
      1,
    ],
    [
      'run out',
      [ball(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 1, extras: 0 }, { kind: 'RUN_OUT', outPlayerId: 'batter-1', fielderId: 'fielder-1', creditedToBowler: false })],
      1,
      0,
      1,
    ],
    ['penalty', [{ type: 'ADJUSTMENT', sequence: 1, inningsId: 'innings-1', kind: 'PENALTY', runs: 5 }], 5, 5, 0],
    ['bonus', [{ type: 'ADJUSTMENT', sequence: 1, inningsId: 'innings-1', kind: 'BONUS', runs: 2 }], 2, 2, 0],
    ['retired out', [{ type: 'RETIREMENT', sequence: 1, inningsId: 'innings-1', playerId: 'batter-1', kind: 'RETIRED_OUT' }], 0, 0, 0],
  ] satisfies Array<[string, ScoringEvent[], number, number, number]>)(
    'passes golden fixture: %s',
    (_name, events, totalRuns, extrasTotal, legalBalls) => {
      const scorecard = scorecardForEvents(initial, events, rules);

      expect(scorecard.innings.totalRuns).toBe(totalRuns);
      expect(scorecard.extras.total).toBe(extrasTotal);
      expect(scorecard.innings.legalBalls).toBe(legalBalls);
      expect(reconciledTotal(scorecard)).toBe(totalRuns);
    },
  );
});

function ball(
  sequence: number,
  strikerId: string,
  nonStrikerId: string,
  bowlerId: string,
  runs: DeliveryEvent['runs'],
  wicket?: DeliveryEvent['wicket'],
): DeliveryEvent {
  const result = createDeliveryEvent({
    type: 'DELIVERY',
    sequence,
    inningsId: 'innings-1',
    strikerId,
    nonStrikerId,
    bowlerId,
    runs,
    wicket,
  } as DeliveryEvent);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function reconciledTotal(scorecard: ReturnType<typeof scorecardForEvents>): number {
  return scorecard.batters.reduce((sum, line) => sum + line.runs, 0) + scorecard.extras.total;
}
