import { describe, expect, it } from 'vitest';

import { nrrBallsForInnings } from './nrr';

describe('nrrBallsForInnings', () => {
  it('uses the full innings quota when a side is bowled out early', () => {
    expect(nrrBallsForInnings(44, 10, 10, 11)).toBe(60);
  });

  it('uses actual legal balls when the side is not all out', () => {
    expect(nrrBallsForInnings(44, 9, 10, 11)).toBe(44);
  });
});
