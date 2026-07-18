import {
  closeInnings,
  createInnings,
  getMatch,
  listInningsForMatch,
  setMatchResult,
  setMatchStatus,
} from '../db/repo';
import { FormatRules, Innings, Match, MatchResult } from '../domain/types';

/**
 * Determine what should happen next once an innings is closed.
 * Returns null if match is now complete (result set), or the next innings to create.
 */
export interface NextStep {
  kind: 'NEXT_INNINGS' | 'FOLLOW_ON_DECISION' | 'COMPLETED';
  next?: {
    sequence: 1 | 2 | 3 | 4;
    battingTeamId: string;
    bowlingTeamId: string;
    target?: number;
    isFollowOn?: boolean;
  };
  result?: MatchResult;
}

export async function planNextStep(matchId: string): Promise<NextStep> {
  const match = await getMatch(matchId);
  if (!match) throw new Error('Match not found');
  const innings = await listInningsForMatch(matchId);
  const rules = match.rules;

  const inningsPerTeam = rules.inningsPerTeam;
  const totalInnings = inningsPerTeam * 2;

  if (innings.length === 0) return { kind: 'NEXT_INNINGS' };

  const last = innings[innings.length - 1];
  if (!last.isClosed) {
    return { kind: 'NEXT_INNINGS' }; // shouldn't be called
  }

  // Single-innings formats: BOX, TURF
  if (inningsPerTeam === 1) {
    if (innings.length === 1) {
      // start innings 2 with chase target
      return {
        kind: 'NEXT_INNINGS',
        next: {
          sequence: 2,
          battingTeamId: last.bowlingTeamId,
          bowlingTeamId: last.battingTeamId,
          target: last.totalRuns + 1,
        },
      };
    }
    // innings 2 closed → compute result
    return { kind: 'COMPLETED', result: computeSingleInningsResult(match, innings) };
  }

  // 2-innings format (TURF_TEST)
  if (innings.length === 1) {
    return {
      kind: 'NEXT_INNINGS',
      next: {
        sequence: 2,
        battingTeamId: last.bowlingTeamId,
        bowlingTeamId: last.battingTeamId,
      },
    };
  }

  if (innings.length === 2) {
    // After 2 innings, check follow-on availability
    const teamA = innings[0].battingTeamId;
    const teamARuns = innings[0].totalRuns;
    const teamBRuns = innings[1].totalRuns;
    const deficit = teamARuns - teamBRuns;
    if (rules.followOnEnabled && deficit >= rules.followOnThreshold) {
      return { kind: 'FOLLOW_ON_DECISION' };
    }
    // Normal: team A bats again
    return {
      kind: 'NEXT_INNINGS',
      next: {
        sequence: 3,
        battingTeamId: teamA,
        bowlingTeamId: innings[1].battingTeamId,
      },
    };
  }

  if (innings.length === 3) {
    // Set target for innings 4
    const totalsByTeam = new Map<string, number>();
    for (const inn of innings) {
      totalsByTeam.set(
        inn.battingTeamId,
        (totalsByTeam.get(inn.battingTeamId) ?? 0) + inn.totalRuns,
      );
    }
    const lastInn = innings[2];
    const battingNext = lastInn.bowlingTeamId;
    const opponentTotal = totalsByTeam.get(lastInn.battingTeamId) ?? 0;
    const ownTotal = totalsByTeam.get(battingNext) ?? 0;
    const target = opponentTotal - ownTotal + 1;

    // If target is <= 0 (chasing team already ahead), match is already over by an innings
    if (target <= 0) {
      return { kind: 'COMPLETED', result: computeTwoInningsResult(match, innings) };
    }

    return {
      kind: 'NEXT_INNINGS',
      next: {
        sequence: 4,
        battingTeamId: battingNext,
        bowlingTeamId: lastInn.battingTeamId,
        target,
      },
    };
  }

  // 4 innings done
  return { kind: 'COMPLETED', result: computeTwoInningsResult(match, innings) };
}

function computeSingleInningsResult(match: Match, innings: Innings[]): MatchResult {
  const [first, second] = innings;
  if (second.totalRuns > first.totalRuns) {
    return {
      kind: 'WIN_BY_WICKETS',
      winnerTeamId: second.battingTeamId,
      margin: match.rules.playersPerSide - 1 - second.totalWickets,
      marginUnit: 'WICKETS',
    };
  }
  if (second.totalRuns < first.totalRuns) {
    return {
      kind: 'WIN_BY_RUNS',
      winnerTeamId: first.battingTeamId,
      margin: first.totalRuns - second.totalRuns,
      marginUnit: 'RUNS',
    };
  }
  return { kind: 'TIE' };
}

function computeTwoInningsResult(match: Match, innings: Innings[]): MatchResult {
  const totalsByTeam = new Map<string, number>();
  for (const inn of innings) {
    totalsByTeam.set(
      inn.battingTeamId,
      (totalsByTeam.get(inn.battingTeamId) ?? 0) + inn.totalRuns,
    );
  }
  const teams = Array.from(totalsByTeam.keys());
  const [teamX, teamY] = teams;
  const tx = totalsByTeam.get(teamX)!;
  const ty = totalsByTeam.get(teamY)!;

  if (tx === ty) return { kind: 'TIE' };

  const winner = tx > ty ? teamX : teamY;
  const loser = tx > ty ? teamY : teamX;
  const margin = Math.abs(tx - ty);

  // Win by innings: winner used only 1 innings (loser batted both & still less)
  const winnerInnings = innings.filter(i => i.battingTeamId === winner);
  if (winnerInnings.length === 1) {
    return {
      kind: 'WIN_BY_INNINGS',
      winnerTeamId: winner,
      margin,
      marginUnit: 'RUNS',
    };
  }

  // Final innings is a chase: if winner batted last, win by wickets
  const lastInn = innings[innings.length - 1];
  if (lastInn.battingTeamId === winner) {
    return {
      kind: 'WIN_BY_WICKETS',
      winnerTeamId: winner,
      margin: match.rules.playersPerSide - 1 - lastInn.totalWickets,
      marginUnit: 'WICKETS',
    };
  }
  return {
    kind: 'WIN_BY_RUNS',
    winnerTeamId: winner,
    margin,
    marginUnit: 'RUNS',
  };
}

export async function closeAndAdvance(
  matchId: string,
  inningsId: string,
): Promise<NextStep> {
  await closeInnings(inningsId);
  const step = await planNextStep(matchId);
  if (step.kind === 'COMPLETED' && step.result) {
    await setMatchResult(matchId, step.result);
  } else if (step.kind === 'FOLLOW_ON_DECISION') {
    await setMatchStatus(matchId, 'FOLLOW_ON_DECISION');
  } else if (step.kind === 'NEXT_INNINGS' && step.next) {
    await setMatchStatus(matchId, 'INNINGS_BREAK');
  }
  return step;
}

export async function startNextInnings(
  matchId: string,
  step: NonNullable<NextStep['next']>,
): Promise<void> {
  await createInnings({
    matchId,
    sequence: step.sequence,
    battingTeamId: step.battingTeamId,
    bowlingTeamId: step.bowlingTeamId,
    target: step.target,
    isFollowOn: step.isFollowOn,
  });
  await setMatchStatus(matchId, 'IN_PROGRESS');
}
