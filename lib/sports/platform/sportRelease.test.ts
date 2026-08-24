import { describe, expect, it } from 'vitest';

import { isSportReleased, releasedSportCodes } from './sportRelease';

describe('sport release gate', () => {
  it('always keeps Cricket released', () => {
    expect(isSportReleased('CRICKET', false)).toBe(true);
  });

  it('still supports an explicit emergency disable switch', () => {
    for (const code of ['BADMINTON', 'TENNIS', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL']) {
      expect(isSportReleased(code, false)).toBe(false);
    }
    expect(releasedSportCodes(['CRICKET', 'TENNIS', 'PADEL'], false)).toEqual(['CRICKET']);
  });

  it('releases the resident implementations by default and when explicitly enabled', () => {
    expect(isSportReleased('TENNIS')).toBe(true);
    expect(releasedSportCodes(['CRICKET', 'TENNIS', 'PADEL'])).toEqual([
      'CRICKET',
      'TENNIS',
      'PADEL',
    ]);
    expect(releasedSportCodes(['CRICKET', 'TENNIS', 'PADEL'], true)).toEqual([
      'CRICKET',
      'TENNIS',
      'PADEL',
    ]);
  });
});
