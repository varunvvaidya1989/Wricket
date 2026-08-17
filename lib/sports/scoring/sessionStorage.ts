import AsyncStorage from '@react-native-async-storage/async-storage';

import { SPORT_CONFIGS } from './configs';
import { canScoreCompetition, type SportCompetitionRecord } from './competitionStorage';
import { createPointEvent, replay } from './engine';
import { isScoringSportId, type ScoringSportId } from './presentation';
import type { MatchFormat, MatchOptions, PointEvent, Side } from './types';

const STORAGE_KEY = 'sportstage:racquet-scoring-sessions:v1';
const MAX_SESSIONS = 24;

export interface ScoringSessionRecord {
  readonly version: 1;
  readonly id: string;
  readonly sportId: ScoringSportId;
  readonly matchFormat: MatchFormat;
  readonly sideNames: readonly [string, string];
  readonly sidePlayers: readonly [readonly string[], readonly string[]];
  readonly initialServer: Side;
  readonly createdByAccountId?: string;
  readonly competitionId?: string;
  readonly fixtureId?: string;
  readonly sideEntrantIds?: readonly [string, string];
  readonly options: MatchOptions;
  readonly events: readonly PointEvent[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateScoringSessionInput {
  readonly sportId: ScoringSportId;
  readonly matchFormat?: MatchFormat;
  readonly sideNames: readonly [string, string];
  readonly sidePlayers?: readonly [readonly string[], readonly string[]];
  readonly initialServer: Side;
  readonly createdByAccountId: string;
  readonly competitionId?: string;
  readonly fixtureId?: string;
  readonly sideEntrantIds?: readonly [string, string];
  readonly options?: MatchOptions;
  readonly now?: number;
  readonly id?: string;
}

export function createScoringSession(input: CreateScoringSessionInput): ScoringSessionRecord {
  const now = input.now ?? Date.now();
  const createdByAccountId = input.createdByAccountId.trim();
  if (!createdByAccountId) throw new Error('A SportStage account is required to create a match.');
  const matchFormat = input.matchFormat ?? 'SINGLES';
  const sideNames = [cleanName(input.sideNames[0], 'Side A'), cleanName(input.sideNames[1], 'Side B')] as const;
  const sidePlayers = normalizeSidePlayers(matchFormat, input.sidePlayers, sideNames);
  return freezeSession({
    version: 1,
    id: input.id ?? `sport-match-${now}-${Math.random().toString(36).slice(2, 9)}`,
    sportId: input.sportId,
    matchFormat,
    sideNames,
    sidePlayers,
    initialServer: input.initialServer,
    createdByAccountId,
    competitionId: input.competitionId,
    fixtureId: input.fixtureId,
    sideEntrantIds: input.sideEntrantIds,
    options: Object.freeze({ ...input.options }),
    events: Object.freeze([]),
    createdAt: now,
    updatedAt: now,
  });
}

export async function listScoringSessions(): Promise<readonly ScoringSessionRecord[]> {
  const sessions = await readSessions();
  return Object.freeze([...sessions].sort((left, right) => right.updatedAt - left.updatedAt));
}

export async function getScoringSession(id: string): Promise<ScoringSessionRecord | undefined> {
  return (await readSessions()).find((session) => session.id === id);
}

export async function saveScoringSession(
  session: ScoringSessionRecord,
): Promise<ScoringSessionRecord> {
  const valid = validateSession(session);
  const sessions = await readSessions();
  const next = [valid, ...sessions.filter((candidate) => candidate.id !== valid.id)]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_SESSIONS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return valid;
}

export async function removeScoringSession(id: string): Promise<void> {
  const sessions = await readSessions();
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sessions.filter((session) => session.id !== id)),
  );
}

export function withSessionEvents(
  session: ScoringSessionRecord,
  events: readonly PointEvent[],
  now = Date.now(),
): ScoringSessionRecord {
  return freezeSession({ ...session, events, updatedAt: now });
}

export function canScoreSession(
  session: ScoringSessionRecord,
  accountId: string | undefined,
  competition?: SportCompetitionRecord,
): boolean {
  if (session.competitionId) {
    return Boolean(competition
      && competition.id === session.competitionId
      && canScoreCompetition(competition, accountId));
  }
  return Boolean(accountId && session.createdByAccountId === accountId);
}

