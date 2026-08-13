import type {
  Ball,
  DismissalKind,
  MatchFormat,
  RetirementKind,
  ScoreAdjustmentKind,
} from '../types';

export type InningsKind = 'LIMITED_OVERS' | 'TEST_STYLE' | 'SUPER_OVER';

export interface ScoringRules {
  format: MatchFormat | 'CUSTOM';
  inningsKind: InningsKind;
  ballsPerOver: number;
  oversLimit?: number;
  playersPerSide: number;
  wicketsAvailable: number;
  targetRuns?: number;
  allowLbw: boolean;
  allowFreeHit: boolean;
  allowRetiredBatterReturn: boolean;
}

export interface InningsState {
  inningsId: string;
  battingTeamId: string;
  bowlingTeamId: string;
  totalRuns: number;
  totalWickets: number;
  legalBalls: number;
  strikerId?: string;
  nonStrikerId?: string;
  bowlerId?: string;
  outPlayerIds: readonly string[];
  retiredPlayerIds: readonly string[];
  isClosed: boolean;
  closureReason?: InningsClosureReason;
}

export type InningsClosureReason =
  | 'ALL_OUT'
  | 'OVERS_COMPLETE'
  | 'TARGET_REACHED'
  | 'MANUAL_CLOSE'
  | 'DECLARED';

export type ScoringEvent =
  | DeliveryEvent
  | AdjustmentEvent
  | RetirementEvent
  | ManualCloseEvent;

export interface ScoringEventBase {
  readonly type: string;
  readonly sequence: number;
  readonly inningsId: string;
}

type DeliveryBase = ScoringEventBase & {
  readonly type: 'DELIVERY';
  readonly strikerId: string;
  readonly nonStrikerId: string;
  readonly bowlerId: string;
  readonly wicket?: WicketDetail;
  readonly crossedBatters?: boolean;
  readonly rotateStrike?: boolean;
  readonly freeHit?: boolean;
};

export type DeliveryEvent =
  | (DeliveryBase & { readonly runs: BatRuns })
  | (DeliveryBase & { readonly runs: WideRuns })
  | (DeliveryBase & { readonly runs: NoBallRuns })
  | (DeliveryBase & { readonly runs: ByeRuns })
  | (DeliveryBase & { readonly runs: LegByeRuns });

export interface BatRuns {
  readonly extraKind: null;
  readonly bat: number;
  readonly extras: 0;
}

export interface WideRuns {
  readonly extraKind: 'WIDE';
  readonly bat: 0;
  readonly extras: number;
}

export interface NoBallRuns {
  readonly extraKind: 'NO_BALL';
  readonly bat: number;
  readonly extras: number;
}

export interface ByeRuns {
  readonly extraKind: 'BYE';
  readonly bat: 0;
  readonly extras: number;
}

export interface LegByeRuns {
  readonly extraKind: 'LEG_BYE';
  readonly bat: 0;
  readonly extras: number;
}

export interface WicketDetail {
  readonly kind: DismissalKind;
  readonly outPlayerId: string;
  readonly fielderId?: string;
  readonly assistantFielderId?: string;
  readonly creditedToBowler: boolean;
}

export interface AdjustmentEvent extends ScoringEventBase {
  readonly type: 'ADJUSTMENT';
  readonly kind: ScoreAdjustmentKind;
  readonly runs: number;
  readonly note?: string;
}

export interface RetirementEvent extends ScoringEventBase {
  readonly type: 'RETIREMENT';
  readonly playerId: string;
  readonly kind: RetirementKind;
}

export interface ManualCloseEvent extends ScoringEventBase {
  readonly type: 'MANUAL_CLOSE';
  readonly reason: Extract<InningsClosureReason, 'MANUAL_CLOSE' | 'DECLARED'>;
}

export type DomainEffect =
  | { readonly type: 'SELECT_NEXT_BATTER'; readonly replacingPlayerId: string }
  | { readonly type: 'SELECT_NEXT_BOWLER'; readonly completedOver: number }
  | { readonly type: 'INNINGS_CLOSED'; readonly reason: InningsClosureReason };

export type DomainErrorCode =
  | 'INNINGS_CLOSED'
  | 'INVALID_EVENT'
  | 'INVALID_EXTRA'
  | 'INVALID_RUNS'
  | 'INVALID_PLAYER'
  | 'BATTER_ALREADY_OUT'
  | 'OVER_COMPLETE'
  | 'LBW_NOT_ALLOWED';

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly field?: string;
}

export type DomainResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

export function createDeliveryEvent(event: DeliveryEvent): DomainResult<DeliveryEvent> {
  const playerError = validateDeliveryPlayers(event);
  if (playerError) return { ok: false, error: playerError };

  const runsError = validateRuns(event.runs);
  if (runsError) return { ok: false, error: runsError };

  if (event.wicket?.kind === 'LBW' && event.runs.extraKind === 'NO_BALL') {
    return { ok: false, error: { code: 'INVALID_EVENT', field: 'wicket' } };
  }

  return { ok: true, value: deepFreeze(copyEvent(event)) };
}

