export interface TestInningsSummary {
  id: string;
  sequence: number;
  battingTeamId: string;
  totalRuns: number;
  totalBalls: number;
  isFollowOn?: boolean;
}

export interface TestMatchSituation {
  positionText?: string;
  followOnText?: string;
}

interface SituationInput {
  format: string;
  followOnEnabled: boolean;
  oversPerInnings: number;
  currentInnings: Pick<TestInningsSummary, 'id' | 'sequence' | 'battingTeamId'>;
  currentRuns: number;
  innings: readonly TestInningsSummary[];
  teamName: (teamId: string) => string;
}

/** Returns the follow-on deficit for the configured Test innings length. */
export function followOnThresholdForOvers(oversPerInnings: number): number {
  return oversPerInnings < 10 ? 25 : 200;
}

export function runsNeededToAvoidFollowOn(
  firstInningsRuns: number,
  secondInningsRuns: number,
  threshold: number,
): number {
  const safeScore = Math.max(0, firstInningsRuns - threshold + 1);
  return Math.max(0, safeScore - secondInningsRuns);
}

export function canEnforceFollowOn(firstInningsRuns: number, secondInningsRuns: number, threshold: number): boolean {
  return runsNeededToAvoidFollowOn(firstInningsRuns, secondInningsRuns, threshold) > 0;
}
/** Describes the aggregate Test-match position at the current score. */
export function testMatchSituation(input: SituationInput): TestMatchSituation {
  if (input.format !== 'TURF_TEST' || input.currentInnings.sequence < 2) return {};

  const completedAndCurrent = input.innings
    .filter(item => item.sequence <= input.currentInnings.sequence)
    .map(item => item.id === input.currentInnings.id
      ? { ...item, totalRuns: input.currentRuns }
      : item);
  const battingTotal = completedAndCurrent
    .filter(item => item.battingTeamId === input.currentInnings.battingTeamId)
    .reduce((sum, item) => sum + item.totalRuns, 0);
  const opponent = completedAndCurrent.find(item => item.battingTeamId !== input.currentInnings.battingTeamId);
  if (!opponent) return {};
  const opponentTotal = completedAndCurrent
    .filter(item => item.battingTeamId === opponent.battingTeamId)
    .reduce((sum, item) => sum + item.totalRuns, 0);
  const difference = battingTotal - opponentTotal;
  const battingName = input.teamName(input.currentInnings.battingTeamId);
  const positionText = difference > 0
    ? `${battingName} lead by ${difference} run${difference === 1 ? '' : 's'}`
    : difference < 0
      ? `${battingName} trail by ${Math.abs(difference)} run${difference === -1 ? '' : 's'}`
      : 'Scores are level';

  let followOnText: string | undefined;
  if (input.currentInnings.sequence === 2 && input.followOnEnabled) {
    const firstInnings = completedAndCurrent.find(item => item.sequence === 1);
    if (firstInnings) {
      const threshold = followOnThresholdForOvers(input.oversPerInnings);
      const needed = runsNeededToAvoidFollowOn(firstInnings.totalRuns, input.currentRuns, threshold);
      followOnText = needed > 0
        ? `${battingName} need ${needed} more run${needed === 1 ? '' : 's'} to avoid the follow-on`
        : `${battingName} have avoided the follow-on`;
    }
  }

  return { positionText, followOnText };
}

export interface ComparableMatchEvent {
  kind: string;
  sequence: number;
  payload: Record<string, unknown>;
}

/** Replays an innings up to the equivalent legal-ball mark for an over comparison. */
export function scoreAtLegalBalls(
  events: readonly ComparableMatchEvent[],
  inningsId: string,
  legalBallLimit: number,
): number {
  let runs = 0;
  let legalBalls = 0;
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (legalBalls >= legalBallLimit) break;
    if (String(event.payload.innings_id ?? '') !== inningsId) continue;
    if (event.kind === 'SCORE_ADJUSTED' && legalBalls <= legalBallLimit) {
      runs += Number(event.payload.runs ?? 0);
      continue;
    }
    if (event.kind !== 'BALL_RECORDED') continue;
    runs += Number(event.payload.runs_bat ?? 0) + Number(event.payload.runs_extra ?? 0);
    if (event.payload.is_legal) legalBalls += 1;
  }
  return runs;
}
