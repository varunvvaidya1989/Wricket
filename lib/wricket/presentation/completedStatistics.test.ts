import { describe, expect, it, vi } from 'vitest';
import { activeStatisticsBalls, bowlerCreditedWicket, matchesInPeriod, type StatisticsEvent } from './completedStatistics';
import { aggregateTournamentLeaderboard, rankLeaderboard, type MvpResultRecord } from './tournamentLeaderboard';

vi.mock('@/lib/supabase/client', () => ({ getSupabaseClient: vi.fn() }));
import { aggregatePersonalStatistics } from '@/lib/supabase/personalStatsApi';
import { aggregateTournamentStatistics } from '@/lib/supabase/tournamentStatsApi';

const matches = [
  { id: 'm1', status: 'COMPLETED', team_a_id: 'a', team_b_id: 'b', created_at: '2026-06-01T12:00:00Z', scheduled_at: null, result: { kind: 'WIN', winnerTeamId: 'a' } },
  { id: 'm2', status: 'COMPLETED', team_a_id: 'c', team_b_id: 'b', created_at: '2025-06-01T12:00:00Z', scheduled_at: null, result: { kind: 'WIN', winnerTeamId: 'b' } },
  { id: 'live', scheduled_at: null, status: 'IN_PROGRESS', team_a_id: 'a', team_b_id: 'b', created_at: '2026-06-01T12:00:00Z', result: null },
  { id: 'nr', scheduled_at: null, status: 'COMPLETED', team_a_id: 'a', team_b_id: 'b', created_at: '2026-06-01T12:00:00Z', result: { kind: 'NO_RESULT' } },
];
const ball = (id: string, match = 'm1', payload: Record<string, unknown> = {}): StatisticsEvent => ({
  id, client_event_id: id, match_id: match, sequence: 1, kind: 'BALL_RECORDED',
  payload: { striker_id: 'p', bowler_id: 'q', innings_id: 'i1', runs_bat: 4, runs_extra: 0, is_legal: true, ...payload },
});
const events = [ball('undo'), ball('keep'), ball('test2', 'm1', { innings_id: 'i3', runs_bat: 6 }), ball('undo', 'm2', { runs_bat: 1 }), ball('live', 'live'), ball('nr', 'nr'),
  { ...ball('correction'), kind: 'BALL_CORRECTED', sequence: 2, payload: { target_client_event_id: 'undo' } }];

describe('completed statistics', () => {
  it('excludes live, scheduled, abandoned and no-result matches, and scopes years', () => {
    const all = [...matches, { ...matches[0], id: 'scheduled', status: 'SCHEDULED' }, { ...matches[0], id: 'abandoned', status: 'ABANDONED' }];
    const now = new Date('2026-10-11T12:00:00Z');
    expect(matchesInPeriod(all, 'career', now).map(row => row.id)).toEqual(['m1', 'm2']);
    expect(matchesInPeriod(all, 'year', now).map(row => row.id)).toEqual(['m1']);
    expect(matchesInPeriod(all, 'previousYear', now).map(row => row.id)).toEqual(['m2']);
  });
  it('undo targets a client ID within its own match, preserving another match', () => {
    expect(activeStatisticsBalls(events).map(row => `${row.match_id}/${row.id}`)).toContain('m2/undo');
    expect(activeStatisticsBalls(events).map(row => `${row.match_id}/${row.id}`)).not.toContain('m1/undo');
  });
  it('uses the same correction history for personal and tournament statistics, counting Test innings separately', () => {
    const eligible = matchesInPeriod(matches, 'career');
    const personal = aggregatePersonalStatistics(['p'], eligible, [{ match_id: 'm1', player_id: 'p', team_id: 'a' }, { match_id: 'm2', player_id: 'p', team_id: 'c' }], events.filter(row => eligible.some(match => match.id === row.match_id)), [{ id: 'b', name: 'Other club' }], []);
    const tournament = aggregateTournamentStatistics(matches, events, new Map([['p', 'Player'], ['q', 'Bowler']]));
    expect(personal).toMatchObject({ matches: 2, runs: 11, ballsFaced: 3, innings: 3, highScore: 6 });
    expect(tournament.players.find(row => row.id === 'p')).toMatchObject({ matches: 2, runs: 11, ballsFaced: 3, innings: 3 });
    expect(tournament).toMatchObject({ matches: 4, completedMatches: 2, runs: 11, balls: 3 });
    expect(personal.history.map(row => row.result)).toEqual(['W', 'L']);
  });
  it('credits only bowling dismissals and reverses fielding, wickets and extras with a correction', () => {
    expect(bowlerCreditedWicket({ is_wicket: true, dismissal_kind: 'OBSTRUCTING_FIELD' })).toBe(false);
    expect(bowlerCreditedWicket({ is_wicket: true, dismissal_kind: 'RUN_OUT' })).toBe(false);
    expect(bowlerCreditedWicket({ is_wicket: true, dismissal_kind: 'CAUGHT' })).toBe(true);
    const undone = ball('undo', 'm1', { is_wicket: true, dismissal_kind: 'CAUGHT', fielder_id: 'f', out_player_id: 'p', extra_kind: 'NO_BALL', runs_extra: 1 });
    const stats = aggregateTournamentStatistics(matches, [undone, events.at(-1)!], new Map());
    expect(stats).toMatchObject({ runs: 0, wickets: 0, balls: 0, players: [] });
  });
});

