import { describe, expect, it } from 'vitest';

import {
  BADMINTON_CONFIG,
  PICKLEBALL_CONFIG,
  TENNIS_CONFIG,
  defaultSportRules,
  getUnits,
  normalizeSportRules,
  replay,
  sportRulesSummary,
  type PointEvent,
  type Side,
} from './index';

const events = (winners: readonly Side[]): PointEvent[] => winners.map((winner, index) => ({
  type: 'POINT', sequence: index + 1, winner,
}));

describe('sport match rule profiles', () => {
  it('ships lawful defaults for every non-cricket sport', () => {
    expect(sportRulesSummary('tennis', defaultSportRules('tennis'))).toContain('Best of 3 sets');
    expect(sportRulesSummary('badminton', defaultSportRules('badminton'))).toContain('cap 30');
    expect(sportRulesSummary('table_tennis', defaultSportRules('table_tennis'))).toContain('11 points, win by 2');
    expect(sportRulesSummary('pickleball', defaultSportRules('pickleball'))).toContain('side-out scoring');
  });

  it('rejects unsupported values and constrains long pickleball games to one game', () => {
    expect(normalizeSportRules('tennis', { matchUnitsToWin: 99 }).matchUnitsToWin).toBe(2);
    expect(normalizeSportRules('pickleball', { matchUnitsToWin: 3, gamePointTarget: 21 })).toMatchObject({
      matchUnitsToWin: 1,
      gamePointTarget: 21,
    });
  });

  it('changes the number of games required by the replay engine', () => {
    const state = replay(BADMINTON_CONFIG, events(Array<Side>(63).fill(0)), {
      options: { matchUnitsToWin: 3 },
    });
    expect(state.root).toMatchObject({ score: [3, 0], isComplete: true, winner: 0 });
  });

  it('supports a tennis advantage set without a tie-break at six-all', () => {
    const gameWinners: Side[] = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0];
    const state = replay(TENNIS_CONFIG, events(gameWinners.flatMap((winner) => Array<Side>(4).fill(winner))), {
      options: { matchUnitsToWin: 1, setTiebreak: false, setCap: 0 },
    });
    expect(getUnits(state, 'set').at(-1)).toMatchObject({ score: [8, 6], isComplete: true, winner: 0 });
    expect(state.isComplete).toBe(true);
  });

  it('applies the selected pickleball point target', () => {
    const state = replay(PICKLEBALL_CONFIG, events(Array<Side>(15).fill(0)), {
      options: { matchUnitsToWin: 1, gamePointTarget: 15, rallyScoring: true },
    });
    expect(getUnits(state, 'game').at(-1)).toMatchObject({ score: [15, 0], isComplete: true });
    expect(state.isComplete).toBe(true);
  });
});