async function readSessions(): Promise<readonly ScoringSessionRecord[]> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (!value) return Object.freeze([]);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return Object.freeze([]);
    return Object.freeze(parsed.flatMap((candidate) => {
      try {
        return [validateSession(candidate)];
      } catch {
        return [];
      }
    }));
  } catch {
    return Object.freeze([]);
  }
}

function validateSession(candidate: unknown): ScoringSessionRecord {
  if (!candidate || typeof candidate !== 'object') throw new Error('Invalid scoring session.');
  const value = candidate as Partial<ScoringSessionRecord>;
  if (
    value.version !== 1
    || typeof value.id !== 'string'
    || !isScoringSportId(value.sportId)
    || !Array.isArray(value.sideNames)
    || value.sideNames.length !== 2
    || value.sideNames.some((name) => typeof name !== 'string')
    || (value.initialServer !== 0 && value.initialServer !== 1)
    || !Array.isArray(value.events)
    || typeof value.createdAt !== 'number'
    || typeof value.updatedAt !== 'number'
  ) {
    throw new Error('Invalid scoring session.');
  }
  const events = value.events.map((event) => createPointEvent(event));
  const matchFormat: MatchFormat = value.matchFormat === 'DOUBLES' ? 'DOUBLES' : 'SINGLES';
  const sideNames = [value.sideNames[0], value.sideNames[1]] as const;
  const sidePlayers = normalizeSidePlayers(matchFormat, value.sidePlayers, sideNames);
  const options = value.options && typeof value.options === 'object'
    ? Object.freeze({ ...value.options })
    : Object.freeze({});
  replay(SPORT_CONFIGS[value.sportId], events, {
    initialServer: value.initialServer,
    options,
  });
  return freezeSession({
    version: 1,
    id: value.id,
    sportId: value.sportId,
    matchFormat,
    sideNames,
    sidePlayers,
    initialServer: value.initialServer,
    createdByAccountId: typeof value.createdByAccountId === 'string' ? value.createdByAccountId : undefined,
    competitionId: typeof value.competitionId === 'string' ? value.competitionId : undefined,
    fixtureId: typeof value.fixtureId === 'string' ? value.fixtureId : undefined,
    sideEntrantIds: Array.isArray(value.sideEntrantIds)
      && value.sideEntrantIds.length === 2
      && value.sideEntrantIds.every((id) => typeof id === 'string')
      ? [value.sideEntrantIds[0], value.sideEntrantIds[1]]
      : undefined,
    options,
    events,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  });
}

function freezeSession(session: ScoringSessionRecord): ScoringSessionRecord {
  return Object.freeze({
    ...session,
    sideNames: Object.freeze([...session.sideNames]) as unknown as readonly [string, string],
    sidePlayers: Object.freeze(session.sidePlayers.map((players) => Object.freeze([...players]))) as unknown as readonly [readonly string[], readonly string[]],
    sideEntrantIds: session.sideEntrantIds
      ? Object.freeze([...session.sideEntrantIds]) as unknown as readonly [string, string]
      : undefined,
    options: Object.freeze({ ...session.options }),
    events: Object.freeze([...session.events]),
  });
}

function cleanName(value: string, fallback: string): string {
  return value.trim().slice(0, 40) || fallback;
}

function normalizeSidePlayers(
  matchFormat: MatchFormat,
  candidate: unknown,
  sideNames: readonly [string, string],
): readonly [readonly string[], readonly string[]] {
  const expectedPlayers = matchFormat === 'DOUBLES' ? 2 : 1;
  if (Array.isArray(candidate) && candidate.length === 2) {
    const sides = candidate.map((players) => Array.isArray(players)
      ? players.map((player) => typeof player === 'string' ? cleanName(player, '') : '').filter(Boolean)
      : []);
    if (sides.every((players) => players.length === expectedPlayers)) {
      return Object.freeze(sides.map((players) => Object.freeze(players))) as unknown as readonly [readonly string[], readonly string[]];
    }
  }
  if (matchFormat === 'DOUBLES') {
    throw new Error('Doubles matches require two named players on each side.');
  }
  return Object.freeze([
    Object.freeze([cleanName(sideNames[0], 'Side A')]),
    Object.freeze([cleanName(sideNames[1], 'Side B')]),
  ]);
}
