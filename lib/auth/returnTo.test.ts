import { describe, expect, it } from 'vitest';

import { safeAuthReturnTo } from './returnTo';

describe('safeAuthReturnTo', () => {
  it.each(['wricket', 'badminton', 'tennis', 'padel', 'table-tennis', 'pickleball'])('retains only the exact %s setup destination', sport => {
    expect(safeAuthReturnTo(`/${sport}/match/new`)).toBe(`/${sport}/match/new`);
    expect(safeAuthReturnTo(encodeURIComponent(`/${sport}/match/new`))).toBe(`/${sport}/match/new`);
    expect(safeAuthReturnTo(`/${sport}/match/new?role=OWNER`)).toBeUndefined();
    expect(safeAuthReturnTo(`/${sport}/match/../new`)).toBeUndefined();
  });
  it.each(['/apps', '/explore', '/start-match', '/switch-sport', '/profile', '/account', '/feed', '/notifications'])('returns to the known platform route %s', path => {
    expect(safeAuthReturnTo(path)).toBe(path);
    expect(safeAuthReturnTo(`${path}?returnTo=https://example.com`)).toBeUndefined();
  });
  it('preserves tournament invitation tokens through sign-in without allowing extra parameters', () => {
    const path = '/wricket/tournament/join?token=' + 'b'.repeat(48);
    expect(safeAuthReturnTo(path)).toBe(path);
    expect(safeAuthReturnTo(encodeURIComponent(path))).toBe(path);
    expect(safeAuthReturnTo(path + '&redirect=https://example.com')).toBeUndefined();
    expect(safeAuthReturnTo('/wricket/tournament/join?token=bad')).toBeUndefined();
  });
  it('preserves only a valid captain invitation through sign-in', () => {
    const path = '/wricket/team/join?token=' + 'a'.repeat(48);
    expect(safeAuthReturnTo(path)).toBe(path);
    expect(safeAuthReturnTo(encodeURIComponent(path))).toBe(path);
    expect(safeAuthReturnTo(path + '&redirect=https://example.com')).toBeUndefined();
    expect(safeAuthReturnTo('/wricket/team/join?token=invalid')).toBeUndefined();
  });
  it('accepts tournament resolver links', () => {
    expect(safeAuthReturnTo('/tournament?id=cloud-tournament_123')).toBe('/tournament?id=cloud-tournament_123');
    expect(safeAuthReturnTo('%2Ftournament%3Fid%3Dabc-123')).toBe('/tournament?id=abc-123');
  });

  it('accepts only known sport homes and competition pages', () => {
    expect(safeAuthReturnTo('/wricket')).toBe('/wricket');
    expect(safeAuthReturnTo('/table-tennis')).toBe('/table-tennis');
    expect(safeAuthReturnTo('/tennis/competition/abc-123?mode=view')).toBe('/tennis/competition/abc-123?mode=view');
    expect(safeAuthReturnTo('/unknown-sport')).toBeUndefined();
    expect(safeAuthReturnTo('/tennis/match/abc/score')).toBeUndefined();
  });

  it('rejects arbitrary and malformed redirects', () => {
    expect(safeAuthReturnTo('https://example.com')).toBeUndefined();
    expect(safeAuthReturnTo('//example.com/tournament?id=123')).toBeUndefined();
    expect(safeAuthReturnTo('/wricket/tournament/123')).toBeUndefined();
    expect(safeAuthReturnTo('%E0%A4%A')).toBeUndefined();
  });

  it.each(['tennis', 'badminton', 'padel', 'table-tennis', 'pickleball'])('retains a %s competition task through authentication', sport => {
    const path = `/${sport}/competition/abc-123`;
    expect(safeAuthReturnTo(path)).toBe(path);
    for (const section of ['overview', 'matches', 'entries', 'standings', 'rules', 'manage', 'entrants', 'schedule', 'points', 'officials', 'resources', 'publish', 'advanced', 'recovery', 'organizers']) {
      expect(safeAuthReturnTo(encodeURIComponent(`${path}?section=${section}`))).toBe(`${path}?section=${section}`);
    }
    expect(safeAuthReturnTo(`${path}?section=manage&redirect=https://example.com`)).toBeUndefined();
    expect(safeAuthReturnTo(`${path}?section=unknown`)).toBeUndefined();
    expect(safeAuthReturnTo(`${path}?role=OWNER`)).toBeUndefined();
    expect(safeAuthReturnTo(`/${sport}/competition/../account`)).toBeUndefined();
  });
});
