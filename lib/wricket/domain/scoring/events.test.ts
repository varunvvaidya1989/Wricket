import { describe, expect, it } from 'vitest';

import type { Ball } from '../types';
import {
  createAdjustmentEvent,
  createDeliveryEvent,
  createManualCloseEvent,
  createRetirementEvent,
  deliveryEventFromBall,
  isLegalDelivery,
  scoringRulesFromFormat,
  stableSerializeScoringEvent,
  type DeliveryEvent,
} from './events';

const baseDelivery = {
  type: 'DELIVERY',
  sequence: 1,
  inningsId: 'innings-1',
  strikerId: 'batter-1',
  nonStrikerId: 'batter-2',
  bowlerId: 'bowler-1',
} as const;

describe('canonical scoring event contracts', () => {
  it('constructs every supported event variant', () => {
    const delivery = createDeliveryEvent({
      ...baseDelivery,
      runs: { extraKind: null, bat: 4, extras: 0 },
    });
    const adjustment = createAdjustmentEvent({
      type: 'ADJUSTMENT',
      sequence: 2,
      inningsId: 'innings-1',
      kind: 'PENALTY',
      runs: 5,
      note: 'fielding penalty',
    });
    const retirement = createRetirementEvent({
      type: 'RETIREMENT',
      sequence: 3,
      inningsId: 'innings-1',
      playerId: 'batter-1',
      kind: 'RETIRED_HURT',
    });
    const close = createManualCloseEvent({
      type: 'MANUAL_CLOSE',
      sequence: 4,
      inningsId: 'innings-1',
      reason: 'DECLARED',
    });

    expect(delivery.ok).toBe(true);
    expect(adjustment.ok).toBe(true);
    expect(retirement.ok).toBe(true);
    expect(close.ok).toBe(true);
  });

  it('rejects contradictory run and player combinations through factories', () => {
    expect(
      createDeliveryEvent({
        ...baseDelivery,
        runs: { extraKind: 'WIDE', bat: 0, extras: 0 },
      }),
    ).toEqual({ ok: false, error: { code: 'INVALID_EXTRA', field: 'extras' } });

    expect(
      createDeliveryEvent({
        ...baseDelivery,
        nonStrikerId: 'batter-1',
        runs: { extraKind: null, bat: 1, extras: 0 },
      }),
    ).toEqual({ ok: false, error: { code: 'INVALID_PLAYER', field: 'nonStrikerId' } });

    expect(
      createDeliveryEvent({
        ...baseDelivery,
        runs: { extraKind: 'NO_BALL', bat: 0, extras: 1 },
        wicket: {
          kind: 'LBW',
          outPlayerId: 'batter-1',
          creditedToBowler: true,
        },
      }),
    ).toEqual({ ok: false, error: { code: 'INVALID_EVENT', field: 'wicket' } });
  });

  it('freezes constructed events to protect immutable contracts', () => {
    const result = createDeliveryEvent({
      ...baseDelivery,
      runs: { extraKind: 'NO_BALL', bat: 2, extras: 1 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.runs)).toBe(true);
    expect(() => {
      (result.value.runs as { bat: number }).bat = 6;
    }).toThrow(TypeError);
  });

  it('serializes fixtures in deterministic key order', () => {
    const result = createDeliveryEvent({
      ...baseDelivery,
      runs: { extraKind: null, bat: 6, extras: 0 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(stableSerializeScoringEvent(result.value)).toBe(
      '{"bowlerId":"bowler-1","inningsId":"innings-1","nonStrikerId":"batter-2","runs":{"bat":6,"extraKind":null,"extras":0},"sequence":1,"strikerId":"batter-1","type":"DELIVERY"}',
    );
  });

  it('adapts current persisted ball records into canonical events', () => {
    const ball: Ball = {
      id: 'ball-1',
      inningsId: 'innings-1',
      overNo: 0,
      ballInOver: 1,
      legalBallInOver: 1,
      strikerId: 'batter-1',
      nonStrikerId: 'batter-2',
      bowlerId: 'bowler-1',
      runsBat: 0,
      runsExtra: 1,
      extraKind: 'WIDE',
      isLegal: false,
      isWicket: false,
      createdAt: 1,
    };

    const result = deliveryEventFromBall(ball, 7);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      type: 'DELIVERY',
      sequence: 7,
      runs: { extraKind: 'WIDE', bat: 0, extras: 1 },
    });
    expect(isLegalDelivery(result.value)).toBe(false);
  });

  it('maps current format rules into scoring rules', () => {
    expect(
      scoringRulesFromFormat('BOX', {
        oversPerInnings: 5,
        playersPerSide: 6,
        lbwEnabled: false,
      }),
    ).toMatchObject({
      format: 'BOX',
      inningsKind: 'LIMITED_OVERS',
      ballsPerOver: 6,
      oversLimit: 5,
      wicketsAvailable: 5,
      allowLbw: false,
    });
  });
});

const validWide: DeliveryEvent = {
  ...baseDelivery,
  runs: { extraKind: 'WIDE', bat: 0, extras: 2 },
};

expect(validWide.runs.extraKind).toBe('WIDE');

const invalidWide: DeliveryEvent = {
  ...baseDelivery,
  // @ts-expect-error wides cannot credit bat runs.
  runs: { extraKind: 'WIDE', bat: 1, extras: 2 },
};

const invalidBatRuns: DeliveryEvent = {
  ...baseDelivery,
  // @ts-expect-error ordinary bat runs cannot carry extras.
  runs: { extraKind: null, bat: 1, extras: 1 },
};

void invalidWide;
void invalidBatRuns;
