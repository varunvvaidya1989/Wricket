import { describe, expect, it } from 'vitest';

import {
  applyEvent,
  createDeliveryEvent,
  type DeliveryEvent,
  type InningsState,
  type ScoringRules,
} from './index';

const rules: ScoringRules = {
  format: 'BOX',
  inningsKind: 'LIMITED_OVERS',
  ballsPerOver: 6,
  oversLimit: 5,
  playersPerSide: 6,
  wicketsAvailable: 5,
  allowLbw: false,
  allowFreeHit: true,
  allowRetiredBatterReturn: true,
};

const baseState: InningsState = {
  inningsId: 'innings-1',
  battingTeamId: 'team-a',
  bowlingTeamId: 'team-b',
  totalRuns: 0,
  totalWickets: 0,
  legalBalls: 0,
  strikerId: 'batter-1',
  nonStrikerId: 'batter-2',
  bowlerId: 'bowler-1',
  outPlayerIds: [],
  retiredPlayerIds: [],
  isClosed: false,
};

const deliveryBase = {
  type: 'DELIVERY',
  sequence: 1,
  inningsId: 'innings-1',
  strikerId: 'batter-1',
  nonStrikerId: 'batter-2',
  bowlerId: 'bowler-1',
} as const;

describe('delivery validation and reducer', () => {
  it.each([
    ['dot ball', { extraKind: null, bat: 0, extras: 0 }, true, 0, 1, 'batter-1'],
    ['single', { extraKind: null, bat: 1, extras: 0 }, true, 1, 1, 'batter-2'],
    ['four', { extraKind: null, bat: 4, extras: 0 }, true, 4, 1, 'batter-1'],
    ['wide plus one run', { extraKind: 'WIDE', bat: 0, extras: 2 }, false, 2, 0, 'batter-2'],
    ['no-ball hit for two', { extraKind: 'NO_BALL', bat: 2, extras: 1 }, false, 3, 0, 'batter-1'],
    ['bye single', { extraKind: 'BYE', bat: 0, extras: 1 }, true, 1, 1, 'batter-2'],
    ['leg-bye two', { extraKind: 'LEG_BYE', bat: 0, extras: 2 }, true, 2, 1, 'batter-1'],
  ] satisfies Array<[string, DeliveryEvent['runs'], boolean, number, number, string]>)(
    'applies %s deterministically',
    (_name, runs, _legal, totalRuns, legalBalls, strikerId) => {
      const event = makeDelivery(runs);
      const result = applyEvent(baseState, event, rules);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.state).toMatchObject({
        totalRuns,
        legalBalls,
        strikerId,
        totalWickets: 0,
        isClosed: false,
      });
      expect(result.value.effects).toEqual([]);
    },
  );

  it('returns a bowler-selection effect at over completion', () => {
    const result = applyEvent(
      { ...baseState, legalBalls: 5 },
      makeDelivery({ extraKind: null, bat: 0, extras: 0 }),
      rules,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.state).toMatchObject({
      legalBalls: 6,
      strikerId: 'batter-2',
      nonStrikerId: 'batter-1',
    });
    expect(result.value.effects).toEqual([{ type: 'SELECT_NEXT_BOWLER', completedOver: 1 }]);
  });

  it('records a striker wicket plus completed runs and prompts for a batter', () => {
    const event = makeDelivery(
      { extraKind: null, bat: 1, extras: 0 },
      {
        kind: 'RUN_OUT',
        outPlayerId: 'batter-1',
        fielderId: 'fielder-1',
        creditedToBowler: false,
      },
    );

    const result = applyEvent(baseState, event, rules);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.state).toMatchObject({
      totalRuns: 1,
      totalWickets: 1,
      legalBalls: 1,
      strikerId: 'batter-2',
      outPlayerIds: ['batter-1'],
    });
    expect(result.value.effects).toEqual([{ type: 'SELECT_NEXT_BATTER', replacingPlayerId: 'batter-1' }]);
  });

  it('allows a non-bowler no-ball run-out but rejects bowler-credit no-ball wickets', () => {
    const runOut = applyEvent(
      baseState,
      makeDelivery(
        { extraKind: 'NO_BALL', bat: 1, extras: 1 },
        {
          kind: 'RUN_OUT',
          outPlayerId: 'batter-2',
          fielderId: 'fielder-1',
          creditedToBowler: false,
        },
      ),
      rules,
    );

    expect(runOut.ok).toBe(true);

    const creditedWicket = applyEvent(
      baseState,
      makeDelivery(
        { extraKind: 'NO_BALL', bat: 0, extras: 1 },
        {
          kind: 'HIT_WICKET',
          outPlayerId: 'batter-1',
          creditedToBowler: true,
        },
      ),
      rules,
    );

    expect(creditedWicket).toEqual({
      ok: false,
      error: { code: 'INVALID_EVENT', field: 'wicket.creditedToBowler' },
    });
  });

  it('rejects impossible player state and preserves the prior state', () => {
    const prior = deepCopy(baseState);
    const result = applyEvent(
      { ...baseState, outPlayerIds: ['batter-1'] },
      makeDelivery({ extraKind: null, bat: 1, extras: 0 }),
      rules,
    );

    expect(result).toEqual({ ok: false, error: { code: 'BATTER_ALREADY_OUT' } });
    expect(baseState).toEqual(prior);
  });

  it('closes innings for all-out, target reached, and overs complete', () => {
    const allOut = applyEvent(
      { ...baseState, totalWickets: 4, outPlayerIds: ['p1', 'p2', 'p3', 'p4'] },
      makeDelivery(
        { extraKind: null, bat: 0, extras: 0 },
        { kind: 'BOWLED', outPlayerId: 'batter-1', creditedToBowler: true },
      ),
      rules,
    );
    const target = applyEvent(
      { ...baseState, totalRuns: 9 },
      makeDelivery({ extraKind: null, bat: 1, extras: 0 }),
      { ...rules, targetRuns: 10 },
    );
    const overs = applyEvent(
      { ...baseState, legalBalls: 29 },
      makeDelivery({ extraKind: null, bat: 0, extras: 0 }),
      rules,
    );

    expect(allOut.ok && allOut.value.effects).toEqual([{ type: 'INNINGS_CLOSED', reason: 'ALL_OUT' }]);
    expect(target.ok && target.value.effects).toEqual([{ type: 'INNINGS_CLOSED', reason: 'TARGET_REACHED' }]);
    expect(overs.ok && overs.value.effects).toEqual([{ type: 'INNINGS_CLOSED', reason: 'OVERS_COMPLETE' }]);
  });

  it('applies adjustment, retirement, and manual close events atomically', () => {
    const adjustment = applyEvent(
      baseState,
      { type: 'ADJUSTMENT', sequence: 2, inningsId: 'innings-1', kind: 'PENALTY', runs: 5 },
      rules,
    );
    const retirement = applyEvent(
      baseState,
      { type: 'RETIREMENT', sequence: 3, inningsId: 'innings-1', playerId: 'batter-1', kind: 'RETIRED_HURT' },
      rules,
    );
    const close = applyEvent(
      baseState,
      { type: 'MANUAL_CLOSE', sequence: 4, inningsId: 'innings-1', reason: 'DECLARED' },
      rules,
    );

    expect(adjustment.ok && adjustment.value.state.totalRuns).toBe(5);
    expect(retirement.ok && retirement.value).toMatchObject({
      state: { retiredPlayerIds: ['batter-1'], totalWickets: 0 },
      effects: [{ type: 'SELECT_NEXT_BATTER', replacingPlayerId: 'batter-1' }],
    });
    expect(close.ok && close.value).toMatchObject({
      state: { isClosed: true, closureReason: 'DECLARED' },
      effects: [{ type: 'INNINGS_CLOSED', reason: 'DECLARED' }],
    });
  });
});

function makeDelivery(runs: DeliveryEvent['runs'], wicket?: DeliveryEvent['wicket']): DeliveryEvent {
  const result = createDeliveryEvent({ ...deliveryBase, runs, wicket } as DeliveryEvent);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
