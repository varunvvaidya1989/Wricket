import { describe, expect, it } from 'vitest';

import {
  applyEvent,
  createDeliveryEvent,
  createInitialInningsState,
  decideInningsCompletion,
  overProgressFor,
  rebuildInningsState,
  type DeliveryEvent,
  type ScoringEvent,
  type ScoringRules,
} from './index';

const baseRules: ScoringRules = {
  format: 'CUSTOM',
  inningsKind: 'LIMITED_OVERS',
  ballsPerOver: 6,
  oversLimit: 2,
  playersPerSide: 6,
  wicketsAvailable: 5,
  allowLbw: true,
  allowFreeHit: true,
  allowRetiredBatterReturn: true,
};

const baseState = createInitialInningsState({
  inningsId: 'innings-1',
  battingTeamId: 'team-a',
  bowlingTeamId: 'team-b',
  strikerId: 'batter-1',
  nonStrikerId: 'batter-2',
  bowlerId: 'bowler-1',
});

describe('innings completion decisions', () => {
  it('reports configured over progress without off-by-one errors', () => {
    expect(overProgressFor(0, 6)).toEqual({
      overNumber: 0,
      ballInOver: 0,
      ballsPerOver: 6,
      isComplete: false,
      completedOver: undefined,
    });
    expect(overProgressFor(5, 6)).toMatchObject({ overNumber: 0, ballInOver: 5, isComplete: false });
    expect(overProgressFor(6, 6)).toMatchObject({ overNumber: 1, ballInOver: 0, isComplete: true, completedOver: 1 });
    expect(overProgressFor(4, 4)).toMatchObject({ overNumber: 1, ballInOver: 0, isComplete: true, completedOver: 1 });
  });

  it('leaves innings open one legal ball before the overs limit', () => {
    const result = applyEvent(
      { ...baseState, legalBalls: 10 },
      delivery(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 }),
      baseRules,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.state).toMatchObject({ legalBalls: 11, isClosed: false, closureReason: undefined });
    expect(result.value.effects).toEqual([]);
  });

  it('closes exactly at the overs limit and rejects later scoring', () => {
    const result = applyEvent(
      { ...baseState, legalBalls: 11 },
      delivery(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 1, extras: 0 }),
      baseRules,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.state).toMatchObject({
      totalRuns: 1,
      legalBalls: 12,
      isClosed: true,
      closureReason: 'OVERS_COMPLETE',
    });
    expect(result.value.effects).toEqual([{ type: 'INNINGS_CLOSED', reason: 'OVERS_COMPLETE' }]);

    const next = applyEvent(
      result.value.state,
      delivery(2, 'batter-2', 'batter-1', 'bowler-1', { extraKind: null, bat: 1, extras: 0 }),
      baseRules,
    );
    expect(next).toEqual({ ok: false, error: { code: 'INNINGS_CLOSED' } });
  });

  it('does not close on an illegal delivery at the apparent final ball', () => {
    const result = applyEvent(
      { ...baseState, legalBalls: 11 },
      delivery(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: 'WIDE', bat: 0, extras: 1 }),
      baseRules,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.state).toMatchObject({
      totalRuns: 1,
      legalBalls: 11,
      isClosed: false,
      closureReason: undefined,
    });
    expect(result.value.effects).toEqual([]);
  });

  it('supports custom four-ball overs and no-limit innings', () => {
    const customRules = { ...baseRules, ballsPerOver: 4, oversLimit: undefined };
    const over = applyEvent(
      { ...baseState, legalBalls: 3 },
      delivery(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 }),
      customRules,
    );
    const longInnings = applyEvent(
      { ...baseState, legalBalls: 199 },
      delivery(2, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 }),
      customRules,
    );

    expect(over.ok && over.value.effects).toEqual([{ type: 'SELECT_NEXT_BOWLER', completedOver: 1 }]);
    expect(longInnings.ok && longInnings.value.state).toMatchObject({
      legalBalls: 200,
      isClosed: false,
      closureReason: undefined,
    });
  });

  it('chooses exact closure reasons for chase, all-out, declaration, and manual close', () => {
    const chase = decideInningsCompletion({ ...baseState, totalRuns: 25, totalWickets: 1, legalBalls: 7 }, {
      ...baseRules,
      targetRuns: 25,
    });
    const allOut = decideInningsCompletion({ ...baseState, totalRuns: 10, totalWickets: 5, legalBalls: 6 }, baseRules);
    const declared = decideInningsCompletion({
      ...baseState,
      totalRuns: 40,
      totalWickets: 2,
      legalBalls: 9,
      isClosed: true,
      closureReason: 'DECLARED',
    }, baseRules);
    const manual = decideInningsCompletion({
      ...baseState,
      totalRuns: 40,
      totalWickets: 2,
      legalBalls: 9,
      isClosed: true,
      closureReason: 'MANUAL_CLOSE',
    }, baseRules);

    expect(chase).toEqual({
      isClosed: true,
      reason: 'TARGET_REACHED',
      effect: { type: 'INNINGS_CLOSED', reason: 'TARGET_REACHED' },
    });
    expect(allOut).toEqual({
      isClosed: true,
      reason: 'ALL_OUT',
      effect: { type: 'INNINGS_CLOSED', reason: 'ALL_OUT' },
    });
    expect(declared).toEqual({
      isClosed: true,
      reason: 'DECLARED',
      effect: { type: 'INNINGS_CLOSED', reason: 'DECLARED' },
    });
    expect(manual).toEqual({
      isClosed: true,
      reason: 'MANUAL_CLOSE',
      effect: { type: 'INNINGS_CLOSED', reason: 'MANUAL_CLOSE' },
    });
  });

  it('keeps completion unchanged through replay', () => {
    const events: ScoringEvent[] = Array.from({ length: 12 }, (_, index) =>
      delivery(index + 1, index < 6 ? 'batter-1' : 'batter-2', index < 6 ? 'batter-2' : 'batter-1', index < 6 ? 'bowler-1' : 'bowler-2', {
        extraKind: null,
        bat: 0,
        extras: 0,
      }),
    );

    const replay = rebuildInningsState(baseState, events, baseRules);

    expect(replay.ok).toBe(true);
    if (!replay.ok) return;

    expect(replay.value.state).toMatchObject({
      legalBalls: 12,
      isClosed: true,
      closureReason: 'OVERS_COMPLETE',
    });
    expect(replay.value.effectsByEvent[11]).toEqual([{ type: 'INNINGS_CLOSED', reason: 'OVERS_COMPLETE' }]);
  });
});

function delivery(
  sequence: number,
  strikerId: string,
  nonStrikerId: string,
  bowlerId: string,
  runs: DeliveryEvent['runs'],
): DeliveryEvent {
  const result = createDeliveryEvent({
    type: 'DELIVERY',
    sequence,
    inningsId: 'innings-1',
    strikerId,
    nonStrikerId,
    bowlerId,
    runs,
  } as DeliveryEvent);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
