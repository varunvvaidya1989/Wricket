import { describe, expect, it } from 'vitest';

import { safeAuthReturnTo } from './returnTo';

describe('safeAuthReturnTo', () => {
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
});
