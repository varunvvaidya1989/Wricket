import type {
  Ball,
  BatterRetirement,
  PendingScoringPrompt,
  ScoreAdjustment,
  ScoringSession,
} from '../domain/types';

export interface RestoredScoringState {
  readonly totalRuns: number;
  readonly totalWickets: number;
  readonly legalBalls: number;
  readonly overNo: number;
  readonly legalBallInOver: number;
  readonly strikerId: string | null;
  readonly nonStrikerId: string | null;
  readonly bowlerId: string | null;
  readonly pendingPrompt: PendingScoringPrompt;
  readonly pendingPlayerId: string | null;
  readonly completedOver: number | null;
  readonly lastCommittedEventSequence: number;
  readonly source: 'SESSION' | 'BALL_HISTORY';
}

export function restoreScoringState(input: {
  readonly inningsId: string;
  readonly balls: readonly Ball[];
  readonly adjustments: readonly ScoreAdjustment[];
  readonly retirements: readonly BatterRetirement[];
  readonly session?: ScoringSession | null;
}): RestoredScoringState {
  const historyState = deriveScoringStateFromHistory(input.balls, input.adjustments, input.retirements);
  if (
    !input.session ||
    input.session.inningsId !== input.inningsId ||
    input.session.lastCommittedEventSequence !== historyState.lastCommittedEventSequence
  ) {
    return historyState;
  }

  return {
    ...historyState,
    strikerId: input.session.strikerId ?? null,
    nonStrikerId: input.session.nonStrikerId ?? null,
    bowlerId: input.session.bowlerId ?? null,
    pendingPrompt: input.session.pendingPrompt,
    pendingPlayerId: input.session.pendingPlayerId ?? null,
    completedOver: input.session.completedOver ?? null,
    lastCommittedEventSequence: input.session.lastCommittedEventSequence,
    source: 'SESSION',
  };
}

export function deriveScoringStateFromHistory(
  balls: readonly Ball[],
  adjustments: readonly ScoreAdjustment[] = [],
  retirements: readonly BatterRetirement[] = [],
): RestoredScoringState {
  let totalRuns = totalAdjustmentRuns(adjustments);
  let totalWickets = totalRetiredOuts(retirements);
  let legalBalls = 0;
  let overNo = 0;
  let legalBallInOver = 0;
  let strikerId: string | null = null;
  let nonStrikerId: string | null = null;
  let bowlerId: string | null = null;

  for (const ball of balls) {
    strikerId = ball.strikerId;
    nonStrikerId = ball.nonStrikerId;
    bowlerId = ball.bowlerId;
    totalRuns += ball.runsBat + ball.runsExtra;
    totalWickets += ball.isWicket ? 1 : 0;

    if (ball.isLegal) {
      legalBalls += 1;
      legalBallInOver = ball.legalBallInOver;
    }

    const shouldRotateStrike = ball.rotateStrike ?? physicalRunsForBall(ball) % 2 === 1;
    if (shouldRotateStrike) {
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
    }

    const overComplete = ball.isLegal && ball.legalBallInOver === 6;
    if (overComplete) {
      overNo += 1;
      legalBallInOver = 0;
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      bowlerId = null;
    }
  }

  return {
    totalRuns,
    totalWickets,
    legalBalls,
    overNo,
    legalBallInOver,
    strikerId,
    nonStrikerId,
    bowlerId,
    pendingPrompt: null,
    pendingPlayerId: null,
    completedOver: null,
    lastCommittedEventSequence: balls.length + adjustments.length + retirements.length,
    source: 'BALL_HISTORY',
  };
}

function totalAdjustmentRuns(items: readonly ScoreAdjustment[]): number {
  return items.reduce((sum, item) => sum + item.runs, 0);
}

function totalRetiredOuts(items: readonly BatterRetirement[]): number {
  return items.filter(item => item.kind === 'RETIRED_OUT').length;
}

function physicalRunsForBall(ball: Ball): number {
  if (ball.extraKind === 'WIDE') return ball.runsExtra - 1;
  if (ball.extraKind === 'NO_BALL') return ball.runsBat;
  if (ball.extraKind === 'BYE' || ball.extraKind === 'LEG_BYE') return ball.runsExtra;
  return ball.runsBat;
}
