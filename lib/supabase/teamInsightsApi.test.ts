import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  getSupabaseClient: vi.fn(),
}));
import { buildTeamInsights } from './teamInsightsApi';

describe('team insights', () => {
  it('combines reusable team entries across tournaments and groups opponent entities', () => {
    const insights = buildTeamInsights({
      familyIds: ['team-base', 'team-entry'],
      teams: [
        { id: 'opponent-entry', name: 'Opponent Entry', short_name: 'OE', source_team_id: 'opponent-base' },
        { id: 'opponent-base', name: 'Opponents', short_name: 'OPP', source_team_id: null },
        { id: 'third-team', name: 'Third Team', short_name: 'THD', source_team_id: null },
      ],
      matches: [
        match('win', 'team-entry', 'opponent-entry', '2026-08-04', { kind: 'WIN_BY_RUNS', winnerTeamId: 'team-entry' }),
        match('loss', 'opponent-base', 'team-base', '2026-08-03', { kind: 'WIN_BY_WICKETS', winnerTeamId: 'opponent-base' }),
        match('tie', 'team-base', 'third-team', '2026-08-02', { kind: 'TIE' }),
        { ...match('nr', 'third-team', 'team-entry', '2026-08-01', { kind: 'NO_RESULT' }), status: 'ABANDONED' },
      ],
      innings: [
        innings('win', 'team-entry', 145), innings('win', 'opponent-entry', 120),
        innings('loss', 'opponent-base', 151), innings('loss', 'team-base', 150),
        innings('tie', 'team-base', 90), innings('tie', 'third-team', 90),
        innings('nr', 'team-entry', 40), innings('nr', 'third-team', 12),
      ],
    });

    expect(insights.stats).toEqual({
      played: 4,
      won: 1,
      lost: 1,
      tied: 1,
      noResult: 1,
      winRate: 25,
      runsFor: 425,
      runsAgainst: 373,
      highestScore: 150,
    });
    expect(insights.history.map(item => item.outcome)).toEqual(['W', 'L', 'T', 'NR']);
    expect(insights.headToHead[0]).toMatchObject({
      opponentTeamId: 'opponent-base',
      opponentName: 'Opponents',
      played: 2,
      won: 1,
      lost: 1,
      tied: 0,
      noResult: 0,
    });
  });

  it('returns an empty record when a team has no completed matches', () => {
    expect(buildTeamInsights({ familyIds: ['team'], teams: [], matches: [], innings: [] })).toEqual({
      stats: {
        played: 0, won: 0, lost: 0, tied: 0, noResult: 0,
        winRate: 0, runsFor: 0, runsAgainst: 0, highestScore: 0,
      },
      history: [],
      headToHead: [],
    });
  });
});

function match(
  id: string,
  teamAId: string,
  teamBId: string,
  date: string,
  result: Record<string, unknown>,
) {
  return {
    id,
    team_a_id: teamAId,
    team_b_id: teamBId,
    format: 'T20',
    status: 'COMPLETED',
    result,
    scheduled_at: `${date}T10:00:00.000Z`,
    created_at: `${date}T09:00:00.000Z`,
    tournaments: { name: 'Summer Cup' },
  };
}

function innings(matchId: string, battingTeamId: string, totalRuns: number) {
  return { match_id: matchId, batting_team_id: battingTeamId, total_runs: totalRuns };
}
