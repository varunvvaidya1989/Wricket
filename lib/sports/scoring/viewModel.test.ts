import { describe, expect, it } from 'vitest';

import {
  BADMINTON_CONFIG,
  PICKLEBALL_CONFIG,
  TENNIS_CONFIG,
  appendPointEvent,
  canScoreSession,
  buildScoreboardView,
  createScoringSession,
  createSportCompetition,
  formatLiveHeadline,
  replay,
  type PointEvent,
  type Side,
} from './index';

describe('shared scoring UI view model', () => {
  it('starts every sport with a display-ready zero score', () => {
    const tennis = buildScoreboardView(TENNIS_CONFIG, replay(TENNIS_CONFIG, []), ['A', 'B']);
    const badminton = buildScoreboardView(BADMINTON_CONFIG, replay(BADMINTON_CONFIG, []), ['A', 'B']);

    expect(tennis.sides.map((side) => side.currentScore)).toEqual(['Love', 'Love']);
    expect(tennis.unitsLabel).toBe('SETS');
    expect(badminton.sides.map((side) => side.currentScore)).toEqual(['0', '0']);
    expect(badminton.unitsLabel).toBe('GAMES');
  });

  it('formats a compact live headline using sport-specific notation', () => {
    expect(formatLiveHeadline(TENNIS_CONFIG, replay(TENNIS_CONFIG, events([0])))).toBe(
      '0-0 · 15-Love',
    );
    expect(formatLiveHeadline(BADMINTON_CONFIG, replay(BADMINTON_CONFIG, events([0])))).toBe(
      '0-0 · 1-0',
    );
  });

  it('shows a fresh game after the previous game completes', () => {
    const state = replay(TENNIS_CONFIG, events([0, 0, 0, 0]));
    const view = buildScoreboardView(TENNIS_CONFIG, state, ['A', 'B']);

    expect(state.root.children[0].score).toEqual([1, 0]);
    expect(view.sides.map((side) => side.currentScore)).toEqual(['Love', 'Love']);
    expect(view.currentUnitLabel).toBe('CURRENT GAME');
  });

  it('shows numeric zeroes when a tie-break is pending at six-all', () => {
    const winners = Array.from({ length: 12 }, (_, index) => index % 2 as Side)
      .flatMap((winner) => Array<Side>(4).fill(winner));
    const state = replay(TENNIS_CONFIG, events(winners));
    const view = buildScoreboardView(TENNIS_CONFIG, state, ['A', 'B']);

    expect(view.sides.map((side) => side.currentScore)).toEqual(['0', '0']);
    expect(view.currentUnitLabel).toBe('TIE-BREAK');
  });

  it('provides serve and court details without sport branches in the view', () => {
    const state = replay(BADMINTON_CONFIG, events([0, 1, 0]));
    const view = buildScoreboardView(BADMINTON_CONFIG, state, ['Birds', 'Shuttles']);

    expect(view.sides[0]).toMatchObject({
      name: 'Birds',
      currentScore: '2',
      isServing: true,
      serviceDetail: 'RIGHT COURT',
    });
  });

  it('resets badminton service-court guidance after a game', () => {
    const state = replay(BADMINTON_CONFIG, events(Array<Side>(21).fill(0)));
    const view = buildScoreboardView(BADMINTON_CONFIG, state, ['A', 'B']);

    expect(view.sides[0]).toMatchObject({
      currentScore: '0',
      isServing: true,
      serviceDetail: 'RIGHT COURT',
    });
  });

  it('shows the pickleball server number supplied by the serve strategy', () => {
    const state = replay(PICKLEBALL_CONFIG, events([1]));
    const view = buildScoreboardView(PICKLEBALL_CONFIG, state, ['Kitchen A', 'Kitchen B']);

    expect(view.sides[1]).toMatchObject({ isServing: true, serviceDetail: 'SERVER 1' });
    expect(view.sides.map((side) => side.currentScore)).toEqual(['0', '0']);
  });

  it('links an individual match to a sport-owned tournament or league', () => {
    const competition = createSportCompetition({
      id: 'league-1',
      sportId: 'table_tennis',
      name: 'City League',
      kind: 'LEAGUE',
      creatorAccountId: 'owner-1',
      creatorName: 'Owner',
      now: 100,
    });
    const session = createScoringSession({
      id: 'match-1',
      sportId: 'table_tennis',
      sideNames: ['A', 'B'],
      initialServer: 0,
      competitionId: competition.id,
      fixtureId: 'fixture-1',
      sideEntrantIds: ['entrant-a', 'entrant-b'],
      createdByAccountId: 'owner-1',
      now: 101,
    });

    expect(competition).toMatchObject({ name: 'City League', kind: 'LEAGUE', matchFormat: 'SINGLES' });
    expect(session.competitionId).toBe('league-1');
    expect(session.fixtureId).toBe('fixture-1');
    expect(session.sideEntrantIds).toEqual(['entrant-a', 'entrant-b']);
    expect(session.createdByAccountId).toBe('owner-1');
    expect(session.matchFormat).toBe('SINGLES');
    expect(session.sidePlayers).toEqual([['A'], ['B']]);
    expect(canScoreSession(session, 'owner-1', competition)).toBe(true);
    expect(canScoreSession(session, 'viewer-1', competition)).toBe(false);
  });

  it('stores both players on each side of a doubles match', () => {
    const session = createScoringSession({
      id: 'doubles-1',
      sportId: 'tennis',
      matchFormat: 'DOUBLES',
      sideNames: ['A / B', 'C / D'],
      sidePlayers: [['A', 'B'], ['C', 'D']],
      initialServer: 0,
      createdByAccountId: 'owner-1',
      now: 1,
    });

    expect(session.matchFormat).toBe('DOUBLES');
    expect(session.sidePlayers).toEqual([['A', 'B'], ['C', 'D']]);
    expect(Object.isFrozen(session.sidePlayers[0])).toBe(true);
    expect(canScoreSession({ ...session, createdByAccountId: undefined }, 'owner-1')).toBe(false);
    expect(() => createScoringSession({
      sportId: 'tennis',
      sideNames: ['A', 'B'],
      initialServer: 0,
      createdByAccountId: ' ',
    })).toThrow(/sportstage account is required/i);
  });
});

function events(winners: readonly Side[]): readonly PointEvent[] {
  return winners.reduce<readonly PointEvent[]>(
    (log, winner, index) => appendPointEvent(log, {
      type: 'POINT',
      sequence: index + 1,
      winner,
    }),
    Object.freeze([]),
  );
}
