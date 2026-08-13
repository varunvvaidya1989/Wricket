import { getDb, newId } from './client';
import {
  clearScoringSessionInDb,
  getScoringSessionFromDb,
  saveScoringSessionInDb,
} from './scoringSessionRepo';
import {
  Ball,
  BatterRetirement,
  DEFAULT_RULES,
  ExtraKind,
  FormatRules,
  Innings,
  Match,
  MatchFormat,
  MatchResult,
  MatchStatus,
  PlayerRole,
  Team,
  Tournament,
  User,
  TossChoice,
  DismissalKind,
  RetirementKind,
  ScoreAdjustment,
  ScoreAdjustmentKind,
  ScoringSession,
} from '../domain/types';

export {
  clearScoringSessionInDb,
  getScoringSessionFromDb,
  rowToScoringSession,
  saveScoringSessionInDb,
  type ScoringSessionDatabase,
} from './scoringSessionRepo';

// ---------- Users ----------

export async function createUser(input: {
  name: string;
  role: PlayerRole;
  battingHand?: 'RIGHT' | 'LEFT';
  bowlingStyle?: string;
}): Promise<User> {
  const db = await getDb();
  const user: User = {
    id: newId(),
    name: input.name,
    role: input.role,
    battingHand: input.battingHand,
    bowlingStyle: input.bowlingStyle,
    createdAt: Date.now(),
    syncStatus: 'PENDING',
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO users
         (id, name, role, batting_hand, bowling_style, created_at, sync_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      user.name,
      user.role,
      user.battingHand ?? null,
      user.bowlingStyle ?? null,
      user.createdAt,
      user.syncStatus,
      user.createdAt,
    );
    await enqueueSyncInDb(db, 'PLAYER', user.id);
  });
  return user;
}

export async function listUsers(): Promise<User[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM users ORDER BY name');
  return rows.map(rowToUser);
}

export async function getUser(id: string): Promise<User | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM users WHERE id = ?', id);
  return row ? rowToUser(row) : null;
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    battingHand: row.batting_hand ?? undefined,
    bowlingStyle: row.bowling_style ?? undefined,
    createdAt: row.created_at,
    cloudId: row.cloud_id ?? undefined,
    syncStatus: row.sync_status ?? 'LOCAL',
    syncError: row.sync_error ?? undefined,
  };
}

// ---------- Tournaments ----------

