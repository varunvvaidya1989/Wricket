import { describe, expect, it } from 'vitest';

import {
  BADMINTON_CONFIG,
  PADEL_CONFIG,
  PICKLEBALL_CONFIG,
  SPORT_CONFIGS,
  TABLE_TENNIS_CONFIG,
  TENNIS_CONFIG,
  appendPointEvent,
  deriveServiceCourt,
  formatScore,
  getCurrentUnit,
  getUnits,
  numericNotation,
  replay,
  undoLastPoint,
  winnerServesNextServeModel,
  type PointEvent,
  type Side,
  type SportConfig,
  type UnitConfig,
} from './index';

describe('recursive multi-sport scoring engine', () => {
  it('declares singles and doubles support for every racquet sport', () => {
    expect(Object.values(SPORT_CONFIGS).every((config) => (
      config.matchFormats.includes('SINGLES') && config.matchFormats.includes('DOUBLES')
    ))).toBe(true);
  });

  it('replays a complete tennis set ending 6-4', () => {
    const events = pointEvents(
      [0, 1, 0, 0, 1, 0, 1, 1, 0, 0].flatMap((gameWinner) =>
        Array<Side>(4).fill(gameWinner as Side),
      ),
    );

    const state = replay(TENNIS_CONFIG, events);
    const sets = getUnits(state, 'set');

    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ score: [6, 4], isComplete: true, winner: 0 });
    expect(getUnits(state, 'game')).toHaveLength(10);
    expect(state.root).toMatchObject({ score: [1, 0], isComplete: false });
    expect(state.serve).toEqual({ servingSide: 0 });
  });

  it('keeps tennis notation separate from integer state', () => {
    const deuce = replay(TENNIS_CONFIG, pointEvents([0, 1, 0, 1, 0, 1]));
    const game = requiredCurrentUnit(deuce, 'game');

    expect(game.score).toEqual([3, 3]);
    expect(formatScore(TENNIS_CONFIG, game, 0)).toBe('40');
    expect(formatScore(TENNIS_CONFIG, game, 1)).toBe('40');

    const advantage = replay(TENNIS_CONFIG, pointEvents([0, 1, 0, 1, 0, 1, 0]));
    const advantageGame = requiredCurrentUnit(advantage, 'game');
    expect(advantageGame.score).toEqual([4, 3]);
    expect(formatScore(TENNIS_CONFIG, advantageGame, 0)).toBe('AD');
    expect(formatScore(TENNIS_CONFIG, advantageGame, 1)).toBe('40');
  });

  it('uses the same sudden-death rule shape for padel golden point', () => {
    const events = pointEvents([0, 1, 0, 1, 0, 1, 0]);
    const regularState = replay(PADEL_CONFIG, events);
    const goldenPointState = replay(PADEL_CONFIG, events, {
      options: { goldenPoint: true },
    });

    expect(requiredCurrentUnit(regularState, 'game')).toMatchObject({
      score: [4, 3],
      isComplete: false,
    });
    expect(requiredCurrentUnit(goldenPointState, 'game')).toMatchObject({
      score: [4, 3],
      isComplete: true,
      winner: 0,
    });
    expect(requiredCurrentUnit(goldenPointState, 'set').score).toEqual([1, 0]);
  });

  it('completes badminton at 21 and enforces the 30-point cap', () => {
    const ordinary = replay(BADMINTON_CONFIG, pointEvents(Array<Side>(21).fill(0)));
    expect(requiredCurrentUnit(ordinary, 'game')).toMatchObject({
      score: [21, 0],
      isComplete: true,
      winner: 0,
    });

    const atTwentyNineAll = Array.from({ length: 58 }, (_, index) => (index % 2) as Side);
    const capped = replay(BADMINTON_CONFIG, pointEvents([...atTwentyNineAll, 0]));
    expect(requiredCurrentUnit(capped, 'game')).toMatchObject({
      score: [30, 29],
      isComplete: true,
      winner: 0,
    });
  });

  it('derives badminton service court from the server own even/odd score', () => {
    const atOneLove = replay(BADMINTON_CONFIG, pointEvents([0]));
    expect(atOneLove.serve.servingSide).toBe(0);
    expect(deriveServiceCourt(BADMINTON_CONFIG, atOneLove)).toBe('left');

    const atOneAll = replay(BADMINTON_CONFIG, pointEvents([0, 1]));
    expect(atOneAll.serve.servingSide).toBe(1);
    expect(deriveServiceCourt(BADMINTON_CONFIG, atOneAll)).toBe('left');

    const atTwoOne = replay(BADMINTON_CONFIG, pointEvents([0, 1, 0]));
    expect(atTwoOne.serve.servingSide).toBe(0);
    expect(deriveServiceCourt(BADMINTON_CONFIG, atTwoOne)).toBe('right');
  });

  it('rotates table-tennis serve every point after reaching 10-10', () => {
    const toDeuce = pointEvents(Array.from({ length: 20 }, (_, index) => (index % 2) as Side));
    const deuce = replay(TABLE_TENNIS_CONFIG, toDeuce);
    expect(requiredCurrentUnit(deuce, 'game').score).toEqual([10, 10]);
    expect(deuce.serve.servingSide).toBe(0);

    const elevenTen = replay(TABLE_TENNIS_CONFIG, appendWinner(toDeuce, 0));
    expect(requiredCurrentUnit(elevenTen, 'game').score).toEqual([11, 10]);
    expect(elevenTen.serve.servingSide).toBe(1);

    const twelveTenEvents = appendWinner(appendWinner(toDeuce, 0), 0);
    const twelveTen = replay(TABLE_TENNIS_CONFIG, twelveTenEvents);
    expect(requiredCurrentUnit(twelveTen, 'game')).toMatchObject({
      score: [12, 10],
      isComplete: true,
      winner: 0,
    });
    expect(twelveTen.serve.servingSide).toBe(1);
  });

  it('rotates tennis service during a tie-break and starts the next set with the receiver', () => {
    const twelveGames = Array.from({ length: 12 }, (_, index) => index % 2 as Side)
      .flatMap((winner) => Array<Side>(4).fill(winner));
    const atSixAll = pointEvents(twelveGames);

    expect(replay(TENNIS_CONFIG, atSixAll).serve.servingSide).toBe(0);
    expect(replay(TENNIS_CONFIG, appendWinner(atSixAll, 0)).serve.servingSide).toBe(1);
    expect(replay(TENNIS_CONFIG, pointEvents([...twelveGames, 0, 0])).serve.servingSide).toBe(1);
    expect(replay(TENNIS_CONFIG, pointEvents([...twelveGames, 0, 0, 0])).serve.servingSide).toBe(0);

    const afterTieBreak = replay(
      TENNIS_CONFIG,
      pointEvents([...twelveGames, ...Array<Side>(7).fill(0)]),
    );
    expect(afterTieBreak.root.score).toEqual([1, 0]);
    expect(afterTieBreak.serve.servingSide).toBe(1);
  });

  it('alternates the first table-tennis server between games', () => {
    const firstGame = pointEvents(Array<Side>(11).fill(0));
    const afterFirstGame = replay(TABLE_TENNIS_CONFIG, firstGame);
    expect(afterFirstGame.root.score).toEqual([1, 0]);
    expect(afterFirstGame.serve.servingSide).toBe(1);

    const secondGameStarts = replay(TABLE_TENNIS_CONFIG, appendWinner(firstGame, 0));
    expect(requiredCurrentUnit(secondGameStarts, 'game').score).toEqual([1, 0]);
    expect(secondGameStarts.serve.servingSide).toBe(1);
  });

  it('emits an end-switch effect at five points in the deciding table-tennis game', () => {
    const firstTwoGames = [0, 1].flatMap((winner) =>
      Array<Side>(11).fill(winner as Side),
    );
    const state = replay(
      TABLE_TENNIS_CONFIG,
      pointEvents([...firstTwoGames, 0, 0, 0, 0, 0]),
    );

    expect(state.root.score).toEqual([1, 1]);
    expect(requiredCurrentUnit(state, 'game').score).toEqual([5, 0]);
    expect(state.effects).toEqual([
      {
        type: 'SWITCH_ENDS',
        ruleId: 'table_tennis_final_game_end_switch',
        sequence: 27,
        unit: 'game',
        side: 0,
      },
    ]);
    expect(state.effectsByEvent[26]).toEqual(state.effects);
  });

  it('handles the pickleball first-server exception and two-server side-outs', () => {
    const initial = replay(PICKLEBALL_CONFIG, []);
    expect(initial.serve).toEqual({ servingSide: 0, serverNumber: 2 });

    const firstSideOut = replay(PICKLEBALL_CONFIG, pointEvents([1]));
    expect(getCurrentUnit(firstSideOut, 'game')).toBeUndefined();
    expect(firstSideOut.serve).toEqual({ servingSide: 1, serverNumber: 1 });

    const state = replay(PICKLEBALL_CONFIG, pointEvents([1, 1, 0, 0, 0]));
    expect(requiredCurrentUnit(state, 'game').score).toEqual([1, 1]);
    expect(state.serve).toEqual({ servingSide: 0, serverNumber: 1 });
  });

  it('enables pickleball rally scoring through a match option', () => {
    const state = replay(PICKLEBALL_CONFIG, pointEvents([1]), {
      options: { rallyScoring: true },
    });

    expect(requiredCurrentUnit(state, 'game').score).toEqual([0, 1]);
    expect(state.serve).toEqual({ servingSide: 1, serverNumber: 1 });
  });

  it('drops the last immutable event and derives undo state by replay', () => {
    const first = pointEvents([0, 1, 0]);
    const originalState = replay(BADMINTON_CONFIG, first);
    const undone = undoLastPoint(BADMINTON_CONFIG, first);

    expect(first).toHaveLength(3);
    expect(originalState.eventCount).toBe(3);
    expect(undone.events).toHaveLength(2);
    expect(undone.state).toEqual(replay(BADMINTON_CONFIG, first.slice(0, -1)));
    expect(Object.isFrozen(undone.state)).toBe(true);
    expect(Object.isFrozen(undone.state.root)).toBe(true);
  });

  it('adds another sport entirely through a SportConfig object', () => {
    const point: UnitConfig = {
      key: 'demo-point',
      level: 'point',
      target: 1,
      winBy: 1,
    };
    const game: UnitConfig = {
      key: 'demo-game',
      level: 'game',
      target: 3,
      winBy: 1,
      child: point,
    };
    const config: SportConfig = {
      id: 'demo-sixth-sport',
      name: 'Demo Sixth Sport',
      equipment: 'solid_paddle',
      matchFormats: ['SINGLES', 'DOUBLES'],
      root: {
        key: 'demo-match',
        level: 'match',
        target: 1,
        winBy: 1,
        child: game,
      },
      serveModel: winnerServesNextServeModel(),
      notation: numericNotation,
    };

    const state = replay(config, pointEvents([1, 1, 1]));
    expect(state).toMatchObject({ isComplete: true, winner: 1 });
    expect(requiredCurrentUnit(state, 'game').score).toEqual([0, 3]);
  });
});

function pointEvents(winners: readonly Side[]): readonly PointEvent[] {
  return winners.reduce<readonly PointEvent[]>(
    (events, winner, index) => appendPointEvent(events, {
      type: 'POINT',
      sequence: index + 1,
      winner,
    }),
    Object.freeze([]),
  );
}

function appendWinner(events: readonly PointEvent[], winner: Side): readonly PointEvent[] {
  return appendPointEvent(events, {
    type: 'POINT',
    sequence: events.length + 1,
    winner,
  });
}

function requiredCurrentUnit(
  state: ReturnType<typeof replay>,
  level: string,
): NonNullable<ReturnType<typeof getCurrentUnit>> {
  const unit = getCurrentUnit(state, level);
  if (!unit) throw new Error(`Expected a current ${level} unit.`);
  return unit;
}
