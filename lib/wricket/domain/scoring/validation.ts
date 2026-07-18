import type {
  AdjustmentEvent,
  DeliveryEvent,
  DomainError,
  InningsState,
  ManualCloseEvent,
  RetirementEvent,
  ScoringEvent,
  ScoringRules,
} from './events';

export function validateEvent(
  state: InningsState,
  event: ScoringEvent,
  rules: ScoringRules,
): DomainError | undefined {
  const sharedError = validateSharedState(state, event, rules);
  if (sharedError) return sharedError;

  switch (event.type) {
    case 'DELIVERY':
      return validateDeliveryEvent(state, event, rules);
    case 'ADJUSTMENT':
      return validateAdjustmentEvent(event);
    case 'RETIREMENT':
      return validateRetirementEvent(state, event);
    case 'MANUAL_CLOSE':
      return validateManualCloseEvent(event);
  }
}

function validateSharedState(
  state: InningsState,
  event: ScoringEvent,
  rules: ScoringRules,
): DomainError | undefined {
  if (state.isClosed && event.type !== 'MANUAL_CLOSE') {
    return { code: 'INNINGS_CLOSED' };
  }
  if (state.inningsId !== event.inningsId) {
    return { code: 'INVALID_EVENT', field: 'inningsId' };
  }
  if (!Number.isInteger(rules.ballsPerOver) || rules.ballsPerOver <= 0) {
    return { code: 'INVALID_EVENT', field: 'ballsPerOver' };
  }
  if (!Number.isInteger(rules.wicketsAvailable) || rules.wicketsAvailable < 0) {
    return { code: 'INVALID_EVENT', field: 'wicketsAvailable' };
  }
  return undefined;
}

function validateDeliveryEvent(
  state: InningsState,
  event: DeliveryEvent,
  rules: ScoringRules,
): DomainError | undefined {
  if (!state.strikerId || !state.nonStrikerId || !state.bowlerId) {
    return { code: 'INVALID_PLAYER' };
  }
  if (
    event.strikerId !== state.strikerId ||
    event.nonStrikerId !== state.nonStrikerId ||
    event.bowlerId !== state.bowlerId
  ) {
    return { code: 'INVALID_PLAYER' };
  }
  if (state.outPlayerIds.includes(event.strikerId) || state.outPlayerIds.includes(event.nonStrikerId)) {
    return { code: 'BATTER_ALREADY_OUT' };
  }
  if (state.totalWickets >= rules.wicketsAvailable) {
    return { code: 'INNINGS_CLOSED' };
  }
  if (event.wicket) {
    if (state.outPlayerIds.includes(event.wicket.outPlayerId)) {
      return { code: 'BATTER_ALREADY_OUT', field: 'wicket.outPlayerId' };
    }
    if (event.wicket.outPlayerId !== event.strikerId && event.wicket.outPlayerId !== event.nonStrikerId) {
      return { code: 'INVALID_PLAYER', field: 'wicket.outPlayerId' };
    }
    if (event.wicket.kind === 'LBW' && !rules.allowLbw) {
      return { code: 'LBW_NOT_ALLOWED', field: 'wicket.kind' };
    }
    if (event.runs.extraKind === 'NO_BALL' && event.wicket.creditedToBowler) {
      return { code: 'INVALID_EVENT', field: 'wicket.creditedToBowler' };
    }
  }
  return undefined;
}

function validateAdjustmentEvent(event: AdjustmentEvent): DomainError | undefined {
  if (!Number.isInteger(event.runs) || event.runs < 0) {
    return { code: 'INVALID_RUNS', field: 'runs' };
  }
  return undefined;
}

function validateRetirementEvent(state: InningsState, event: RetirementEvent): DomainError | undefined {
  if (state.outPlayerIds.includes(event.playerId)) {
    return { code: 'BATTER_ALREADY_OUT', field: 'playerId' };
  }
  if (event.playerId !== state.strikerId && event.playerId !== state.nonStrikerId) {
    return { code: 'INVALID_PLAYER', field: 'playerId' };
  }
  return undefined;
}

function validateManualCloseEvent(event: ManualCloseEvent): DomainError | undefined {
  if (event.reason !== 'MANUAL_CLOSE' && event.reason !== 'DECLARED') {
    return { code: 'INVALID_EVENT', field: 'reason' };
  }
  return undefined;
}
