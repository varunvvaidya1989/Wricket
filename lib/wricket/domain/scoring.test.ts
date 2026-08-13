import { describe, expect, it } from 'vitest';

import { applyBall, formatOver, isInningsOver, runRate } from './scoring';

const baseState = {
  totalRuns: 0,
  totalWickets: 0,
  legalBalls: 0,
  overNo: 0,
  legalBallInOver: 0,
  strikerId: 'striker',
  nonStrikerId: 'non-striker',
  bowlerId: 'bowler',
};

describe('applyBall', () => {
  it('records a legal scoring shot and rotates strike on odd runs', () => {
    const result = applyBall(baseState, {
      runs: 1,
      extra: null,
      isWicket: false,
    });

    expect(result.ball).toMatchObject({
      runsBat: 1,
      runsExtra: 0,
      isLegal: true,
      strikerId: 'striker',
    });
    expect(result.next).toMatchObject({
      totalRuns: 1,
      legalBalls: 1,
      legalBallInOver: 1,
      strikerId: 'non-striker',
      nonStrikerId: 'striker',
    });
  });

  it('does not count wides as legal balls', () => {
    const result = applyBall(baseState, {
      runs: 2,
      extra: 'WIDE',
      isWicket: false,
    });

    expect(result.ball).toMatchObject({
      runsBat: 0,
      runsExtra: 3,
      isLegal: false,
      ballInOver: 0,
    });
    expect(result.next).toMatchObject({
      totalRuns: 3,
      legalBalls: 0,
      legalBallInOver: 0,
    });
  });

  it('uses an explicit strike-rotation choice for additional extras', () => {
    const noRotation = applyBall(baseState, {
      runs: 1,
      extra: 'BYE',
      isWicket: false,
      rotateStrike: false,
    });
    const forcedRotation = applyBall(baseState, {
      runs: 2,
      extra: 'LEG_BYE',
      isWicket: false,
      rotateStrike: true,
    });

    expect(noRotation.ball.rotateStrike).toBe(false);
    expect(noRotation.next.strikerId).toBe('striker');
    expect(forcedRotation.next.strikerId).toBe('non-striker');
  });

  it('swaps strike at over completion', () => {
    const result = applyBall(
      {
        ...baseState,
        legalBalls: 5,
        legalBallInOver: 5,
      },
      {
        runs: 0,
        extra: null,
        isWicket: false,
      },
    );

    expect(result.next).toMatchObject({
      legalBalls: 6,
      overNo: 1,
      legalBallInOver: 0,
      strikerId: 'non-striker',
      nonStrikerId: 'striker',
    });
  });
});

describe('scoring helpers', () => {
  it('detects innings completion by overs, wickets, or target', () => {
    expect(isInningsOver({ ...baseState, legalBalls: 30 }, 5, 6)).toBe(true);
    expect(isInningsOver({ ...baseState, totalWickets: 5 }, 5, 6)).toBe(true);
    expect(isInningsOver({ ...baseState, totalRuns: 42 }, 5, 6, 42)).toBe(true);
    expect(isInningsOver({ ...baseState, legalBalls: 29 }, 5, 6, 42)).toBe(false);
  });

  it('formats overs and run rate deterministically', () => {
    expect(formatOver(17)).toBe('2.5');
    expect(runRate(45, 30)).toBe(9);
    expect(runRate(45, 0)).toBe(0);
  });
});