export async function createTournament(input: {
  name: string;
  format: MatchFormat;
  startDate: number;
  endDate?: number;
  organizerProfileId?: string;
  organizerPhone?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  plannedTeamCount: number;
  playersPerTeam: number;
  oversPerMatch: number;
  description?: string;
  socialMediaUrl?: string;
  bannerLocalUri?: string;
  logoLocalUri?: string;
}): Promise<Tournament> {
  const db = await getDb();
  const t: Tournament = {
    id: newId(),
    name: input.name,
    format: input.format,
    startDate: input.startDate,
    endDate: input.endDate,
    pointsWin: 2,
    pointsTie: 1,
    pointsLoss: 0,
    pointsNoResult: 1,
    status: 'ACTIVE',
    createdAt: Date.now(),
    organizerProfileId: input.organizerProfileId,
    organizerPhone: input.organizerPhone,
    location: input.location,
    latitude: input.latitude,
    longitude: input.longitude,
    googlePlaceId: input.googlePlaceId,
    googleMapsUrl: input.googleMapsUrl,
    plannedTeamCount: input.plannedTeamCount,
    playersPerTeam: input.playersPerTeam,
    oversPerMatch: input.oversPerMatch,
    description: input.description,
    socialMediaUrl: input.socialMediaUrl,
    bannerLocalUri: input.bannerLocalUri,
    logoLocalUri: input.logoLocalUri,
    syncStatus: 'PENDING',
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
    `INSERT INTO tournaments (id, name, format, start_date, end_date,
       points_win, points_tie, points_loss, points_no_result, status, created_at,
       sync_status, updated_at, organizer_profile_id, organizer_phone, location, latitude, longitude,
       google_place_id, google_maps_url,
       planned_team_count, players_per_team, description, social_media_url,
       banner_local_uri, logo_local_uri, banner_url, logo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    t.id,
    t.name,
    t.format,
    t.startDate,
    t.endDate ?? null,
    t.pointsWin,
    t.pointsTie,
    t.pointsLoss,
    t.pointsNoResult,
    t.status,
    t.createdAt,
    t.syncStatus,
    t.createdAt,
    t.organizerProfileId ?? null,
    t.organizerPhone ?? null,
    t.location ?? null,
    t.latitude ?? null,
    t.longitude ?? null,
    t.googlePlaceId ?? null,
    t.googleMapsUrl ?? null,
    t.plannedTeamCount,
    t.playersPerTeam,
    t.description ?? null,
    t.socialMediaUrl ?? null,
    t.bannerLocalUri ?? null,
    t.logoLocalUri ?? null,
    null,
    null,
    );
    await db.runAsync('UPDATE tournaments SET overs_per_match = ? WHERE id = ?', t.oversPerMatch, t.id);
    await enqueueSyncInDb(db, 'TOURNAMENT', t.id);
  });
  return t;
}

export async function listTournaments(): Promise<Tournament[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM tournaments ORDER BY created_at DESC',
  );
  return rows.map(rowToTournament);
}

export async function getTournament(id: string): Promise<Tournament | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM tournaments WHERE id = ?',
    id,
  );
  return row ? rowToTournament(row) : null;
}

export async function updateTournamentMediaLocally(
  tournamentId: string,
  kind: 'logo' | 'banner',
  url: string,
): Promise<void> {
  const db = await getDb();
  const urlColumn = kind === 'logo' ? 'logo_url' : 'banner_url';
  const localColumn = kind === 'logo' ? 'logo_local_uri' : 'banner_local_uri';
  await db.runAsync(
    `UPDATE tournaments SET ${urlColumn} = ?, ${localColumn} = NULL, sync_status = ? WHERE id = ?`,
    url,
    'SYNCED',
    tournamentId,
  );
}

export async function updateTournamentDetailsLocally(tournamentId: string, input: {
  name: string; startDate: number; location?: string; plannedTeamCount: number;
  playersPerTeam: number; oversPerMatch: number; organizerPhone?: string; description?: string;
  socialMediaUrl?: string; rewards?: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE tournaments SET name = ?, start_date = ?, location = ?, planned_team_count = ?,
      players_per_team = ?, overs_per_match = ?, organizer_phone = ?, description = ?, social_media_url = ?, rewards = ?, sync_status = ? WHERE id = ?`,
    input.name, input.startDate, input.location ?? null, input.plannedTeamCount, input.playersPerTeam,
    input.oversPerMatch, input.organizerPhone ?? null, input.description ?? null, input.socialMediaUrl ?? null,
    input.rewards ?? null, 'SYNCED', tournamentId,
  );
}

export async function deleteTournamentLocally(tournamentId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const matches = await db.getAllAsync<{ id: string }>('SELECT id FROM matches WHERE tournament_id = ?', tournamentId);
    const teams = await db.getAllAsync<{ id: string }>('SELECT id FROM teams WHERE tournament_id = ?', tournamentId);
    for (const match of matches) {
      await db.runAsync('DELETE FROM sync_outbox WHERE entity_id = ?', match.id);
      await db.runAsync('DELETE FROM matches WHERE id = ?', match.id);
    }
    for (const team of teams) {
      await db.runAsync('DELETE FROM sync_outbox WHERE entity_id = ?', team.id);
      await db.runAsync('DELETE FROM teams WHERE id = ?', team.id);
    }
    await db.runAsync('DELETE FROM sync_outbox WHERE entity_id = ?', tournamentId);
    await db.runAsync('DELETE FROM tournaments WHERE id = ?', tournamentId);
  });
}

