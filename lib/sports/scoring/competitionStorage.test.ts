import { describe, expect, it } from 'vitest';

import {
  addCompetitionFixture,
  calculateCompetitionStandings,
  canManageCompetition,
  canScoreCompetition,
  createSportCompetition,
  projectCompetitionFixtures,
  withLeaguePlayer,
  withCompetitionPointsRule,
  withTournamentTeam,
  withCompetitionOfficial,
  type SportCompetitionRecord,
} from './index';

describe('racquet competition management', () => {
  it('schedules only the matchup selected by the owner', () => {
    const competition = entrants(createSportCompetition({
      id: 'cup',
      sportId: 'tennis',
      name: 'City Cup',
      kind: 'TOURNAMENT',
      creatorAccountId: 'owner-1',
      now: 1,
    }), ['One', 'Two', 'Three']);
    const scheduled = addCompetitionFixture(competition, {
      id: 'fixture-1',
      entrantAId: competition.entrants[2].id,
      entrantBId: competition.entrants[0].id,
      scheduledAt: 100,
      court: 'Centre Court',
      now: 10,
    });

    expect(projectCompetitionFixtures(scheduled)).toEqual([
      expect.objectContaining({
        id: 'fixture-1',
        roundLabel: 'SCHEDULED',
        sideAId: competition.entrants[2].id,
        sideBId: competition.entrants[0].id,
        scheduledAt: 100,
        court: 'Centre Court',
      }),
    ]);
  });

  it('applies the configured win and loss points to completed matches', () => {
    const base = createSportCompetition({
      id: 'points',
      sportId: 'table_tennis',
      name: 'Points League',
      kind: 'LEAGUE',
      creatorAccountId: 'owner-1',
      now: 1,
    });
    const configured = withCompetitionPointsRule(entrants(base, ['A', 'B', 'C']), { win: 3, loss: 1 }, 2);
    const scheduled = addCompetitionFixture(configured, {
      id: 'fixture-1',
      entrantAId: configured.entrants[0].id,
      entrantBId: configured.entrants[1].id,
      now: 3,
    });
    const first = projectCompetitionFixtures(scheduled)[0];
    const standings = calculateCompetitionStandings(scheduled, [{
      fixtureId: first.id,
      winnerEntrantId: first.sideAId!,
    }]);

    expect(standings[0]).toMatchObject({ entrantId: first.sideAId, played: 1, won: 1, points: 3 });
    expect(standings.find((row) => row.entrantId === first.sideBId))
      .toMatchObject({ played: 1, lost: 1, points: 1 });
  });

  it('separates tournament teams from league players', () => {
    const tournament = createSportCompetition({
      id: 'doubles-cup',
      sportId: 'pickleball',
      name: 'Doubles Cup',
      kind: 'TOURNAMENT',
      matchFormat: 'DOUBLES',
      creatorAccountId: 'owner-1',
      now: 1,
    });
    const entered = withTournamentTeam(tournament, {
      name: 'Kitchen Crew',
      playerNames: ['Ada', 'Grace'],
    }, 2, 'team-1');

    expect(entered.entrants[0]).toMatchObject({
      entrantType: 'TEAM',
      name: 'Kitchen Crew',
      players: [{ name: 'Ada' }, { name: 'Grace' }],
    });
    expect(() => withLeaguePlayer(tournament, 'Ada')).toThrow(/only enter a league/i);

    const league = createSportCompetition({
      id: 'singles-league',
      sportId: 'pickleball',
      name: 'Singles League',
      kind: 'LEAGUE',
      creatorAccountId: 'owner-1',
      now: 3,
    });
    expect(withLeaguePlayer(league, 'Ada', 4, 'player-1').entrants[0])
      .toMatchObject({ entrantType: 'PLAYER', name: 'Ada', player: { name: 'Ada' } });
    expect(() => withTournamentTeam(league, { name: 'Crew', playerNames: ['Ada'] }))
      .toThrow(/only enter a tournament/i);
  });

  it('requires two players per doubles tournament team', () => {
    const tournament = createSportCompetition({
      sportId: 'badminton',
      name: 'Club Doubles',
      kind: 'TOURNAMENT',
      matchFormat: 'DOUBLES',
      creatorAccountId: 'owner-1',
      now: 1,
    });

    expect(() => withTournamentTeam(tournament, { name: 'One Short', playerNames: ['Only'] }))
      .toThrow(/exactly 2 players/i);
  });

  it('allows only the creator and assigned officials to score', () => {
    const competition = createSportCompetition({
      sportId: 'tennis',
      name: 'Officials Cup',
      kind: 'TOURNAMENT',
      creatorAccountId: 'owner-1',
      creatorName: 'Owner',
      now: 1,
    });

    expect(canManageCompetition(competition, 'owner-1')).toBe(true);
    expect(canManageCompetition(competition, undefined)).toBe(false);
    expect(canScoreCompetition(competition, 'viewer-1')).toBe(false);
    const assigned = withCompetitionOfficial(competition, {
      accountId: 'official-1',
      displayName: 'Match Official',
    }, 'owner-1', 2);
    expect(canScoreCompetition(assigned, 'official-1')).toBe(true);
    expect(canManageCompetition(assigned, 'official-1')).toBe(false);
    expect(() => withCompetitionOfficial(assigned, {
      accountId: 'official-2',
      displayName: 'Other Official',
    }, 'viewer-1')).toThrow(/only the competition creator/i);

    const ownerless: SportCompetitionRecord = { ...competition, creatorAccountId: undefined };
    expect(canManageCompetition(ownerless, 'owner-1')).toBe(false);
    expect(canScoreCompetition(ownerless, 'owner-1')).toBe(false);
    expect(() => createSportCompetition({
      sportId: 'tennis',
      name: 'Invalid Cup',
      kind: 'TOURNAMENT',
      creatorAccountId: ' ',
      now: 4,
    })).toThrow(/sportstage account is required/i);
  });
});

function entrants(
  competition: SportCompetitionRecord,
  names: readonly string[],
): SportCompetitionRecord {
  return names.reduce(
    (current, name, index) => current.kind === 'TOURNAMENT'
      ? withTournamentTeam(current, { name, playerNames: [`${name} Player`] }, index + 10, `entrant-${index + 1}`)
      : withLeaguePlayer(current, name, index + 10, `entrant-${index + 1}`),
    competition,
  );
}
