import {
  getTournament,
  listMatches,
  listInningsForMatch,
} from '../db/repo';

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
}

/**
 * Computes the points table for a tournament.
 * NRR = (runsFor / oversFor) - (runsAgainst / oversAgainst).
 * Note: for Turf Test (2 innings/team), we sum both innings totals.
 */
export async function computePointsTable(tournamentId: string): Promise<PointsRow[]> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return [];

  const matches = await listMatches(tournamentId);
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
      };
      rows.set(teamId, r);
    }
    return r;
  };

  for (const m of matches) {
    if (m.status !== 'COMPLETED' || !m.result) continue;
    const a = ensure(m.teamAId);
    const b = ensure(m.teamBId);
    a.played += 1;
    b.played += 1;

    // Track runs/overs for NRR
    const innings = await listInningsForMatch(m.id);
    for (const inn of innings) {
      const overs = inn.totalBalls / 6;
      const forTeam = ensure(inn.battingTeamId);
      const againstTeam = ensure(inn.bowlingTeamId);
      forTeam.runsFor += inn.totalRuns;
      forTeam.oversFor += overs;
      againstTeam.runsAgainst += inn.totalRuns;
      againstTeam.oversAgainst += overs;
    }

    const res = m.result;
    if (res.kind === 'TIE') {
      a.tied += 1;
      b.tied += 1;
      a.points += tournament.pointsTie;
      b.points += tournament.pointsTie;
    } else if (res.kind === 'NO_RESULT') {
      a.noResult += 1;
      b.noResult += 1;
      a.points += tournament.pointsNoResult;
      b.points += tournament.pointsNoResult;
    } else if (res.winnerTeamId) {
      const winner = ensure(res.winnerTeamId);
      const loser = res.winnerTeamId === m.teamAId ? b : a;
      winner.won += 1;
      loser.lost += 1;
      winner.points += tournament.pointsWin;
      loser.points += tournament.pointsLoss;
    }
  }

  const result = Array.from(rows.values()).map(r => {
    const nrr =
      (r.oversFor > 0 ? r.runsFor / r.oversFor : 0) -
      (r.oversAgainst > 0 ? r.runsAgainst / r.oversAgainst : 0);
    return { ...r, nrr };
  });

  result.sort((x, y) => y.points - x.points || y.nrr - x.nrr);
  return result;
}