function rowToTournament(row: any): Tournament {
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    pointsWin: row.points_win,
    pointsTie: row.points_tie,
    pointsLoss: row.points_loss,
    pointsNoResult: row.points_no_result,
    status: row.status,
    createdAt: row.created_at,
    organizerProfileId: row.organizer_profile_id ?? undefined,
    organizerPhone: row.organizer_phone ?? undefined,
    location: row.location ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    googlePlaceId: row.google_place_id ?? undefined,
    googleMapsUrl: row.google_maps_url ?? undefined,
    plannedTeamCount: row.planned_team_count ?? 2,
    playersPerTeam: row.players_per_team ?? 11,
    oversPerMatch: row.overs_per_match ?? DEFAULT_RULES[row.format as MatchFormat]?.oversPerInnings ?? 20,
    description: row.description ?? undefined,
    rewards: row.rewards ?? undefined,
    socialMediaUrl: row.social_media_url ?? undefined,
    bannerLocalUri: row.banner_local_uri ?? undefined,
    logoLocalUri: row.logo_local_uri ?? undefined,
    bannerUrl: row.banner_url ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    cloudId: row.cloud_id ?? undefined,
    syncStatus: row.sync_status ?? 'LOCAL',
    syncError: row.sync_error ?? undefined,
  };
}

// ---------- Teams ----------

export async function createTeam(input: {
  tournamentId: string | null;
  name: string;
  shortName: string;
  colorHex: string;
}): Promise<Team> {
  const db = await getDb();
  const team: Team = {
    id: newId(),
    tournamentId: input.tournamentId,
    name: input.name,
    shortName: input.shortName,
    colorHex: input.colorHex,
    createdAt: Date.now(),
    syncStatus: 'PENDING',
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
    `INSERT INTO teams (id, tournament_id, name, short_name, color_hex, created_at,
       sync_status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    team.id,
    team.tournamentId,
    team.name,
    team.shortName,
    team.colorHex,
    team.createdAt,
    team.syncStatus,
    team.createdAt,
    );
    await enqueueSyncInDb(db, 'TEAM', team.id);
  });
  return team;
}

export async function listTeams(tournamentId?: string | null): Promise<Team[]> {
  const db = await getDb();
  const rows = tournamentId
    ? await db.getAllAsync<any>(
        'SELECT * FROM teams WHERE tournament_id = ? ORDER BY name',
        tournamentId,
      )
    : await db.getAllAsync<any>(
        'SELECT * FROM teams WHERE tournament_id IS NULL ORDER BY name',
      );
  return rows.map(rowToTeam);
}

export async function deleteTeam(teamId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM teams WHERE id = ?', teamId);
}

export async function getTeam(id: string): Promise<Team | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM teams WHERE id = ?', id);
  return row ? rowToTeam(row) : null;
}

export async function updateTeamLogoByCloudId(cloudTeamId: string, logoUrl: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE teams SET logo_url = ?, sync_status = ? WHERE cloud_id = ?',
    logoUrl,
    'SYNCED',
    cloudTeamId,
  );
}

function rowToTeam(row: any): Team {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    name: row.name,
    shortName: row.short_name,
    colorHex: row.color_hex,
    logoUrl: row.logo_url ?? undefined,
    createdAt: row.created_at,
    cloudId: row.cloud_id ?? undefined,
    syncStatus: row.sync_status ?? 'LOCAL',
    syncError: row.sync_error ?? undefined,
  };
}

async function enqueueSyncInDb(
  db: { runAsync(sql: string, ...params: unknown[]): Promise<unknown> },
  entityType: 'TOURNAMENT' | 'TEAM' | 'PLAYER' | 'TEAM_PLAYER',
  entityId: string,
): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    `INSERT OR IGNORE INTO sync_outbox
       (id, entity_type, entity_id, operation, attempts, created_at, next_attempt_at)
     VALUES (?, ?, ?, 'UPSERT', 0, ?, 0)`,
    newId(),
    entityType,
    entityId,
    now,
  );
}

export async function addPlayerToTeam(
  teamId: string,
  userId: string,
  jerseyNo?: number,
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO team_players
         (team_id, user_id, jersey_no, is_captain, is_keeper, sync_status, updated_at)
       VALUES (?, ?, ?, 0, 0, 'PENDING', ?)`,
      teamId,
      userId,
      jerseyNo ?? null,
      Date.now(),
    );
    await enqueueSyncInDb(db, 'TEAM_PLAYER', `${teamId}:${userId}`);
  });
}

