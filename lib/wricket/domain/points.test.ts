import { describe, expect, it } from 'vitest';

import { computePointsTableFromData } from './points';
import type { Match, Tournament } from './types';

const tournament = {
  pointsWin: 2,
  pointsLoss: 0,
  pointsTie: 5,
  pointsNoResult: 5,
} as Tournament;

const baseMatch = {
  tournamentId: 'tournament',
  format: 'T20',
  rules: { oversPerInnings: 20, playersPerSide: 11 },
  teamAId: 'a',
  teamBId: 'b',
  createdAt: 1,
} as Match;

describe('computePointsTableFromData', () => {
  it.each([
    ['TIE', 'COMPLETED', 'T'],
    ['DRAW', 'COMPLETED', 'D'],
    ['NO_RESULT', 'ABANDONED', 'NR'],
  ] as const)('awards one point to each team for %s', (kind, status, historyResult) => {
    const rows = computePointsTableFromData(tournament, [{
      ...baseMatch,
      id: kind,
      status,
      result: { kind },
    }], new Map());

    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.points === 1 && row.played === 1)).toBe(true);
    expect(rows.every(row => row.history[0].result === historyResult)).toBe(true);
  });

  it('records cumulative points and NRR progression', () => {
    const rows = computePointsTableFromData(tournament, [
      { ...baseMatch, id: 'win', status: 'COMPLETED', result: { kind: 'WIN_BY_RUNS', winnerTeamId: 'a' } },
      { ...baseMatch, id: 'nr', status: 'ABANDONED', result: { kind: 'NO_RESULT' }, createdAt: 2 },
    ], new Map());
    const teamA = rows.find(row => row.teamId === 'a')!;
    expect(teamA.history.map(item => item.cumulativePoints)).toEqual([2, 3]);
    expect(teamA.noResult).toBe(1);
  });

  it('excludes a cancelled match from points, played counts, history, and NRR', () => {
    const rows = computePointsTableFromData(tournament, [{
      ...baseMatch,
      id: 'cancelled',
      status: 'ABANDONED',
      result: { kind: 'CANCELLED' },
    }], new Map());

    expect(rows).toEqual([]);
  });

  it('awards a walkover without applying innings data to NRR', () => {
    const rows = computePointsTableFromData(tournament, [{
      ...baseMatch,
      id: 'walkover',
      status: 'COMPLETED',
      result: { kind: 'WALKOVER', winnerTeamId: 'a' },
    }], new Map());

    expect(rows.find(row => row.teamId === 'a')).toMatchObject({ played: 1, won: 1, points: 2, nrr: 0 });
    expect(rows.find(row => row.teamId === 'b')).toMatchObject({ played: 1, lost: 1, points: 0, nrr: 0 });
  });
});
