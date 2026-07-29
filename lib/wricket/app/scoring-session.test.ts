import { describe, expect, it } from 'vitest';

import type { Ball, BatterRetirement, ScoreAdjustment, ScoringSession } from '../domain/types';
import { deriveScoringStateFromHistory, restoreScoringState } from './scoring-session';

describe('scoring session restore', () => {
  it('derives active scoring state from persisted ball history', () => {
    const state = deriveScoringStateFromHistory([
      ball({ runsBat: 1, strikerId: 'batter-1', nonStrikerId: 'batter-2', legalBallInOver: 1 }),
      ball({ runsBat: 4, strikerId: 'batter-2', nonStrikerId: 'batter-1', legalBallInOver: 2 }),
      ball({ runsExtra: 2, extraKind: 'WIDE', isLegal: false, strikerId: 'batter-2', nonStrikerId: 'batter-1', legalBallInOver: 2 }),
    ]);

    expect(state).toMatchObject({
      totalRuns: 7,
      totalWickets: 0,
      legalBalls: 2,
      overNo: 0,
      legalBallInOver: 2,
      strikerId: 'batter-1',
      nonStrikerId: 'batter-2',
      bowlerId: 'bowler-1',
      pendingPrompt: null,
      source: 'BALL_HISTORY',
    });
  });

  it('includes adjustments and retired-out wickets when rebuilding from history', () => {
    const adjustments: ScoreAdjustment[] = [
      { id: 'adj-1', inningsId: 'innings-1', kind: 'PENALTY', runs: 5, createdAt: 1 },
    ];
    const retirements: BatterRetirement[] = [
      { id: 'ret-1', inningsId: 'innings-1', playerId: 'batter-1', kind: 'RETIRED_OUT', createdAt: 2 },
    ];

    expect(deriveScoringStateFromHistory([], adjustments, retirements)).toMatchObject({
      totalRuns: 5,
      totalWickets: 1,
      lastCommittedEventSequence: 2,
    });
  });

  it('restores exact pending scorer prompt from saved session state', () => {
    const session: ScoringSession = {
      matchId: 'match-1',
      inningsId: 'innings-1',
      strikerId: undefined,
      nonStrikerId: 'batter-2',
      bowlerId: nullish(),
      pendingPrompt: 'NEXT_BATTER',
      pendingPlayerId: 'batter-1',
      completedOver: undefined,
      lastCommittedEventSequence: 1,
      updatedAt: 100,
    };

    expect(
      restoreScoringState({
        inningsId: 'innings-1',
        balls: [ball({ runsBat: 0, isWicket: true, legalBallInOver: 1 })],
        adjustments: [],
        retirements: [],
        session,
      }),
    ).toMatchObject({
      totalRuns: 0,
      totalWickets: 1,
      strikerId: null,
      nonStrikerId: 'batter-2',
      bowlerId: null,
      pendingPrompt: 'NEXT_BATTER',
      pendingPlayerId: 'batter-1',
      lastCommittedEventSequence: 1,
      source: 'SESSION',
    });
  });

  it('ignores a session from another innings or older event history', () => {
    const session: ScoringSession = {
      matchId: 'match-1',
      inningsId: 'innings-old',
      strikerId: 'stale-striker',
      pendingPrompt: 'NEXT_BATTER',
      lastCommittedEventSequence: 0,
      updatedAt: 100,
    };
    const balls = [ball({ strikerId: 'current-striker' })];

    expect(restoreScoringState({ inningsId: 'innings-1', balls, adjustments: [], retirements: [], session }))
      .toMatchObject({ strikerId: 'current-striker', pendingPrompt: null, source: 'BALL_HISTORY' });

    expect(restoreScoringState({
      inningsId: 'innings-old',
      balls,
      adjustments: [],
      retirements: [],
      session: { ...session, lastCommittedEventSequence: 0 },
    })).toMatchObject({ strikerId: 'current-striker', pendingPrompt: null, source: 'BALL_HISTORY' });
  });
});

function ball(overrides: Partial<Ball>): Ball {
  return {
    id: 'ball',
    inningsId: 'innings-1',
    overNo: 0,
    ballInOver: 1,
    legalBallInOver: 1,
    strikerId: 'batter-1',
    nonStrikerId: 'batter-2',
    bowlerId: 'bowler-1',
    runsBat: 0,
    runsExtra: 0,
    extraKind: null,
    isLegal: true,
    isWicket: false,
    createdAt: 1,
    ...overrides,
  };
}

function nullish(): undefined {
  return undefined;
}