export async function listTeamPlayers(teamId: string): Promise<User[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT u.* FROM users u
     JOIN team_players tp ON tp.user_id = u.id
     WHERE tp.team_id = ?
     ORDER BY u.name`,
    teamId,
  );
  return rows.map(rowToUser);
}

// ---------- Matches ----------

export async function createMatch(input: {
  id?: string;
  tournamentId: string | null;
  format: MatchFormat;
  rules?: Partial<FormatRules>;
  teamAId: string;
  teamBId: string;
  venue?: string;
  scheduledAt?: number;
}): Promise<Match> {
  const db = await getDb();
  if (input.id) {
    const existing = await db.getFirstAsync<any>('SELECT * FROM matches WHERE id = ?', input.id);
    if (existing) return rowToMatch(existing);
  }
  const rules: FormatRules = { ...DEFAULT_RULES[input.format], ...input.rules };
  const match: Match = {
    id: input.id ?? newId(),
    tournamentId: input.tournamentId,
    format: input.format,
    rules,
    teamAId: input.teamAId,
    teamBId: input.teamBId,
    venue: input.venue,
    scheduledAt: input.scheduledAt,
    status: 'SETUP',
    createdAt: Date.now(),
  };
  await db.runAsync(
    `INSERT INTO matches (id, tournament_id, format, rules_json,
       team_a_id, team_b_id, venue, scheduled_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    match.id,
    match.tournamentId,
    match.format,
    JSON.stringify(rules),
    match.teamAId,
    match.teamBId,
    match.venue ?? null,
    match.scheduledAt ?? null,
    match.status,
    match.createdAt,
  );
  return match;
}

export async function setMatchToss(
  matchId: string,
  tossWinnerTeamId: string,
  tossChoice: TossChoice,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE matches SET toss_winner_team_id = ?, toss_choice = ?, status = 'TOSS' WHERE id = ?`,
    tossWinnerTeamId,
    tossChoice,
    matchId,
  );
}

export async function setMatchStatus(
  matchId: string,
  status: MatchStatus,
): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE matches SET status = ? WHERE id = ?', status, matchId);
}

export async function setMatchResult(
  matchId: string,
  result: MatchResult,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE matches SET result_json = ?, status = 'COMPLETED' WHERE id = ?`,
    JSON.stringify(result),
    matchId,
  );
}

export async function getMatch(id: string): Promise<Match | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM matches WHERE id = ?', id);
  return row ? rowToMatch(row) : null;
}

export async function listMatches(tournamentId?: string): Promise<Match[]> {
  const db = await getDb();
  const rows = tournamentId
    ? await db.getAllAsync<any>(
        'SELECT * FROM matches WHERE tournament_id = ? ORDER BY created_at DESC',
        tournamentId,
      )
    : await db.getAllAsync<any>(
        'SELECT * FROM matches ORDER BY created_at DESC',
      );
  return rows.map(rowToMatch);
}

