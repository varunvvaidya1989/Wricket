import { describe, expect, it } from 'vitest';

import {
  addCompetitionFixture,
  calculateCompetitionStandings,
  canManageCompetition,
  canScoreCompetition,
  createSportCompetition,
  projectCompetitionFixtures,
  saveSportCompetition,
  withCompetitionPointsRule,
  withLeagueSportProfile,
  withTournamentSquad,
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
    const entered = tournamentEntrant(tournament, 'Kitchen Crew', 0);

    expect(entered.entrants[0]).toMatchObject({
      entrantType: 'TEAM',
      name: 'Kitchen Crew',
      players: [
        { name: 'Kitchen Crew One', sportProfileId: 'profile-0' },
        { name: 'Kitchen Crew Two', sportProfileId: 'profile-1' },
      ],
    });
    expect(() => withLeagueSportProfile(tournament, accountPlayer('Ada', 0))).toThrow(/only enter a league/i);

    const league = createSportCompetition({
      id: 'singles-league',
      sportId: 'pickleball',
      name: 'Singles League',
      kind: 'LEAGUE',
      creatorAccountId: 'owner-1',
      now: 3,
    });
    expect(withLeagueSportProfile(league, accountPlayer('Ada', 0), 4, 'player-1').entrants[0])
      .toMatchObject({ entrantType: 'PLAYER', name: 'Ada', player: { name: 'Ada' } });
    expect(() => withTournamentSquad(league, squad('Crew', 0, 'SINGLES')))
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

    expect(() => withTournamentSquad(tournament, squad('One Short', 0, 'SINGLES')))
      .toThrow(/doubles-eligible/i);
  });

  it('registers only account-backed league players and reusable tournament squads', () => {
    const league = createSportCompetition({
      sportId: 'tennis',
      name: 'Verified League',
      kind: 'LEAGUE',
      creatorAccountId: 'owner-1',
      now: 1,
    });
    const enteredLeague = withLeagueSportProfile(league, {
      sportProfileId: 'profile-1',
      accountId: 'account-1',
      displayName: 'Verified Player',
    }, 2, 'entry-1');
    expect(enteredLeague.entrants[0]).toMatchObject({
      entrantType: 'PLAYER',
      player: { sportProfileId: 'profile-1', accountId: 'account-1' },
    });
    expect(() => withLeagueSportProfile(enteredLeague, {
      sportProfileId: 'profile-1',
      accountId: 'account-1',
      displayName: 'Verified Player',
    })).toThrow(/already entered/i);

    const tournament = createSportCompetition({
      sportId: 'padel',
      name: 'Verified Cup',
      kind: 'TOURNAMENT',
      matchFormat: 'DOUBLES',
      creatorAccountId: 'owner-1',
      now: 3,
    });
    const enteredTournament = withTournamentSquad(tournament, {
      sourceTeamId: 'team-1',
      name: 'Club Squad',
      players: [
        { sportProfileId: 'profile-1', accountId: 'account-1', displayName: 'One', eligibility: ['DOUBLES'] },
        { sportProfileId: 'profile-2', accountId: 'account-2', displayName: 'Two', eligibility: ['SINGLES', 'DOUBLES'] },
      ],
    }, 4, 'entry-2');
    expect(enteredTournament.entrants[0]).toMatchObject({
      entrantType: 'TEAM',
      sourceTeamId: 'team-1',
      players: [{ sportProfileId: 'profile-1' }, { sportProfileId: 'profile-2' }],
    });
    expect(() => withTournamentSquad(tournament, {
      sourceTeamId: 'team-2',
      name: 'Short Squad',
      players: [{ sportProfileId: 'profile-3', accountId: 'account-3', displayName: 'Three', eligibility: ['SINGLES'] }],
    })).toThrow(/doubles-eligible/i);
  });

  it('rejects hand-built guest identities at the persistence boundary', async () => {
    const league = createSportCompetition({
      sportId: 'tennis', name: 'Verified Only', kind: 'LEAGUE', creatorAccountId: 'owner-1', now: 1,
    });
    const guestRecord: SportCompetitionRecord = {
      ...league,
      entrants: [{
        entrantType: 'PLAYER', id: 'guest-entry', name: 'Guest', seed: 1,
        player: { id: 'guest-player', name: 'Guest' },
      }],
    };

    await expect(saveSportCompetition(guestRecord)).rejects.toThrow(/guest players are no longer supported/i);
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
      ? tournamentEntrant(current, name, index)
      : withLeagueSportProfile(current, accountPlayer(name, index), index + 10, `entrant-${index + 1}`),
    competition,
  );
}

function accountPlayer(name: string, index: number) {
  return { sportProfileId: `profile-${index}`, accountId: `account-${index}`, displayName: name };
}

function squad(name: string, index: number, eligibility: 'SINGLES' | 'DOUBLES') {
  return {
    sourceTeamId: `team-${index}`,
    name,
    players: [{ ...accountPlayer(`${name} Player`, index), eligibility: [eligibility] }],
  } as const;
}

function tournamentEntrant(competition: SportCompetitionRecord, name: string, index: number) {
  const players = competition.matchFormat === 'DOUBLES'
    ? [
        { ...accountPlayer(`${name} One`, index * 2), eligibility: ['DOUBLES'] as const },
        { ...accountPlayer(`${name} Two`, index * 2 + 1), eligibility: ['DOUBLES'] as const },
      ]
    : squad(name, index, 'SINGLES').players;
  return withTournamentSquad(competition, {
    sourceTeamId: `team-${index}`,
    name,
    players,
  }, index + 10, `entrant-${index + 1}`);
}
