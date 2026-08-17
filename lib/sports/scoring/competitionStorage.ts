import AsyncStorage from '@react-native-async-storage/async-storage';

import { isScoringSportId, type ScoringSportId } from './presentation';
import type { MatchFormat } from './types';

const STORAGE_KEY = 'sportstage:racquet-competitions:v1';

export type CompetitionKind = 'TOURNAMENT' | 'LEAGUE';

export interface CompetitionPointsRule {
  readonly win: number;
  readonly loss: number;
}

export interface CompetitionOfficial {
  readonly accountId: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
}

export interface CompetitionPlayer {
  readonly id: string;
  readonly name: string;
}

interface CompetitionEntrantBase {
  readonly id: string;
  readonly name: string;
  readonly seed: number;
}

export interface LeaguePlayerEntrant extends CompetitionEntrantBase {
  readonly entrantType: 'PLAYER';
  readonly player: CompetitionPlayer;
}

export interface TournamentTeamEntrant extends CompetitionEntrantBase {
  readonly entrantType: 'TEAM';
  readonly players: readonly CompetitionPlayer[];
}

export type CompetitionEntrant = LeaguePlayerEntrant | TournamentTeamEntrant;

export interface CompetitionFixtureSource {
  readonly fixtureId: string;
}

export interface CompetitionFixture {
  readonly id: string;
  readonly round: number;
  readonly roundLabel: string;
  readonly slot: number;
  readonly entrantAId?: string;
  readonly entrantBId?: string;
  readonly sourceA?: CompetitionFixtureSource;
  readonly sourceB?: CompetitionFixtureSource;
  readonly scheduledAt?: number;
  readonly court?: string;
}

