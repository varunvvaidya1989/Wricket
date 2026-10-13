import { describe, expect, it } from 'vitest';
import { BADMINTON_CONFIG, PADEL_CONFIG, PICKLEBALL_CONFIG, TABLE_TENNIS_CONFIG, TENNIS_CONFIG } from './configs';
import { replay } from './engine';
import { buildRacketScorePresentation } from './scorePresentation';
import type { PointEvent, Side } from './types';

const rallies = (winners: readonly Side[]): PointEvent[] => winners.map((winner, index) => ({ type: 'POINT', sequence: index + 1, winner }));

describe('racket score-card presentation', () => {
  it('opens the next game at zero after a completed badminton game', () => {
    const events = rallies(Array<Side>(21).fill(0));
    const state = replay(BADMINTON_CONFIG, events);
    const view = buildRacketScorePresentation(BADMINTON_CONFIG, state, events, 0);
    expect(view.context).toContain('GAME 2');
    expect(view.rounds[0]).toMatchObject({ complete: true, score: [21, 0], current: false });
    expect(view.rounds[1]).toMatchObject({ current: true, available: true });
    expect(view.rounds[2].available).toBe(false);
    expect(view.sides.map(side => side.score)).toEqual(['0', '0']);
  });

  it('keeps tennis notation and derives game point from the engine', () => {
    const events = rallies([0, 0, 0]);
    const view = buildRacketScorePresentation(TENNIS_CONFIG, replay(TENNIS_CONFIG, events), events, 0);
    expect(view.sides.map(side => side.score)).toEqual(['40', 'Love']);
    expect(view.sides[0].hint).toBe('Game point · +1');
    expect(view.rounds[0].label).toBe('S1');
  });

  it('labels padel golden point only when that saved rule is enabled', () => {
    const events = rallies([0, 1, 0, 1, 0, 1]);
    const normal = buildRacketScorePresentation(PADEL_CONFIG, replay(PADEL_CONFIG, events), events, 0);
    const golden = buildRacketScorePresentation(PADEL_CONFIG, replay(PADEL_CONFIG, events, { options: { goldenPoint: true } }), events, 0);
    expect(normal.sides[0].hint).toBe('Tap to score +1');
    expect(golden.sides.map(side => side.hint)).toEqual(['Golden point · +1', 'Golden point · +1']);
  });

  it('distinguishes a pickleball rally from a point with the actual first server', () => {
    const events = rallies([0]);
    const state = replay(PICKLEBALL_CONFIG, events, { initialServer: 1 });
    const view = buildRacketScorePresentation(PICKLEBALL_CONFIG, state, events, 1);
    expect(view.sides.map(side => side.score)).toEqual(['0', '0']);
    expect(view.sides[0].serving).toBe(true);
    expect(view.sides[1].hint).toBe('Win rally · change serve');
    expect(state.eventCount).toBe(1);
  });

  it('does not imply side-out when pickleball rally scoring is selected', () => {
    const state = replay(PICKLEBALL_CONFIG, [], { options: { rallyScoring: true } });
    const view = buildRacketScorePresentation(PICKLEBALL_CONFIG, state, [], 0);
    expect(view.sides[1].hint).toBe('Tap to score +1');
  });

  it('shows table-tennis service turns and every-point service at deuce', () => {
    const one = rallies([0]);
    const first = buildRacketScorePresentation(TABLE_TENNIS_CONFIG, replay(TABLE_TENNIS_CONFIG, one), one, 0);
    expect(first.sides[0].service).toBe('2 OF 2');
    const tied = rallies(Array.from({ length: 20 }, (_, index) => index % 2 as Side));
    const deuce = buildRacketScorePresentation(TABLE_TENNIS_CONFIG, replay(TABLE_TENNIS_CONFIG, tied), tied, 0);
    expect(deuce.sides.find(side => side.serving)?.service).toBe('EVERY POINT');
    expect(deuce.sides[0].hint).toBe('Tap to score +1');
  });

  it('uses the selected best-of and identifies match point', () => {
    const events = rallies(Array<Side>(10).fill(0));
    const state = replay(TABLE_TENNIS_CONFIG, events, { options: { matchUnitsToWin: 1 } });
    const view = buildRacketScorePresentation(TABLE_TENNIS_CONFIG, state, events, 0);
    expect(view.rounds).toHaveLength(1);
    expect(view.sides[0].hint).toBe('Match point · +1');
    const bestOfFive = buildRacketScorePresentation(TABLE_TENNIS_CONFIG, replay(TABLE_TENNIS_CONFIG, [], { options: { matchUnitsToWin: 3 } }), [], 0);
    expect(bestOfFive.rounds).toHaveLength(5);
    expect(bestOfFive.context).toContain('BEST OF 5');
  });

  it('does not add a future live round to a completed match', () => {
    const events = rallies(Array<Side>(11).fill(0));
    const state = replay(TABLE_TENNIS_CONFIG, events, { options: { matchUnitsToWin: 1 } });
    const view = buildRacketScorePresentation(TABLE_TENNIS_CONFIG, state, events, 0);
    expect(view.rounds.every(round => !round.current)).toBe(true);
    expect(view.sides.map(side => side.hint)).toEqual(['MATCH WINNER', 'FINAL']);
  });
});