const result = (player: string, match: string, overrides: Partial<MvpResultRecord> = {}): MvpResultRecord => ({
  player_id: player, match_id: match, team_id: match === 'm1' ? 'a' : 'c', algorithm_version: 'wricket-mvp-v1',
  batting_points: '1.123456', bowling_points: '2.234567', fielding_points: '0.345678', total_points: '3.703701',
  rank: 1, is_player_of_match: true, is_fighter_of_match: false,
  batting_breakdown: { runs: 10 }, bowling_breakdown: { wickets: 2 }, fielding_breakdown: { catches: 1, assistedRunOuts: 1 },
  players: { display_name: `Player ${player}` }, teams: { name: match === 'm1' ? 'Northstar Cricket Club' : 'Northstar Community Cricket Club' }, ...overrides,
});
describe('MVP leaderboard records', () => {
  it('preserves precision, distinct full team identities, history and actual discipline totals', () => {
    const rows = aggregateTournamentLeaderboard([result('p', 'm1'), result('p', 'm2')], matches, new Map([['b', 'Opponent club']]));
    expect(rows[0]).toMatchObject({ matchesPlayed: 2, runs: 20, wickets: 4, fieldingDismissals: 4, playerOfTheMatchCount: 2 });
    expect(rows[0].totalPoints).toBeCloseTo(7.407402, 6);
    expect(rows[0].teamIds).toEqual(['a', 'c']);
    expect(rows[0].teamNames).toEqual(['Northstar Cricket Club', 'Northstar Community Cricket Club']);
    expect(rows[0].matchDetails.map(row => row.opponentName)).toEqual(['Opponent club', 'Opponent club']);
  });
  it('never ranks ineligible null ranks or counts duplicate match/player records', () => {
    const rows = aggregateTournamentLeaderboard([result('p', 'm1'), result('p', 'm1'), result('q', 'm1', { rank: null }), result('z', 'missing')], matches, new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0].matchesPlayed).toBe(1);
  });
  it('uses recorded discipline metrics and preserves MVP tie order without display rounding', () => {
    const rows = aggregateTournamentLeaderboard([result('p', 'm1'), result('q', 'm1', { total_points: '3.703702', batting_breakdown: { runs: 1 } })], matches, new Map());
    expect(rows[0].playerId).toBe('q');
    expect(rankLeaderboard(rows, 'Batting')[0].playerId).toBe('p');
    expect(rankLeaderboard(rows, 'Bowling')[0].playerId).toBe('q');
  });
});