export interface SportCompetitionRecord {
  readonly version: 1;
  readonly id: string;
  readonly sportId: ScoringSportId;
  readonly name: string;
  readonly kind: CompetitionKind;
  readonly matchFormat: MatchFormat;
  readonly creatorAccountId?: string;
  readonly creatorName: string;
  readonly officials: readonly CompetitionOfficial[];
  readonly pointsRule: CompetitionPointsRule;
  readonly entrants: readonly CompetitionEntrant[];
  readonly fixtures: readonly CompetitionFixture[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CompetitionFixtureResult {
  readonly fixtureId: string;
  readonly winnerEntrantId: string;
}

export interface ProjectedCompetitionFixture extends CompetitionFixture {
  readonly sideAId?: string;
  readonly sideBId?: string;
  readonly winnerEntrantId?: string;
  readonly isBye: boolean;
}

export interface CompetitionStanding {
  readonly entrantId: string;
  readonly played: number;
  readonly won: number;
  readonly lost: number;
  readonly points: number;
}

export function createSportCompetition(input: {
  readonly sportId: ScoringSportId;
  readonly name: string;
  readonly kind: CompetitionKind;
  readonly matchFormat?: MatchFormat;
  readonly creatorAccountId: string;
  readonly creatorName?: string;
  readonly now?: number;
  readonly id?: string;
}): SportCompetitionRecord {
  const name = cleanName(input.name, 60);
  if (!name) throw new Error('Competition name is required.');
  const creatorAccountId = input.creatorAccountId.trim();
  if (!creatorAccountId) throw new Error('A SportStage account is required to create a competition.');
  const matchFormat = input.matchFormat ?? 'SINGLES';
  if (input.kind === 'LEAGUE' && matchFormat !== 'SINGLES') {
    throw new Error('Leagues register individual players and use singles matches.');
  }
  const now = input.now ?? Date.now();
  return freezeCompetition({
    version: 1,
    id: input.id ?? `competition-${now}-${Math.random().toString(36).slice(2, 9)}`,
    sportId: input.sportId,
    name,
    kind: input.kind,
    matchFormat,
    creatorAccountId,
    creatorName: cleanName(input.creatorName ?? '', 60) || 'Local creator',
    officials: [],
    pointsRule: { win: 2, loss: 0 },
    entrants: [],
    fixtures: [],
    createdAt: now,
    updatedAt: now,
  });
}

export async function listSportCompetitions(
  sportId?: ScoringSportId,
): Promise<readonly SportCompetitionRecord[]> {
  const competitions = await readCompetitions();
  const filtered = sportId
    ? competitions.filter((competition) => competition.sportId === sportId)
    : competitions;
  return Object.freeze([...filtered].sort((left, right) => right.updatedAt - left.updatedAt));
}

export async function getSportCompetition(
  id: string,
): Promise<SportCompetitionRecord | undefined> {
  return (await readCompetitions()).find((competition) => competition.id === id);
}

export async function saveSportCompetition(
  competition: SportCompetitionRecord,
): Promise<SportCompetitionRecord> {
  const valid = validateCompetition(competition);
  const competitions = await readCompetitions();
  const next = [valid, ...competitions.filter((candidate) => candidate.id !== valid.id)];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return valid;
}

export async function removeSportCompetition(id: string): Promise<void> {
  const competitions = await readCompetitions();
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(competitions.filter((competition) => competition.id !== id)),
  );
}

export function withLeaguePlayer(
  competition: SportCompetitionRecord,
  nameValue: string,
  now = Date.now(),
  id = `entrant-${now}-${Math.random().toString(36).slice(2, 8)}`,
): SportCompetitionRecord {
  if (competition.kind !== 'LEAGUE') {
    throw new Error('Individual players can only enter a league. Add a team to this tournament.');
  }
  const name = cleanName(nameValue, 40);
  if (!name) throw new Error('Player name is required.');
  if (competition.entrants.some((entrant) => entrant.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('That player is already entered.');
  }
  return freezeCompetition({
    ...competition,
    entrants: [...competition.entrants, {
      entrantType: 'PLAYER',
      id,
      name,
      seed: competition.entrants.length + 1,
      player: { id: `${id}-player`, name },
    }],
    fixtures: [],
    updatedAt: now,
  });
}

export function withTournamentTeam(
  competition: SportCompetitionRecord,
  input: { readonly name: string; readonly playerNames: readonly string[] },
  now = Date.now(),
  id = `entrant-${now}-${Math.random().toString(36).slice(2, 8)}`,
): SportCompetitionRecord {
  if (competition.kind !== 'TOURNAMENT') {
    throw new Error('Teams can only enter a tournament. Add an individual player to this league.');
  }
  const name = cleanName(input.name, 40);
  if (!name) throw new Error('Team name is required.');
  if (competition.entrants.some((entrant) => entrant.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('That team is already entered.');
  }
  const playerNames = input.playerNames.map((playerName) => cleanName(playerName, 40));
  if (playerNames.some((playerName) => !playerName)) throw new Error('Every player needs a name.');
  const expectedPlayers = competition.matchFormat === 'DOUBLES' ? 2 : 1;
  if (playerNames.length !== expectedPlayers) {
    throw new Error(`${competition.matchFormat === 'DOUBLES' ? 'Doubles' : 'Singles'} teams require exactly ${expectedPlayers} player${expectedPlayers === 1 ? '' : 's'}.`);
  }
  if (new Set(playerNames.map((playerName) => playerName.toLowerCase())).size !== playerNames.length) {
    throw new Error('Use a different name for each player on the team.');
  }
  return freezeCompetition({
    ...competition,
    entrants: [...competition.entrants, {
      entrantType: 'TEAM',
      id,
      name,
      seed: competition.entrants.length + 1,
      players: playerNames.map((playerName, index) => ({
        id: `${id}-player-${index + 1}`,
        name: playerName,
      })),
    }],
    fixtures: [],
    updatedAt: now,
  });
}

export function competitionEntrantPlayers(
  entrant: CompetitionEntrant,
): readonly CompetitionPlayer[] {
  return entrant.entrantType === 'TEAM' ? entrant.players : Object.freeze([entrant.player]);
}

export function canManageCompetition(
  competition: SportCompetitionRecord,
  accountId: string | undefined,
): boolean {
  return Boolean(accountId && competition.creatorAccountId === accountId);
}

export function canScoreCompetition(
  competition: SportCompetitionRecord,
  accountId: string | undefined,
): boolean {
  return canManageCompetition(competition, accountId)
    || Boolean(accountId && competition.officials.some((official) => official.accountId === accountId));
}

export function withCompetitionOfficial(
  competition: SportCompetitionRecord,
  official: CompetitionOfficial,
  actorAccountId: string | undefined,
  now = Date.now(),
): SportCompetitionRecord {
  if (!canManageCompetition(competition, actorAccountId)) {
    throw new Error('Only the competition creator can assign match officials.');
  }
  const accountId = official.accountId.trim();
  const displayName = cleanName(official.displayName, 60);
  if (!accountId || !displayName) throw new Error('Choose a valid SportStage member.');
  if (accountId === competition.creatorAccountId) {
    throw new Error('The competition creator can already score every match.');
  }
  if (competition.officials.some((candidate) => candidate.accountId === accountId)) {
    throw new Error('That match official is already assigned.');
  }
  return freezeCompetition({
    ...competition,
    officials: [...competition.officials, {
      accountId,
      displayName,
      avatarUrl: cleanUrl(official.avatarUrl),
    }],
    updatedAt: now,
  });
}

export function withoutCompetitionOfficial(
  competition: SportCompetitionRecord,
  officialAccountId: string,
  actorAccountId: string | undefined,
  now = Date.now(),
): SportCompetitionRecord {
  if (!canManageCompetition(competition, actorAccountId)) {
    throw new Error('Only the competition creator can remove match officials.');
  }
  return freezeCompetition({
    ...competition,
    officials: competition.officials.filter((official) => official.accountId !== officialAccountId),
    updatedAt: now,
  });
}

export function withCompetitionPointsRule(
  competition: SportCompetitionRecord,
  pointsRule: CompetitionPointsRule,
  now = Date.now(),
): SportCompetitionRecord {
  assertPointsValue(pointsRule.win, 'Win points');
  assertPointsValue(pointsRule.loss, 'Loss points');
  return freezeCompetition({ ...competition, pointsRule, updatedAt: now });
}

export function addCompetitionFixture(
  competition: SportCompetitionRecord,
  input: {
    readonly entrantAId: string;
    readonly entrantBId: string;
    readonly scheduledAt?: number;
    readonly court?: string;
    readonly now?: number;
    readonly id?: string;
  },
): SportCompetitionRecord {
  assertEntrantPair(competition, input.entrantAId, input.entrantBId);
  const now = input.now ?? Date.now();
  const fixture: CompetitionFixture = {
    id: input.id ?? `fixture-${now}-${Math.random().toString(36).slice(2, 8)}`,
    round: 0,
    roundLabel: 'SCHEDULED',
    slot: competition.fixtures.filter((candidate) => candidate.round === 0).length + 1,
    entrantAId: input.entrantAId,
    entrantBId: input.entrantBId,
    scheduledAt: input.scheduledAt,
    court: cleanName(input.court ?? '', 50) || undefined,
  };
  return freezeCompetition({
    ...competition,
    fixtures: [...competition.fixtures, fixture],
    updatedAt: now,
  });
}

export function withCompetitionFixtureSchedule(
  competition: SportCompetitionRecord,
  fixtureId: string,
  input: { readonly scheduledAt?: number; readonly court?: string; readonly now?: number },
): SportCompetitionRecord {
  if (!competition.fixtures.some((fixture) => fixture.id === fixtureId)) {
    throw new Error('The selected match is no longer in this competition.');
  }
  const now = input.now ?? Date.now();
  return freezeCompetition({
    ...competition,
    fixtures: competition.fixtures.map((fixture) => fixture.id === fixtureId
      ? {
          ...fixture,
          scheduledAt: input.scheduledAt,
          court: cleanName(input.court ?? '', 50) || undefined,
        }
      : fixture),
    updatedAt: now,
  });
}

export function projectCompetitionFixtures(
  competition: SportCompetitionRecord,
  results: readonly CompetitionFixtureResult[] = [],
): readonly ProjectedCompetitionFixture[] {
  const resultByFixture = new Map(results.map((result) => [result.fixtureId, result]));
  const projectionById = new Map<string, ProjectedCompetitionFixture>();
  const projected = [...competition.fixtures]
    .sort((left, right) => left.round - right.round || left.slot - right.slot)
    .map((fixture): ProjectedCompetitionFixture => {
      const sideAId = fixture.entrantAId
        ?? (fixture.sourceA ? projectionById.get(fixture.sourceA.fixtureId)?.winnerEntrantId : undefined);
      const sideBId = fixture.entrantBId
        ?? (fixture.sourceB ? projectionById.get(fixture.sourceB.fixtureId)?.winnerEntrantId : undefined);
      const automaticWinner = sideAId && !sideBId && !fixture.sourceB
        ? sideAId
        : sideBId && !sideAId && !fixture.sourceA ? sideBId : undefined;
      const winnerEntrantId = resultByFixture.get(fixture.id)?.winnerEntrantId ?? automaticWinner;
      const item = Object.freeze({
        ...fixture,
        sideAId,
        sideBId,
        winnerEntrantId,
        isBye: Boolean(automaticWinner),
      });
      projectionById.set(item.id, item);
      return item;
    });
  return Object.freeze(projected);
}

export function calculateCompetitionStandings(
  competition: SportCompetitionRecord,
  results: readonly CompetitionFixtureResult[],
): readonly CompetitionStanding[] {
  const projected = projectCompetitionFixtures(competition, results);
  const table = new Map(competition.entrants.map((entrant) => [entrant.id, {
    entrantId: entrant.id,
    played: 0,
    won: 0,
    lost: 0,
    points: 0,
  }]));
  const resultByFixture = new Map(results.map((result) => [result.fixtureId, result]));
  projected.forEach((fixture) => {
    const result = resultByFixture.get(fixture.id);
    if (!result || !fixture.sideAId || !fixture.sideBId) return;
    const winner = table.get(result.winnerEntrantId);
    const loserId = result.winnerEntrantId === fixture.sideAId ? fixture.sideBId : fixture.sideAId;
    const loser = table.get(loserId);
    if (!winner || !loser) return;
    winner.played += 1;
    winner.won += 1;
    winner.points += competition.pointsRule.win;
    loser.played += 1;
    loser.lost += 1;
    loser.points += competition.pointsRule.loss;
  });
  return Object.freeze([...table.values()]
    .sort((left, right) => right.points - left.points || right.won - left.won
      || entrantName(competition, left.entrantId).localeCompare(entrantName(competition, right.entrantId)))
    .map((standing) => Object.freeze({ ...standing })));
}

async function readCompetitions(): Promise<readonly SportCompetitionRecord[]> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (!value) return Object.freeze([]);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return Object.freeze([]);
    return Object.freeze(parsed.flatMap((candidate) => {
      try {
        return [validateCompetition(candidate)];
      } catch {
        return [];
      }
    }));
  } catch {
    return Object.freeze([]);
  }
}

function validateCompetition(candidate: unknown): SportCompetitionRecord {
  if (!candidate || typeof candidate !== 'object') throw new Error('Invalid competition.');
  const value = candidate as Partial<SportCompetitionRecord>;
  if (
    value.version !== 1
    || typeof value.id !== 'string'
    || !isScoringSportId(value.sportId)
    || typeof value.name !== 'string'
    || (value.kind !== 'TOURNAMENT' && value.kind !== 'LEAGUE')
    || typeof value.createdAt !== 'number'
    || typeof value.updatedAt !== 'number'
  ) {
    throw new Error('Invalid competition.');
  }
  const matchFormat = value.kind === 'LEAGUE'
    ? 'SINGLES'
    : isMatchFormat(value.matchFormat) ? value.matchFormat : 'SINGLES';
  const pointsRule = validPointsRule(value.pointsRule) ? value.pointsRule : { win: 2, loss: 0 };
  const officials = Array.isArray(value.officials)
    ? value.officials.flatMap(validOfficial)
    : [];
  const entrants = Array.isArray(value.entrants)
    ? value.entrants.flatMap((entrant, index) => validEntrant(entrant, index, value.kind!))
    : [];
  const entrantIds = new Set(entrants.map((entrant) => entrant.id));
  const fixtures = Array.isArray(value.fixtures)
    ? value.fixtures.flatMap((fixture) => validFixture(fixture, entrantIds))
    : [];
  return freezeCompetition({
    version: 1,
    id: value.id,
    sportId: value.sportId,
    name: cleanName(value.name, 60),
    kind: value.kind,
    matchFormat,
    creatorAccountId: typeof value.creatorAccountId === 'string' ? value.creatorAccountId : undefined,
    creatorName: typeof value.creatorName === 'string'
      ? cleanName(value.creatorName, 60) || 'Local creator'
      : 'Local creator',
    officials,
    pointsRule,
    entrants,
    fixtures,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  });
}

function validOfficial(candidate: unknown): CompetitionOfficial[] {
  if (!candidate || typeof candidate !== 'object') return [];
  const value = candidate as Partial<CompetitionOfficial>;
  const displayName = typeof value.displayName === 'string' ? cleanName(value.displayName, 60) : '';
  if (typeof value.accountId !== 'string' || !value.accountId.trim() || !displayName) return [];
  return [{
    accountId: value.accountId.trim(),
    displayName,
    avatarUrl: cleanUrl(value.avatarUrl),
  }];
}

function validEntrant(
  candidate: unknown,
  index: number,
  competitionKind: CompetitionKind,
): CompetitionEntrant[] {
  if (!candidate || typeof candidate !== 'object') return [];
  const value = candidate as {
    readonly entrantType?: unknown;
    readonly id?: unknown;
    readonly name?: unknown;
    readonly seed?: unknown;
    readonly player?: unknown;
    readonly players?: unknown;
  };
  const name = typeof value.name === 'string' ? cleanName(value.name, 40) : '';
  if (typeof value.id !== 'string' || !name) return [];
  const seed = Number.isInteger(value.seed) ? value.seed as number : index + 1;
  if (competitionKind === 'LEAGUE') {
    const player = validPlayer(value.player, `${value.id}-player`, name);
    return [{ entrantType: 'PLAYER', id: value.id, name: player.name, seed, player }];
  }
  const players = Array.isArray(value.players)
    ? value.players.flatMap((player, playerIndex) => {
        const valid = validPlayer(player, `${value.id}-player-${playerIndex + 1}`);
        return valid.name ? [valid] : [];
      })
    : [];
  return [{
    entrantType: 'TEAM',
    id: value.id,
    name,
    seed,
    players: players.length ? players : [{ id: `${value.id}-player-1`, name }],
  }];
}

function validPlayer(candidate: unknown, fallbackId: string, fallbackName = ''): CompetitionPlayer {
  if (!candidate || typeof candidate !== 'object') return { id: fallbackId, name: fallbackName };
  const value = candidate as Partial<CompetitionPlayer>;
  return {
    id: typeof value.id === 'string' ? value.id : fallbackId,
    name: typeof value.name === 'string' ? cleanName(value.name, 40) : fallbackName,
  };
}

function validFixture(
  candidate: unknown,
  entrantIds: ReadonlySet<string>,
): CompetitionFixture[] {
  if (!candidate || typeof candidate !== 'object') return [];
  const value = candidate as Partial<CompetitionFixture>;
  if (
    typeof value.id !== 'string'
    || !Number.isInteger(value.round)
    || typeof value.roundLabel !== 'string'
    || !Number.isInteger(value.slot)
  ) return [];
  const entrantAId = value.entrantAId && entrantIds.has(value.entrantAId) ? value.entrantAId : undefined;
  const entrantBId = value.entrantBId && entrantIds.has(value.entrantBId) ? value.entrantBId : undefined;
  return [{
    id: value.id,
    round: value.round!,
    roundLabel: cleanName(value.roundLabel, 30) || 'MATCH',
    slot: value.slot!,
    entrantAId,
    entrantBId,
    sourceA: validSource(value.sourceA),
    sourceB: validSource(value.sourceB),
    scheduledAt: typeof value.scheduledAt === 'number' ? value.scheduledAt : undefined,
    court: typeof value.court === 'string' ? cleanName(value.court, 50) || undefined : undefined,
  }];
}

function validSource(candidate: unknown): CompetitionFixtureSource | undefined {
  if (!candidate || typeof candidate !== 'object') return undefined;
  const value = candidate as Partial<CompetitionFixtureSource>;
  return typeof value.fixtureId === 'string' ? { fixtureId: value.fixtureId } : undefined;
}

function validPointsRule(value: unknown): value is CompetitionPointsRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Partial<CompetitionPointsRule>;
  return isPointsValue(rule.win) && isPointsValue(rule.loss);
}

