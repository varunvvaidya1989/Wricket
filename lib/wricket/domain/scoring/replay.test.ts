import { describe, expect, it } from 'vitest';

import {
  applyEvent,
  createDeliveryEvent,
  createInitialInningsState,
  rebuildInningsState,
  validateInningsInvariants,
  type DeliveryEvent,
  type InningsState,
  type ScoringEvent,
  type ScoringRules,
} from './index';

const rules: ScoringRules = {
  format: 'BOX',
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

describe('innings replay', () => {
  it('rebuilds a golden history into the expected state and effects', () => {
    const events: ScoringEvent[] = [
      delivery(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 1, extras: 0 }),
      delivery(2, 'batter-2', 'batter-1', 'bowler-1', { extraKind: 'WIDE', bat: 0, extras: 2 }),
      delivery(
        3,
        'batter-1',
        'batter-2',
        'bowler-1',
        { extraKind: null, bat: 0, extras: 0 },
        { kind: 'BOWLED', outPlayerId: 'batter-1', creditedToBowler: true },
      ),
      delivery(4, 'batter-3', 'batter-2', 'bowler-1', { extraKind: null, bat: 4, extras: 0 }),
      { type: 'ADJUSTMENT', sequence: 5, inningsId: 'innings-1', kind: 'PENALTY', runs: 5 },
    ];

    const replay = rebuildInningsState(initial, events, rules);

    expect(replay.ok).toBe(true);
    if (!replay.ok) return;

    expect(replay.value.state).toMatchObject({
      totalRuns: 12,
      totalWickets: 1,
      legalBalls: 3,
      strikerId: 'batter-3',
      nonStrikerId: 'batter-2',
      bowlerId: 'bowler-1',
      outPlayerIds: ['batter-1'],
      isClosed: false,
    });
    expect(replay.value.effectsByEvent).toEqual([
      [],
      [],
      [{ type: 'SELECT_NEXT_BATTER', replacingPlayerId: 'batter-1' }],
      [],
      [],
    ]);
  });

  it('fills a pending bowler from the next delivery after over completion', () => {
    const events: ScoringEvent[] = [
      delivery(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 }),
      delivery(2, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 }),
      delivery(3, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 }),
      delivery(4, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 }),
      delivery(5, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 }),
      delivery(6, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 }),
      delivery(7, 'batter-2', 'batter-1', 'bowler-2', { extraKind: null, bat: 2, extras: 0 }),
    ];

    const replay = rebuildInningsState(initial, events, rules);

    expect(replay.ok).toBe(true);
    if (!replay.ok) return;

    expect(replay.value.effectsByEvent[5]).toEqual([{ type: 'SELECT_NEXT_BOWLER', completedOver: 1 }]);
    expect(replay.value.state).toMatchObject({
      totalRuns: 2,
      legalBalls: 7,
      strikerId: 'batter-2',
      nonStrikerId: 'batter-1',
      bowlerId: 'bowler-2',
    });
  });

  it('matches incremental reduction exactly', () => {
    const events: ScoringEvent[] = [
      delivery(1, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 2, extras: 0 }),
      delivery(2, 'batter-1', 'batter-2', 'bowler-1', { extraKind: 'NO_BALL', bat: 1, extras: 1 }),
      delivery(3, 'batter-2', 'batter-1', 'bowler-1', { extraKind: 'LEG_BYE', bat: 0, extras: 1 }),
    ];
    const replay = rebuildInningsState(initial, events, rules);
    const incremental = reduceIncrementally(initial, events);

    expect(replay.ok).toBe(true);
    expect(incremental.ok).toBe(true);
    if (!replay.ok || !incremental.ok) return;

    expect(replay.value.state).toEqual(incremental.state);
    expect(rebuildInningsState(initial, events, rules)).toEqual(replay);
  });

  it('identifies the first failing event in an invalid history', () => {
    const events: ScoringEvent[] = [
      delivery(
        1,
        'batter-1',
        'batter-2',
        'bowler-1',
        { extraKind: null, bat: 0, extras: 0 },
        { kind: 'BOWLED', outPlayerId: 'batter-1', creditedToBowler: true },
      ),
      delivery(2, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 1, extras: 0 }),
    ];

    expect(rebuildInningsState(initial, events, rules)).toEqual({
      ok: false,
      eventIndex: 1,
      error: { code: 'BATTER_ALREADY_OUT' },
    });
  });

  it('rejects non-increasing event sequence numbers with an event index', () => {
    const events: ScoringEvent[] = [
      delivery(2, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 0, extras: 0 }),
      delivery(2, 'batter-1', 'batter-2', 'bowler-1', { extraKind: null, bat: 1, extras: 0 }),
    ];

    expect(rebuildInningsState(initial, events, rules)).toEqual({
      ok: false,
      eventIndex: 1,
      error: { code: 'INVALID_EVENT', field: 'sequence' },
    });
  });

  it('runs invariants directly for reconstructed state', () => {
    const state: InningsState = {
      ...initial,
      totalRuns: 4,
      totalWickets: 1,
      legalBalls: 1,
      outPlayerIds: ['batter-1'],
    };

    expect(validateInningsInvariants(state, rules, { runs: 4, wickets: 1, legalBalls: 1 })).toBeUndefined();
    expect(validateInningsInvariants(state, rules, { runs: 5, wickets: 1, legalBalls: 1 })).toEqual({
      code: 'INVALID_EVENT',
      field: 'totalRuns',
    });
  });
});

function delivery(
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

function reduceIncrementally(
  start: InningsState,
  events: readonly ScoringEvent[],
): { ok: true; state: InningsState } | { ok: false } {
  let state = start;
  for (const event of events) {
    const result = applyEvent(state, event, rules);
    if (!result.ok) return { ok: false };
    state = result.value.state;
  }
  return { ok: true, state };
}
