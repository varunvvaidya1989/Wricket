import { Ball, ExtraKind, DismissalKind } from './types';

export interface BallEvent {
  runs: number;              // runs scored off the bat (or signalled runs for byes/leg-byes)
  extra: ExtraKind;
  isWicket: boolean;
  dismissalKind?: DismissalKind;
  outPlayerId?: string;      // who got out (defaults to striker if omitted)
  fielderId?: string;
}

export interface InningsState {
  totalRuns: number;
  totalWickets: number;
  legalBalls: number;        // legitimate deliveries bowled
  overNo: number;            // 0-indexed current over
  legalBallInOver: number;   // 0-6, next position
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
}

export interface AppliedBall {
  ball: Omit<Ball, 'id' | 'inningsId' | 'createdAt'>;
  next: InningsState;
}

/**
 * Apply a scoring event to current innings state.
 * Encapsulates: extras handling, strike rotation, over completion, wicket bookkeeping.
 */
export function applyBall(state: InningsState, event: BallEvent): AppliedBall {
  const isLegal = event.extra !== 'WIDE' && event.extra !== 'NO_BALL';

  let runsBat = 0;
  let runsExtra = 0;

  switch (event.extra) {
    case 'WIDE':
      // Wide: 1 penalty + any additional runs run = all extras
      runsExtra = 1 + event.runs;
      runsBat = 0;
      break;
    case 'NO_BALL':
      // No-ball: 1 penalty extra + runs off bat go to batsman
      runsExtra = 1;
      runsBat = event.runs;
      break;
    case 'BYE':
    case 'LEG_BYE':
      runsExtra = event.runs;
      runsBat = 0;
      break;
    default:
      runsBat = event.runs;
      runsExtra = 0;
  }

  const runsThisBall = runsBat + runsExtra;

  // Strike rotation: only physically-run runs swap strike. Wides + byes count as physical runs run by batters.
  // For NO_BALL with bat runs, batters run between wickets, so runs off bat swap.
  // We treat: total *running* runs = (runsBat for bat/NB) + (extra runs beyond penalty for WIDE/BYE/LB).
  let physicalRuns: number;
  if (event.extra === 'WIDE') physicalRuns = event.runs; // beyond the 1 penalty
  else if (event.extra === 'NO_BALL') physicalRuns = event.runs;
  else if (event.extra === 'BYE' || event.extra === 'LEG_BYE')
    physicalRuns = event.runs;
  else physicalRuns = runsBat;

  let striker = state.strikerId;
  let nonStriker = state.nonStrikerId;
  if (physicalRuns % 2 === 1) {
    [striker, nonStriker] = [nonStriker, striker];
  }

  // Over completion: swap strike at end of legal 6th ball
  const newLegalBallInOver = isLegal ? state.legalBallInOver + 1 : state.legalBallInOver;
  const overComplete = isLegal && newLegalBallInOver === 6;
  if (overComplete) {
    [striker, nonStriker] = [nonStriker, striker];
  }

  // Wicket: striker leaves unless run-out specifies otherwise
  const isWicket = !!event.isWicket;
  let outPlayerId = event.outPlayerId;
  if (isWicket && !outPlayerId) outPlayerId = state.strikerId;

  // After wicket, the new batter comes on strike at the position the out batter was in
  // We do not auto-assign — the UI will prompt for next batter and call setNextBatter().
  // For now, if striker is the one out, striker becomes "PENDING" — caller handles.

  const ballRecord: AppliedBall['ball'] = {
    overNo: state.overNo,
    ballInOver: state.legalBallInOver + (isLegal ? 1 : 0),
    legalBallInOver: isLegal ? newLegalBallInOver : state.legalBallInOver,
    strikerId: state.strikerId,
    nonStrikerId: state.nonStrikerId,
    bowlerId: state.bowlerId,
    runsBat,
    runsExtra,
    extraKind: event.extra,
    isLegal,
    isWicket,
    dismissal: isWicket
      ? {
          kind: event.dismissalKind ?? 'BOWLED',
          outPlayerId: outPlayerId!,
          fielderId: event.fielderId,
        }
      : undefined,
  };

  const next: InningsState = {
    totalRuns: state.totalRuns + runsThisBall,
    totalWickets: state.totalWickets + (isWicket ? 1 : 0),
    legalBalls: state.legalBalls + (isLegal ? 1 : 0),
    overNo: overComplete ? state.overNo + 1 : state.overNo,
    legalBallInOver: overComplete ? 0 : newLegalBallInOver,
    strikerId: striker,
    nonStrikerId: nonStriker,
    bowlerId: state.bowlerId, // caller sets new bowler at start of new over
  };

  return { ball: ballRecord, next };
}

/**
 * Has the innings ended for one of the standard reasons?
 */
export function isInningsOver(
  state: InningsState,
  oversPerInnings: number,
  playersPerSide: number,
  targetRuns?: number,
): boolean {
  const allOut = state.totalWickets >= playersPerSide - 1;
  const oversBowled = state.legalBalls >= oversPerInnings * 6;
  const chased = targetRuns !== undefined && state.totalRuns >= targetRuns;
  return allOut || oversBowled || chased;
}

export function formatOver(legalBalls: number): string {
  const overs = Math.floor(legalBalls / 6);
  const balls = legalBalls % 6;
  return `${overs}.${balls}`;
}

export function runRate(runs: number, legalBalls: number): number {
  if (legalBalls === 0) return 0;
  return (runs / legalBalls) * 6;
}