function assertEntrantPair(
  competition: SportCompetitionRecord,
  entrantAId: string,
  entrantBId: string,
): void {
  const participantLabel = competition.kind === 'TOURNAMENT' ? 'teams' : 'players';
  if (entrantAId === entrantBId) throw new Error(`Choose two different ${participantLabel}.`);
  const entrantIds = new Set(competition.entrants.map((entrant) => entrant.id));
  if (!entrantIds.has(entrantAId) || !entrantIds.has(entrantBId)) {
    throw new Error(`Both ${participantLabel} must be entered in this competition.`);
  }
}

function entrantName(competition: SportCompetitionRecord, entrantId: string): string {
  return competition.entrants.find((entrant) => entrant.id === entrantId)?.name ?? entrantId;
}

function assertPointsValue(value: number, label: string): void {
  if (!isPointsValue(value)) throw new Error(`${label} must be a whole number from 0 to 99.`);
}

function isPointsValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99;
}

function isMatchFormat(value: unknown): value is MatchFormat {
  return value === 'SINGLES' || value === 'DOUBLES';
}

function freezeCompetition(competition: SportCompetitionRecord): SportCompetitionRecord {
  return Object.freeze({
    ...competition,
    pointsRule: Object.freeze({ ...competition.pointsRule }),
    officials: Object.freeze(competition.officials.map((official) => Object.freeze({ ...official }))),
    entrants: Object.freeze(competition.entrants.map((entrant) => entrant.entrantType === 'TEAM'
      ? Object.freeze({
          ...entrant,
          players: Object.freeze(entrant.players.map((player) => Object.freeze({ ...player }))),
        })
      : Object.freeze({ ...entrant, player: Object.freeze({ ...entrant.player }) }))),
    fixtures: Object.freeze(competition.fixtures.map((fixture) => Object.freeze({
      ...fixture,
      sourceA: fixture.sourceA ? Object.freeze({ ...fixture.sourceA }) : undefined,
      sourceB: fixture.sourceB ? Object.freeze({ ...fixture.sourceB }) : undefined,
    }))),
  });
}

function cleanName(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanUrl(value: unknown): string | undefined {
  return typeof value === 'string' && /^https?:\/\//.test(value) ? value : undefined;
}
