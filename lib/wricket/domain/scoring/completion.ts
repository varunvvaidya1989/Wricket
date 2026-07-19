import type { DomainEffect, InningsClosureReason, InningsState, ScoringRules } from './events';

export interface OverProgress {
  readonly overNumber: number;
  readonly ballInOver: number;
  readonly ballsPerOver: number;
  readonly isComplete: boolean;
  readonly completedOver?: number;
}

export interface InningsCompletionDecision {
  readonly isClosed: boolean;
  readonly reason?: InningsClosureReason;
  readonly effect?: DomainEffect;
}

export function overProgressFor(legalBalls: number, ballsPerOver: number): OverProgress {
  if (!Number.isInteger(legalBalls) || legalBalls < 0) {
    throw new Error('legalBalls must be a non-negative integer');
  }
  if (!Number.isInteger(ballsPerOver) || ballsPerOver <= 0) {
    throw new Error('ballsPerOver must be a positive integer');
  }

  const ballInOver = legalBalls % ballsPerOver;
  const completedOver = legalBalls > 0 && ballInOver === 0 ? legalBalls / ballsPerOver : undefined;

  return {
    overNumber: Math.floor(legalBalls / ballsPerOver),
    ballInOver,
    ballsPerOver,
    isComplete: completedOver !== undefined,
    completedOver,
  };
}

export function isOverComplete(legalBalls: number, ballsPerOver: number): boolean {
  return overProgressFor(legalBalls, ballsPerOver).isComplete;
}

export function decideInningsCompletion(
  state: Pick<InningsState, 'totalRuns' | 'totalWickets' | 'legalBalls' | 'isClosed' | 'closureReason'>,
  rules: ScoringRules,
): InningsCompletionDecision {
  const reason = completionReasonFor(state, rules);
  if (!reason) return { isClosed: false };

  return {
    isClosed: true,
    reason,
    effect: { type: 'INNINGS_CLOSED', reason },
  };
}

export function completionReasonFor(
  state: Pick<InningsState, 'totalRuns' | 'totalWickets' | 'legalBalls' | 'isClosed' | 'closureReason'>,
  rules: ScoringRules,
): InningsClosureReason | undefined {
  if (state.isClosed) return state.closureReason ?? 'MANUAL_CLOSE';
  if (state.totalWickets >= rules.wicketsAvailable) return 'ALL_OUT';
  if (rules.targetRuns !== undefined && state.totalRuns >= rules.targetRuns) return 'TARGET_REACHED';
  if (rules.oversLimit !== undefined && state.legalBalls >= rules.oversLimit * rules.ballsPerOver) {
    return 'OVERS_COMPLETE';
  }
  return undefined;
}