export async function listLiveMatches(): Promise<Match[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM matches WHERE status IN ('IN_PROGRESS','INNINGS_BREAK','FOLLOW_ON_DECISION')
     ORDER BY created_at DESC`,
  );
  return rows.map(rowToMatch);
}

function rowToMatch(row: any): Match {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    format: row.format,
    rules: JSON.parse(row.rules_json),
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    venue: row.venue ?? undefined,
    scheduledAt: row.scheduled_at ?? undefined,
    tossWinnerTeamId: row.toss_winner_team_id ?? undefined,
    tossChoice: row.toss_choice ?? undefined,
    status: row.status,
    result: row.result_json ? JSON.parse(row.result_json) : undefined,
    createdAt: row.created_at,
  };
}

// ---------- Match XI ----------

export async function setMatchXI(
  matchId: string,
  teamId: string,
  players: { userId: string; battingOrder: number; isCaptain?: boolean; isKeeper?: boolean }[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM match_xis WHERE match_id = ? AND team_id = ?',
      matchId,
      teamId,
    );
    for (const p of players) {
      await db.runAsync(
        `INSERT INTO match_xis (match_id, team_id, user_id, batting_order, is_captain, is_keeper)
         VALUES (?, ?, ?, ?, ?, ?)`,
        matchId,
        teamId,
        p.userId,
        p.battingOrder,
        p.isCaptain ? 1 : 0,
        p.isKeeper ? 1 : 0,
      );
    }
  });
}

export interface MatchXIPlayer {
  userId: string;
  cloudId?: string;
  name: string;
  battingOrder: number;
  isCaptain: boolean;
  isKeeper: boolean;
}

export async function getMatchXI(
  matchId: string,
  teamId: string,
): Promise<MatchXIPlayer[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT mx.user_id, mx.batting_order, mx.is_captain, mx.is_keeper, u.name, u.cloud_id
     FROM match_xis mx
     JOIN users u ON u.id = mx.user_id
     WHERE mx.match_id = ? AND mx.team_id = ?
     ORDER BY mx.batting_order`,
    matchId,
    teamId,
  );
  return rows.map(r => ({
    userId: r.user_id,
    cloudId: r.cloud_id ?? undefined,
    name: r.name,
    battingOrder: r.batting_order,
    isCaptain: !!r.is_captain,
    isKeeper: !!r.is_keeper,
  }));
}

// ---------- Innings ----------

export async function createInnings(input: {
  id?: string;
  matchId: string;
  sequence: 1 | 2 | 3 | 4;
  battingTeamId: string;
  bowlingTeamId: string;
  isFollowOn?: boolean;
  target?: number;
}): Promise<Innings> {
  const db = await getDb();
  const existing = await db.getFirstAsync<any>(
    'SELECT * FROM innings WHERE match_id = ? AND sequence = ?',
    input.matchId,
    input.sequence,
  );
  if (existing) return rowToInnings(existing);
  const inn: Innings = {
    id: input.id ?? newId(),
    matchId: input.matchId,
    sequence: input.sequence,
    battingTeamId: input.battingTeamId,
    bowlingTeamId: input.bowlingTeamId,
    totalRuns: 0,
    totalWickets: 0,
    totalBalls: 0,
    isClosed: false,
    isFollowOn: !!input.isFollowOn,
    target: input.target,
  };
  await db.runAsync(
    `INSERT INTO innings (id, match_id, sequence, batting_team_id, bowling_team_id,
       total_runs, total_wickets, total_balls, is_closed, is_follow_on, target)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
    inn.id,
    inn.matchId,
    inn.sequence,
    inn.battingTeamId,
    inn.bowlingTeamId,
    inn.isFollowOn ? 1 : 0,
    inn.target ?? null,
  );
  return inn;
}

export async function getInnings(id: string): Promise<Innings | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM innings WHERE id = ?', id);
  return row ? rowToInnings(row) : null;
}

export async function listInningsForMatch(matchId: string): Promise<Innings[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM innings WHERE match_id = ? ORDER BY sequence',
    matchId,
  );
  return rows.map(rowToInnings);
}

export async function closeInnings(inningsId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE innings SET is_closed = 1 WHERE id = ?', inningsId);
}

export async function updateInningsTotals(
  inningsId: string,
  totals: { runs: number; wickets: number; balls: number },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE innings SET total_runs = ?, total_wickets = ?, total_balls = ? WHERE id = ?`,
    totals.runs,
    totals.wickets,
    totals.balls,
    inningsId,
  );
}

