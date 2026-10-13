import { describe, expect, it } from 'vitest';
import type { CloudLiveMatch, CloudMatchEvent } from '@/lib/supabase/liveMatchApi';
import { buildCompleteScorecard } from './spectatorScorecard';
import { matchSharePath, matchShareSummary, matchShareUrl, spectatorResult } from './matchShare';
import { safeAuthReturnTo } from '@/lib/auth/returnTo';

function match(): CloudLiveMatch {
  return { id: 'cloud-123', tournamentName: 'City league', format: 'TURF', status: 'IN_PROGRESS', rules: { oversPerInnings: 10 },
    teamA: { id: 'a', name: 'Northstar', shortName: 'NCC' }, teamB: { id: 'b', name: 'Falcons', shortName: 'FF' },
    innings: { id: 'i1', sequence: 1, battingTeamId: 'a', isFollowOn: false },
    allInnings: [1, 2, 3, 4].map(sequence => ({ id: `i${sequence}`, sequence, battingTeamId: sequence % 2 ? 'a' : 'b', isFollowOn: false, status: 'IN_PROGRESS', totalRuns: 0, totalWickets: 0, totalBalls: 0 })),
    score: { runs: 0, wickets: 0, legalBalls: 0, latestSequence: 0 }, commentary: [], scorecard: {}, playerNames: { p1: 'Ravi', p2: 'Dev', p3: 'Arjun', b1: 'Aman' } };
}
function event(sequence: number, payload: Record<string, unknown> = {}, kind = 'BALL_RECORDED'): CloudMatchEvent {
  return { id: `server-${sequence}`, clientEventId: `client-${sequence}`, sequence, kind, createdAt: '2026-09-28T12:00:00Z', payload: { innings_id: 'i1', striker_id: 'p1', non_striker_id: 'p2', bowler_id: 'b1', runs_bat: 1, runs_extra: 0, is_legal: true, ...payload } };
}
describe('spectator scorecards', () => {
  it('includes the non-striker without inventing balls or runs', () => {
    const data = match(); data.commentary = [event(1)];
    expect(buildCompleteScorecard(data)[0].batters).toContainEqual({ id: 'p2', runs: 0, balls: 0, fours: 0, sixes: 0, out: false });
  });
  it('isolates all four innings and removes only the corrected delivery', () => {
    const data = match(); data.commentary = [event(1), event(2, { runs_bat: 4 }), event(3, { target_client_event_id: 'client-2' }, 'BALL_CORRECTED'), event(4, { innings_id: 'i2', runs_bat: 6 }), event(5, { innings_id: 'i3', runs_bat: 2 }), event(6, { innings_id: 'i4', runs_bat: 3 })];
    expect(buildCompleteScorecard(data).map(card => card.batters[0].runs)).toEqual([1, 6, 2, 3]);
    expect(buildCompleteScorecard(data)[0].bowlers[0]).toMatchObject({ runs: 1, balls: 1, wickets: 0 });
  });
  it('preserves retirement, then clears retired hurt only after the player re-enters', () => {
    const data = match(); data.commentary = [event(1), event(2, { player_id: 'p1', retirement_kind: 'RETIRED_HURT' }, 'BATTER_RETIRED')];
    expect(buildCompleteScorecard(data)[0].batters[0]).toMatchObject({ out: false, dismissal: 'retired hurt' });
    data.commentary.push(event(3));
    expect(buildCompleteScorecard(data)[0].batters[0]).toMatchObject({ runs: 2, dismissal: undefined });
    data.commentary.push(event(4, { player_id: 'p2', retirement_kind: 'RETIRED_OUT' }, 'BATTER_RETIRED'));
    expect(buildCompleteScorecard(data)[0].batters[1]).toMatchObject({ out: true, dismissal: 'retired out' });
    expect(buildCompleteScorecard(data)[0].bowlers[0].wickets).toBe(0);
  });
  it('excludes byes from bowler runs and run-outs from bowler wickets', () => {
    const data = match(); data.commentary = [event(1, { runs_bat: 0, runs_extra: 2, extra_kind: 'BYE' }), event(2, { runs_bat: 0, is_wicket: true, dismissal_kind: 'RUN_OUT', out_player_id: 'p2' })];
    expect(buildCompleteScorecard(data)[0].bowlers[0]).toMatchObject({ runs: 0, wickets: 0, balls: 2 });
    expect(buildCompleteScorecard(data)[0].batters[1].out).toBe(true);
  });
});
describe('match result and safe sharing', () => {
  it.each([['NO_RESULT', 'No result'], ['CANCELLED', 'Match cancelled'], ['TIE', 'Match tied'], ['DRAW', 'Match drawn']])('uses the official %s outcome', (kind, expected) => {
    const data = match(); data.status = 'COMPLETED'; data.result = { kind };
    expect(spectatorResult(data)).toBe(expected);
    expect(matchShareSummary(data).result).toBe(expected);
  });
  it('does not infer a winner from totals without an official outcome', () => {
    const data = match(); data.status = 'COMPLETED'; data.allInnings[0].totalRuns = 400;
    expect(spectatorResult(data)).toBe('Match ended · result unavailable');
  });
  it('handles walkovers and innings wins', () => {
    const data = match(); data.status = 'COMPLETED'; data.result = { kind: 'WALKOVER', winnerTeamId: 'b' };
    expect(spectatorResult(data)).toBe('Falcons won by walkover');
    data.result = { kind: 'WIN_BY_INNINGS', winnerTeamId: 'a', margin: 1, marginUnit: 'RUNS' };
    expect(spectatorResult(data)).toBe('Northstar won by an innings and 1 run');
  });
  it('shares only allowlisted fields and preserves safe auth return paths', () => {
    const data = match(); data.rules = { organiserPhone: 'PRIVATE-CONTACT', oversPerInnings: 10 }; data.scorecard = { secret: 'PRIVATE-CONTACT' };
    expect(JSON.stringify(matchShareSummary(data))).not.toContain('PRIVATE-CONTACT');
    expect(matchShareUrl(data.id)).toBe('https://sportstageapp.expo.app/match?id=cloud-123');
    expect(safeAuthReturnTo(matchSharePath(data.id))).toBe('/match?id=cloud-123');
    expect(safeAuthReturnTo('/match?id=x&redirect=https://bad.test')).toBeUndefined();
    expect(() => matchSharePath('../auth')).toThrow();
  });
});