export function createAdjustmentEvent(event: AdjustmentEvent): DomainResult<AdjustmentEvent> {
  if (!Number.isInteger(event.runs) || event.runs < 0) {
    return { ok: false, error: { code: 'INVALID_RUNS', field: 'runs' } };
  }
  return { ok: true, value: deepFreeze(copyEvent(event)) };
}

export function createRetirementEvent(event: RetirementEvent): DomainResult<RetirementEvent> {
  if (!event.playerId) return { ok: false, error: { code: 'INVALID_PLAYER', field: 'playerId' } };
  return { ok: true, value: deepFreeze(copyEvent(event)) };
}

export function createManualCloseEvent(event: ManualCloseEvent): DomainResult<ManualCloseEvent> {
  return { ok: true, value: deepFreeze(copyEvent(event)) };
}

export function scoringRulesFromFormat(
  format: MatchFormat,
  rules: {
    oversPerInnings: number;
    playersPerSide: number;
    lbwEnabled: boolean;
  },
): ScoringRules {
  return {
    format,
    inningsKind: format === 'TURF_TEST' ? 'TEST_STYLE' : 'LIMITED_OVERS',
    ballsPerOver: 6,
    oversLimit: rules.oversPerInnings,
    playersPerSide: rules.playersPerSide,
    wicketsAvailable: Math.max(0, rules.playersPerSide - 1),
    allowLbw: rules.lbwEnabled,
    allowFreeHit: true,
    allowRetiredBatterReturn: true,
  };
}

export function deliveryEventFromBall(ball: Ball, sequence: number): DomainResult<DeliveryEvent> {
  const base = {
    type: 'DELIVERY',
    sequence,
    inningsId: ball.inningsId,
    strikerId: ball.strikerId,
    nonStrikerId: ball.nonStrikerId,
    bowlerId: ball.bowlerId,
    rotateStrike: ball.rotateStrike,
    wicket: ball.dismissal
      ? {
          kind: ball.dismissal.kind,
          outPlayerId: ball.dismissal.outPlayerId,
          fielderId: ball.dismissal.fielderId,
          assistantFielderId: ball.dismissal.assistantFielderId,
          creditedToBowler: isBowlerCreditedWicket(ball.dismissal.kind),
        }
      : undefined,
  } as const;

  switch (ball.extraKind) {
    case 'WIDE':
      return createDeliveryEvent({ ...base, runs: { extraKind: 'WIDE', bat: 0, extras: ball.runsExtra } });
    case 'NO_BALL':
      return createDeliveryEvent({
        ...base,
        runs: { extraKind: 'NO_BALL', bat: ball.runsBat, extras: ball.runsExtra },
      });
    case 'BYE':
      return createDeliveryEvent({ ...base, runs: { extraKind: 'BYE', bat: 0, extras: ball.runsExtra } });
    case 'LEG_BYE':
      return createDeliveryEvent({ ...base, runs: { extraKind: 'LEG_BYE', bat: 0, extras: ball.runsExtra } });
    default:
      return createDeliveryEvent({ ...base, runs: { extraKind: null, bat: ball.runsBat, extras: 0 } });
  }
}

export function stableSerializeScoringEvent(event: ScoringEvent): string {
  return JSON.stringify(sortKeys(event));
}

export function isLegalDelivery(event: DeliveryEvent): boolean {
  return event.runs.extraKind !== 'WIDE' && event.runs.extraKind !== 'NO_BALL';
}

export function isBowlerCreditedWicket(kind: DismissalKind): boolean {
  return kind === 'BOWLED' || kind === 'CAUGHT' || kind === 'LBW' || kind === 'STUMPED' || kind === 'HIT_WICKET';
}

function validateDeliveryPlayers(event: DeliveryEvent): DomainError | undefined {
  if (!event.strikerId || !event.nonStrikerId || !event.bowlerId) {
    return { code: 'INVALID_PLAYER' };
  }
  if (event.strikerId === event.nonStrikerId) {
    return { code: 'INVALID_PLAYER', field: 'nonStrikerId' };
  }
  if (event.bowlerId === event.strikerId || event.bowlerId === event.nonStrikerId) {
    return { code: 'INVALID_PLAYER', field: 'bowlerId' };
  }
  return undefined;
}

function validateRuns(runs: DeliveryEvent['runs']): DomainError | undefined {
  if (!Number.isInteger(runs.bat) || !Number.isInteger(runs.extras) || runs.bat < 0 || runs.extras < 0) {
    return { code: 'INVALID_RUNS', field: 'runs' };
  }
  if (runs.extraKind === null && runs.extras !== 0) {
    return { code: 'INVALID_EXTRA', field: 'extras' };
  }
  if ((runs.extraKind === 'WIDE' || runs.extraKind === 'BYE' || runs.extraKind === 'LEG_BYE') && runs.bat !== 0) {
    return { code: 'INVALID_EXTRA', field: 'bat' };
  }
  if ((runs.extraKind === 'WIDE' || runs.extraKind === 'NO_BALL') && runs.extras < 1) {
    return { code: 'INVALID_EXTRA', field: 'extras' };
  }
  return undefined;
}

function copyEvent<T extends ScoringEvent>(event: T): T {
  return JSON.parse(JSON.stringify(event)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((sorted, key) => {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
      return sorted;
    }, {});
}
