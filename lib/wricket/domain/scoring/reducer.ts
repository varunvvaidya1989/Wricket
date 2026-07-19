import type {
  AdjustmentEvent,
  DeliveryEvent,
  DomainEffect,
  DomainResult,
  InningsState,
  ManualCloseEvent,
  RetirementEvent,
  ScoringEvent,
  ScoringRules,
} from './events';
import { isLegalDelivery } from './events';
import { completionReasonFor, overProgressFor } from './completion';
import { validateEvent } from './validation';

export interface AppliedScoringEvent {
  readonly state: InningsState;
  readonly effects: readonly DomainEffect[];
}

export function applyEvent(
  state: InningsState,
  event: ScoringEvent,
  rules: ScoringRules,
): DomainResult<AppliedScoringEvent> {
  const error = validateEvent(state, event, rules);
  if (error) return { ok: false, error };

  switch (event.type) {
    case 'DELIVERY':
      return ok(applyDeliveryEvent(state, event, rules));
    case 'ADJUSTMENT':
      return ok(applyAdjustmentEvent(state, event, rules));
    case 'RETIREMENT':
      return ok(applyRetirementEvent(state, event, rules));
    case 'MANUAL_CLOSE':
      return ok(applyManualCloseEvent(state, event));
  }
}

export function applyDeliveryEvent(
  state: InningsState,
  event: DeliveryEvent,
  rules: ScoringRules,
): AppliedScoringEvent {
  const legal = isLegalDelivery(event);
  const legalBalls = state.legalBalls + (legal ? 1 : 0);
  const totalRuns = state.totalRuns + event.runs.bat + event.runs.extras;
  const totalWickets = state.totalWickets + (event.wicket ? 1 : 0);
  const physicalRuns = physicalRunsFor(event);

  let strikerId: string | undefined = event.strikerId;
  let nonStrikerId: string | undefined = event.nonStrikerId;
  if (physicalRuns % 2 === 1) {
    [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
  }

  const overProgress = overProgressFor(legalBalls, rules.ballsPerOver);
  const overComplete = legal && overProgress.isComplete;
  if (overComplete) {
    [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
  }

  const outPlayerIds = event.wicket ? [...state.outPlayerIds, event.wicket.outPlayerId] : [...state.outPlayerIds];
  const effects: DomainEffect[] = [];
  const closureReason = completionReason(totalRuns, totalWickets, legalBalls, rules);

  if (event.wicket && !closureReason) {
    if (event.wicket.outPlayerId === strikerId) strikerId = undefined;
    if (event.wicket.outPlayerId === nonStrikerId) nonStrikerId = undefined;
    effects.push({ type: 'SELECT_NEXT_BATTER', replacingPlayerId: event.wicket.outPlayerId });
  }
  if (overComplete && !closureReason) {
    effects.push({ type: 'SELECT_NEXT_BOWLER', completedOver: overProgress.completedOver! });
  }
  if (closureReason) {
    effects.push({ type: 'INNINGS_CLOSED', reason: closureReason });
  }

  return {
    state: freezeState({
      ...state,
      totalRuns,
      totalWickets,
      legalBalls,
      strikerId,
      nonStrikerId,
      bowlerId: overComplete && !closureReason ? undefined : event.bowlerId,
      outPlayerIds,
      isClosed: !!closureReason,
      closureReason,
    }),
    effects,
  };
}

function applyAdjustmentEvent(
  state: InningsState,
  event: AdjustmentEvent,
  rules: ScoringRules,
): AppliedScoringEvent {
  const totalRuns = state.totalRuns + event.runs;
  const closureReason = completionReason(totalRuns, state.totalWickets, state.legalBalls, rules);
  const effects: DomainEffect[] = closureReason ? [{ type: 'INNINGS_CLOSED', reason: closureReason }] : [];

  return {
    state: freezeState({
      ...state,
      totalRuns,
      isClosed: !!closureReason,
      closureReason,
    }),
    effects,
  };
}

function applyRetirementEvent(
  state: InningsState,
  event: RetirementEvent,
  rules: ScoringRules,
): AppliedScoringEvent {
  const isWicket = event.kind === 'RETIRED_OUT';
  const totalWickets = state.totalWickets + (isWicket ? 1 : 0);
  const outPlayerIds = isWicket ? [...state.outPlayerIds, event.playerId] : [...state.outPlayerIds];
  const retiredPlayerIds = [...state.retiredPlayerIds, event.playerId];
  const closureReason = completionReason(state.totalRuns, totalWickets, state.legalBalls, rules);
  const effects: DomainEffect[] = [];
  let strikerId = state.strikerId;
  let nonStrikerId = state.nonStrikerId;

  if (!closureReason) {
    if (event.playerId === strikerId) strikerId = undefined;
    if (event.playerId === nonStrikerId) nonStrikerId = undefined;
    effects.push({ type: 'SELECT_NEXT_BATTER', replacingPlayerId: event.playerId });
  } else {
    effects.push({ type: 'INNINGS_CLOSED', reason: closureReason });
  }

  return {
    state: freezeState({
      ...state,
      totalWickets,
      strikerId,
      nonStrikerId,
      outPlayerIds,
      retiredPlayerIds,
      isClosed: !!closureReason,
      closureReason,
    }),
    effects,
  };
}

function applyManualCloseEvent(state: InningsState, event: ManualCloseEvent): AppliedScoringEvent {
  return {
    state: freezeState({
      ...state,
      isClosed: true,
      closureReason: event.reason,
    }),
    effects: [{ type: 'INNINGS_CLOSED', reason: event.reason }],
  };
}

export function physicalRunsFor(event: DeliveryEvent): number {
  if (event.runs.extraKind === 'WIDE') return Math.max(0, event.runs.extras - 1);
  if (event.runs.extraKind === 'NO_BALL') return event.runs.bat;
  if (event.runs.extraKind === 'BYE' || event.runs.extraKind === 'LEG_BYE') return event.runs.extras;
  return event.runs.bat;
}

function completionReason(
  totalRuns: number,
  totalWickets: number,
  legalBalls: number,
  rules: ScoringRules,
): ReturnType<typeof completionReasonFor> {
  return completionReasonFor(
    {
      totalRuns,
      totalWickets,
      legalBalls,
      isClosed: false,
    },
    rules,
  );
}

function ok(value: AppliedScoringEvent): DomainResult<AppliedScoringEvent> {
  return { ok: true, value };
}

function freezeState(state: InningsState): InningsState {
  const copiedState = {
    ...state,
    outPlayerIds: [...state.outPlayerIds],
    retiredPlayerIds: [...state.retiredPlayerIds],
  };
  Object.freeze(copiedState.outPlayerIds);
  Object.freeze(copiedState.retiredPlayerIds);
  return Object.freeze(copiedState);
}