function rowToInnings(row: any): Innings {
  return {
    id: row.id,
    matchId: row.match_id,
    sequence: row.sequence,
    battingTeamId: row.batting_team_id,
    bowlingTeamId: row.bowling_team_id,
    totalRuns: row.total_runs,
    totalWickets: row.total_wickets,
    totalBalls: row.total_balls,
    isClosed: !!row.is_closed,
    isFollowOn: !!row.is_follow_on,
    target: row.target ?? undefined,
  };
}

// ---------- Balls ----------

export async function insertBall(input: {
  inningsId: string;
  overNo: number;
  ballInOver: number;
  legalBallInOver: number;
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  runsBat: number;
  runsExtra: number;
  extraKind: ExtraKind;
  rotateStrike?: boolean;
  isLegal: boolean;
  isWicket: boolean;
  dismissalKind?: DismissalKind;
  outPlayerId?: string;
  fielderId?: string;
  assistantFielderId?: string;
}): Promise<Ball> {
  const db = await getDb();
  const ball: Ball = {
    id: newId(),
    inningsId: input.inningsId,
    overNo: input.overNo,
    ballInOver: input.ballInOver,
    legalBallInOver: input.legalBallInOver,
    strikerId: input.strikerId,
    nonStrikerId: input.nonStrikerId,
    bowlerId: input.bowlerId,
    runsBat: input.runsBat,
    runsExtra: input.runsExtra,
    extraKind: input.extraKind,
    rotateStrike: input.rotateStrike,
    isLegal: input.isLegal,
    isWicket: input.isWicket,
    dismissal: input.isWicket
      ? {
          kind: input.dismissalKind!,
          outPlayerId: input.outPlayerId!,
          fielderId: input.fielderId,
          assistantFielderId: input.assistantFielderId,
        }
      : undefined,
    createdAt: Date.now(),
  };
  await db.runAsync(
    `INSERT INTO balls (id, innings_id, over_no, ball_in_over, legal_ball_in_over,
       striker_id, non_striker_id, bowler_id,
       runs_bat, runs_extra, extra_kind, rotate_strike, is_legal, is_wicket,
       dismissal_kind, out_player_id, fielder_id, assistant_fielder_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ball.id,
    ball.inningsId,
    ball.overNo,
    ball.ballInOver,
    ball.legalBallInOver,
    ball.strikerId,
    ball.nonStrikerId,
    ball.bowlerId,
    ball.runsBat,
    ball.runsExtra,
    ball.extraKind,
    ball.rotateStrike === undefined ? null : Number(ball.rotateStrike),
    ball.isLegal ? 1 : 0,
    ball.isWicket ? 1 : 0,
    input.dismissalKind ?? null,
    input.outPlayerId ?? null,
    input.fielderId ?? null,
    input.assistantFielderId ?? null,
    ball.createdAt,
  );
  return ball;
}

export async function deleteLastBall(inningsId: string): Promise<Ball | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM balls WHERE innings_id = ? ORDER BY created_at DESC LIMIT 1`,
    inningsId,
  );
  if (!row) return null;
  await db.runAsync('DELETE FROM balls WHERE id = ?', row.id);
  return rowToBall(row);
}

export async function listBalls(inningsId: string): Promise<Ball[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM balls WHERE innings_id = ? ORDER BY created_at ASC',
    inningsId,
  );
  return rows.map(rowToBall);
}

