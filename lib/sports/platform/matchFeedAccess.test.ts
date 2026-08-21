import { describe, expect, it } from 'vitest';

import type { CloudSport } from '@/lib/supabase/profiles';
import { resolveMatchFeedAccess } from './matchFeedAccess';

const activeTennis: CloudSport = {
  id: 'tennis-id', code: 'TENNIS', name: 'Tennis', status: 'AVAILABLE',
  accessStatus: 'ACTIVE', isPrimary: true, appRoute: '/tennis',
};

describe('match feed access', () => {
  it('requires authentication before evaluating sport access', () => {
    expect(resolveMatchFeedAccess({ authenticated: false, connectedSports: [], sportCode: 'TENNIS', scoringMatchId: 'match-1' })).toEqual({ kind: 'SIGN_IN' });
  });

  it('rejects sports that have no app in this release', () => {
    expect(resolveMatchFeedAccess({ authenticated: true, connectedSports: [], sportCode: 'SQUASH', scoringMatchId: 'match-1' }).kind).toBe('UNSUPPORTED');
  });

  it('keeps resident non-cricket feeds closed until the release flag is enabled', () => {
    const decision = resolveMatchFeedAccess({
      authenticated: true,
      connectedSports: [activeTennis],
      sportCode: 'TENNIS',
      scoringMatchId: 'match-1',
    });
    expect(decision).toMatchObject({ kind: 'UNSUPPORTED', title: 'Tennis is coming later' });
  });

  it('explains when the account has not selected the sport', () => {
    const decision = resolveMatchFeedAccess({ authenticated: true, connectedSports: [], nonCricketEnabled: true, sportCode: 'TENNIS', scoringMatchId: 'match-1' });
    expect(decision).toMatchObject({ kind: 'UNAVAILABLE', title: 'Tennis app unavailable' });
    if (decision.kind === 'UNAVAILABLE') expect(decision.message).toContain('Add Tennis');
  });

  it.each([
    ['COMING_SOON', 'not ready yet'],
    ['SUSPENDED', 'paused'],
  ] as const)('explains %s access', (accessStatus, copy) => {
    const decision = resolveMatchFeedAccess({
      authenticated: true,
      connectedSports: [{ ...activeTennis, accessStatus }],
      nonCricketEnabled: true,
      sportCode: 'TENNIS', scoringMatchId: 'match-1',
    });
    expect(decision.kind).toBe('UNAVAILABLE');
    if (decision.kind === 'UNAVAILABLE') expect(decision.message).toContain(copy);
  });

  it('routes active accounts directly to the sport-specific cloud feed', () => {
    expect(resolveMatchFeedAccess({ authenticated: true, connectedSports: [activeTennis], nonCricketEnabled: true, sportCode: 'TENNIS', scoringMatchId: 'match-1' })).toEqual({
      kind: 'OPEN', route: '/tennis/match/match-1/feed',
    });
  });

  it('routes cricket to its existing detailed live match screen', () => {
    const cricket: CloudSport = {
      ...activeTennis,
      id: 'cricket-id',
      code: 'CRICKET',
      name: 'Cricket',
      appRoute: '/wricket',
    };
    expect(resolveMatchFeedAccess({ authenticated: true, connectedSports: [cricket], sportCode: 'CRICKET', scoringMatchId: 'match-1' })).toEqual({
      kind: 'OPEN', route: '/wricket/match/match-1/live',
    });
  });
});
