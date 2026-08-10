import { Innings, Match, Tournament } from './types';
import { nrrBallsForInnings } from './nrr';

export interface PointsRow {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  runsFor: number;
  oversFor: number;
  runsAgainst: number;
  oversAgainst: number;
  nrr: number;
  history: PointsHistoryEntry[];
}

export interface PointsHistoryEntry {
  matchId: string;
  opponentTeamId: string;
  scheduledAt?: number;
  result: 'W' | 'L' | 'T' | 'D' | 'NR';
  pointsAwarded: number;
  cumulativePoints: number;
  nrrAfterMatch: number;
}

export function computePointsTableFromData(
  tournament: Tournament,
  matches: Match[],
  inningsByMatch: Map<string, Innings[]>,
): PointsRow[] {
  const rows = new Map<string, PointsRow>();

  const ensure = (teamId: string): PointsRow => {
    let r = rows.get(teamId);
    if (!r) {
      r = {
        teamId,
        played: 0,
        won: 0,
        lost: 0,
        tied: 0,
        noResult: 0,
        points: 0,
        runsFor: 0,
        oversFor: 0,
        runsAgainst: 0,
        oversAgainst: 0,
        nrr: 0,
        history: [],
      };
      rows.set(teamId, r);
    }
    return r;
  };

  const orderedMatches = [...matches].sort(
    (a, b) => (a.scheduledAt ?? a.createdAt) - (b.scheduledAt ?? b.createdAt),
  );
  const calculateNrr = (row: PointsRow) =>
    (row.oversFor > 0 ? row.runsFor / row.oversFor : 0) -
    (row.oversAgainst > 0 ? row.runsAgainst / row.oversAgainst : 0);

  for (const m of orderedMatches) {
    if ((m.status !== 'COMPLETED' && m.status !== 'ABANDONED') || !m.result) continue;
    if (m.result.kind === 'CANCELLED') continue;
    const a = ensure(m.teamAId);
    const b = ensure(m.teamBId);
    a.played += 1;
    b.played += 1;

    const isNoResult = m.result.kind === 'NO_RESULT';
    const isWalkover = m.result.kind === 'WALKOVER';
    // Abandoned/no-result matches do not affect NRR.
    if (!isNoResult && !isWalkover) {
      const innings = inningsByMatch.get(m.id) ?? [];
      for (const inn of innings) {
        const overs = nrrBallsForInnings(
          inn.totalBalls,
          inn.totalWickets,
          m.rules.oversPerInnings,
          m.rules.playersPerSide,
        ) / 6;
        const forTeam = ensure(inn.battingTeamId);
        const againstTeam = ensure(inn.bowlingTeamId);
        forTeam.runsFor += inn.totalRuns;
        forTeam.oversFor += overs;
        againstTeam.runsAgainst += inn.totalRuns;
        againstTeam.oversAgainst += overs;
      }
    }

    const res = m.result;
    let aResult: PointsHistoryEntry['result'] = 'NR';
    let bResult: PointsHistoryEntry['result'] = 'NR';
    let aAwarded = 0;
    let bAwarded = 0;
    if (res.kind === 'TIE') {
      a.tied += 1;
      b.tied += 1;
      a.points += 1;
      b.points += 1;
      aAwarded = bAwarded = 1;
      aResult = bResult = 'T';
    } else if (res.kind === 'DRAW') {
      a.tied += 1;
      b.tied += 1;
      a.points += 1;
      b.points += 1;
      aAwarded = bAwarded = 1;
      aResult = bResult = 'D';
    } else if (isNoResult) {
      a.noResult += 1;
      b.noResult += 1;
      a.points += 1;
      b.points += 1;
      aAwarded = bAwarded = 1;
    } else if (res.winnerTeamId) {
      const winner = ensure(res.winnerTeamId);
      const loser = res.winnerTeamId === m.teamAId ? b : a;
      winner.won += 1;
      loser.lost += 1;
      winner.points += tournament.pointsWin;
      loser.points += tournament.pointsLoss;
      aResult = res.winnerTeamId === m.teamAId ? 'W' : 'L';
      bResult = res.winnerTeamId === m.teamBId ? 'W' : 'L';
      aAwarded = aResult === 'W' ? tournament.pointsWin : tournament.pointsLoss;
      bAwarded = bResult === 'W' ? tournament.pointsWin : tournament.pointsLoss;
    }
    a.nrr = calculateNrr(a);
    b.nrr = calculateNrr(b);
    a.history.push({ matchId: m.id, opponentTeamId: m.teamBId, scheduledAt: m.scheduledAt, result: aResult, pointsAwarded: aAwarded, cumulativePoints: a.points, nrrAfterMatch: a.nrr });
    b.history.push({ matchId: m.id, opponentTeamId: m.teamAId, scheduledAt: m.scheduledAt, result: bResult, pointsAwarded: bAwarded, cumulativePoints: b.points, nrrAfterMatch: b.nrr });
  }

  const result = Array.from(rows.values()).map(r => {
    const nrr = calculateNrr(r);
    return { ...r, nrr };
  });

  result.sort((x, y) => y.points - x.points || y.nrr - x.nrr);
  return result;
}