export async function listBallsForOver(
  inningsId: string,
  overNo: number,
): Promise<Ball[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM balls WHERE innings_id = ? AND over_no = ?
     ORDER BY created_at ASC`,
    inningsId,
    overNo,
  );
  return rows.map(rowToBall);
}

function rowToBall(row: any): Ball {
  return {
    id: row.id,
    inningsId: row.innings_id,
    overNo: row.over_no,
    ballInOver: row.ball_in_over,
    legalBallInOver: row.legal_ball_in_over,
    strikerId: row.striker_id,
    nonStrikerId: row.non_striker_id,
    bowlerId: row.bowler_id,
    runsBat: row.runs_bat,
    runsExtra: row.runs_extra,
    extraKind: row.extra_kind,
    rotateStrike: row.rotate_strike == null ? undefined : !!row.rotate_strike,
    isLegal: !!row.is_legal,
    isWicket: !!row.is_wicket,
    dismissal: row.is_wicket
      ? {
          kind: row.dismissal_kind,
          outPlayerId: row.out_player_id,
          fielderId: row.fielder_id ?? undefined,
          assistantFielderId: row.assistant_fielder_id ?? undefined,
        }
      : undefined,
    createdAt: row.created_at,
  };
}

// ---------- Score adjustments ----------

export async function insertScoreAdjustment(input: {
  inningsId: string;
  kind: ScoreAdjustmentKind;
  runs: number;
  note?: string;
}): Promise<ScoreAdjustment> {
  const db = await getDb();
  const adjustment: ScoreAdjustment = {
    id: newId(),
    inningsId: input.inningsId,
    kind: input.kind,
    runs: input.runs,
    note: input.note,
    createdAt: Date.now(),
  };
  await db.runAsync(
    `INSERT INTO score_adjustments (id, innings_id, kind, runs, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    adjustment.id,
    adjustment.inningsId,
    adjustment.kind,
    adjustment.runs,
    adjustment.note ?? null,
    adjustment.createdAt,
  );
  return adjustment;
}

export async function listScoreAdjustments(
  inningsId: string,
): Promise<ScoreAdjustment[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM score_adjustments WHERE innings_id = ? ORDER BY created_at ASC',
    inningsId,
  );
  return rows.map(rowToScoreAdjustment);
}

function rowToScoreAdjustment(row: any): ScoreAdjustment {
  return {
    id: row.id,
    inningsId: row.innings_id,
    kind: row.kind,
    runs: row.runs,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

// ---------- Batter retirements ----------

export async function insertBatterRetirement(input: {
  inningsId: string;
  playerId: string;
  kind: RetirementKind;
}): Promise<BatterRetirement> {
  const db = await getDb();
  const retirement: BatterRetirement = {
    id: newId(),
    inningsId: input.inningsId,
    playerId: input.playerId,
    kind: input.kind,
    createdAt: Date.now(),
  };
  await db.runAsync(
    `INSERT INTO batter_retirements (id, innings_id, player_id, kind, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    retirement.id,
    retirement.inningsId,
    retirement.playerId,
    retirement.kind,
    retirement.createdAt,
  );
  return retirement;
}

export async function listBatterRetirements(
  inningsId: string,
): Promise<BatterRetirement[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM batter_retirements WHERE innings_id = ? ORDER BY created_at ASC',
    inningsId,
  );
  return rows.map(rowToBatterRetirement);
}

function rowToBatterRetirement(row: any): BatterRetirement {
  return {
    id: row.id,
    inningsId: row.innings_id,
    playerId: row.player_id,
    kind: row.kind,
    createdAt: row.created_at,
  };
}

// ---------- Scoring sessions ----------

export async function saveScoringSession(
  input: Omit<ScoringSession, 'updatedAt'> & { updatedAt?: number },
): Promise<ScoringSession> {
  const db = await getDb();
  return saveScoringSessionInDb(db, input);
}

export async function getScoringSession(matchId: string): Promise<ScoringSession | null> {
  const db = await getDb();
  return getScoringSessionFromDb(db, matchId);
}

export async function clearScoringSession(matchId: string): Promise<void> {
  const db = await getDb();
  await clearScoringSessionInDb(db, matchId);
}
