import type { DomainEffect, DomainError, DomainResult, InningsState, ScoringEvent, ScoringRules } from './events';
import { isLegalDelivery } from './events';
import { applyEvent } from './reducer';

export interface InitialInningsStateInput {
  readonly inningsId: string;
  readonly battingTeamId: string;
  readonly bowlingTeamId: string;
  readonly strikerId?: string;
  readonly nonStrikerId?: string;
  readonly bowlerId?: string;
}

export interface ReplaySuccess {
  readonly state: InningsState;
  readonly effectsByEvent: readonly (readonly DomainEffect[])[];
}

export type ReplayResult =
  | { readonly ok: true; readonly value: ReplaySuccess }
  | { readonly ok: false; readonly eventIndex: number; readonly error: DomainError };

export interface ReplayLedger {
  runs: number;
  wickets: number;
  legalBalls: number;
}

export function createInitialInningsState(input: InitialInningsStateInput): InningsState {
  return freezeState({
    inningsId: input.inningsId,
    battingTeamId: input.battingTeamId,
    bowlingTeamId: input.bowlingTeamId,
    totalRuns: 0,
    totalWickets: 0,
    legalBalls: 0,
    strikerId: input.strikerId,
    nonStrikerId: input.nonStrikerId,
    bowlerId: input.bowlerId,
    outPlayerIds: [],
    retiredPlayerIds: [],
    isClosed: false,
  });
}

export function rebuildInningsState(
  initialState: InningsState,
  events: readonly ScoringEvent[],
  rules: ScoringRules,
): ReplayResult {
  let state = freezeState(initialState);
  let previousSequence = 0;
  const ledger: ReplayLedger = {
    runs: state.totalRuns,
    wickets: state.totalWickets,
    legalBalls: state.legalBalls,
  };
  const effectsByEvent: DomainEffect[][] = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.sequence <= previousSequence) {
      return {
        ok: false,
        eventIndex: index,
        error: { code: 'INVALID_EVENT', field: 'sequence' },
      };
    }
    previousSequence = event.sequence;

    const result = applyEvent(state, event, rules);
    if (!result.ok) {
      return { ok: false, eventIndex: index, error: result.error };
    }

    updateLedger(ledger, event);
    state = result.value.state;
    effectsByEvent.push([...result.value.effects]);

    const invariantError = validateInningsInvariants(state, rules, ledger);
    if (invariantError) {
      return { ok: false, eventIndex: index, error: invariantError };
    }
  }

  return {
    ok: true,
    value: {
      state,
      effectsByEvent,
    },
  };
}

export function applyEventsIncrementally(
  initialState: InningsState,
  events: readonly ScoringEvent[],
  rules: ScoringRules,
): DomainResult<ReplaySuccess> {
  const replay = rebuildInningsState(initialState, events, rules);
  if (!replay.ok) return { ok: false, error: replay.error };
  return { ok: true, value: replay.value };
}

export function validateInningsInvariants(
  state: InningsState,
  rules: ScoringRules,
  expected?: ReplayLedger,
): DomainError | undefined {
  if (state.totalRuns < 0 || state.totalWickets < 0 || state.legalBalls < 0) {
    return { code: 'INVALID_EVENT', field: 'negativeState' };
  }
  if (state.totalWickets > rules.wicketsAvailable) {
    return { code: 'INVALID_EVENT', field: 'totalWickets' };
  }
  if (state.outPlayerIds.length !== new Set(state.outPlayerIds).size) {
    return { code: 'INVALID_EVENT', field: 'outPlayerIds' };
  }
  if (state.retiredPlayerIds.length !== new Set(state.retiredPlayerIds).size) {
    return { code: 'INVALID_EVENT', field: 'retiredPlayerIds' };
  }
  if (state.isClosed && !state.closureReason) {
    return { code: 'INVALID_EVENT', field: 'closureReason' };
  }
  if (expected) {
    if (state.totalRuns !== expected.runs) return { code: 'INVALID_EVENT', field: 'totalRuns' };
    if (state.totalWickets !== expected.wickets) return { code: 'INVALID_EVENT', field: 'totalWickets' };
    if (state.legalBalls !== expected.legalBalls) return { code: 'INVALID_EVENT', field: 'legalBalls' };
  }
  return undefined;
}

function updateLedger(ledger: ReplayLedger, event: ScoringEvent): void {
  if (event.type === 'DELIVERY') {
    ledger.runs += event.runs.bat + event.runs.extras;
    ledger.wickets += event.wicket ? 1 : 0;
    ledger.legalBalls += isLegalDelivery(event) ? 1 : 0;
  }
  if (event.type === 'ADJUSTMENT') {
    ledger.runs += event.runs;
  }
  if (event.type === 'RETIREMENT' && event.kind === 'RETIRED_OUT') {
    ledger.wickets += 1;
  }
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
