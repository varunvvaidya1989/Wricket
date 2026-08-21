import { describe, expect, it } from 'vitest';

import { isSportReleased, releasedSportCodes } from './sportRelease';

describe('sport release gate', () => {
  it('always keeps Cricket released', () => {
    expect(isSportReleased('CRICKET', false)).toBe(true);
  });

  it('keeps every non-cricket sport hidden while the rollout flag is off', () => {
    for (const code of ['BADMINTON', 'TENNIS', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL']) {
      expect(isSportReleased(code, false)).toBe(false);
    }
    expect(releasedSportCodes(['CRICKET', 'TENNIS', 'PADEL'], false)).toEqual(['CRICKET']);
    expect(isSportReleased('TENNIS')).toBe(false);
  });

  it('restores the resident implementations when the rollout flag is enabled', () => {
    expect(releasedSportCodes(['CRICKET', 'TENNIS', 'PADEL'], true)).toEqual([
      'CRICKET',
      'TENNIS',
      'PADEL',
    ]);
  });
});
