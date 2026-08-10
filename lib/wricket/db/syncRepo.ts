import { getDb } from './client';
import type { MatchFormat, PlayerRole, SyncStatus } from '../domain/types';

export interface SyncOutboxItem {
  id: string;
  entityType: 'TOURNAMENT' | 'TEAM' | 'PLAYER' | 'TEAM_PLAYER';
  entityId: string;
  attempts: number;
}

export async function seedSyncOutbox(): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_outbox (id, entity_type, entity_id, operation, attempts, created_at, next_attempt_at)
       SELECT 'seed_t_' || id, 'TOURNAMENT', id, 'UPSERT', 0, ?, 0 FROM tournaments WHERE cloud_id IS NULL`,
      now,
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_outbox (id, entity_type, entity_id, operation, attempts, created_at, next_attempt_at)
       SELECT 'seed_team_' || id, 'TEAM', id, 'UPSERT', 0, ?, 0 FROM teams WHERE cloud_id IS NULL`,
      now,
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_outbox (id, entity_type, entity_id, operation, attempts, created_at, next_attempt_at)
       SELECT 'seed_player_' || id, 'PLAYER', id, 'UPSERT', 0, ?, 0 FROM users WHERE cloud_id IS NULL`,
      now,
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_outbox (id, entity_type, entity_id, operation, attempts, created_at, next_attempt_at)
       SELECT 'seed_membership_' || team_id || '_' || user_id, 'TEAM_PLAYER',
              team_id || ':' || user_id, 'UPSERT', 0, ?, 0
       FROM team_players WHERE sync_status != 'SYNCED'`,
      now,
    );
    await db.runAsync("UPDATE tournaments SET sync_status = 'PENDING' WHERE cloud_id IS NULL");
    await db.runAsync("UPDATE teams SET sync_status = 'PENDING' WHERE cloud_id IS NULL");
    await db.runAsync("UPDATE users SET sync_status = 'PENDING' WHERE cloud_id IS NULL");
    await db.runAsync("UPDATE team_players SET sync_status = 'PENDING' WHERE sync_status != 'SYNCED'");
  });
}

export async function listPendingSyncItems(): Promise<SyncOutboxItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM sync_outbox WHERE next_attempt_at <= ?
     ORDER BY CASE entity_type
       WHEN 'TOURNAMENT' THEN 0 WHEN 'TEAM' THEN 1 WHEN 'PLAYER' THEN 2 ELSE 3
     END, created_at ASC`,
    Date.now(),
  );
  return rows.map(row => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    attempts: row.attempts,
  }));
}

export async function retryFailedSyncItems(): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sync_outbox SET next_attempt_at = 0 WHERE last_error IS NOT NULL");
}

export async function markSyncComplete(
  item: SyncOutboxItem,
  cloudId?: string,
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (item.entityType === 'TEAM_PLAYER') {
      const [teamId, userId] = splitMembershipId(item.entityId);
      await db.runAsync(
        `UPDATE team_players SET sync_status = 'SYNCED', sync_error = NULL
         WHERE team_id = ? AND user_id = ?`,
        teamId,
        userId,
      );
    } else {
      const table = entityTable(item.entityType);
      await db.runAsync(
        `UPDATE ${table} SET cloud_id = ?, sync_status = 'SYNCED', sync_error = NULL WHERE id = ?`,
        cloudId ?? null,
        item.entityId,
      );
    }
    await db.runAsync('DELETE FROM sync_outbox WHERE id = ?', item.id);
  });
}

export async function markSyncFailed(item: SyncOutboxItem, message: string): Promise<void> {
  const db = await getDb();
  const attempts = item.attempts + 1;
  const retryAt = Date.now() + Math.min(60_000, 2 ** attempts * 2_000);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE sync_outbox SET attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?',
      attempts,
      message,
      retryAt,
      item.id,
    );
    if (item.entityType === 'TEAM_PLAYER') {
      const [teamId, userId] = splitMembershipId(item.entityId);
      await db.runAsync(
        `UPDATE team_players SET sync_status = 'FAILED', sync_error = ?
         WHERE team_id = ? AND user_id = ?`,
        message,
        teamId,
        userId,
      );
    } else {
      await db.runAsync(
        `UPDATE ${entityTable(item.entityType)}
         SET sync_status = 'FAILED', sync_error = ? WHERE id = ?`,
        message,
        item.entityId,
      );
    }
  });
}

export async function mergeCloudTournament(input: {
  cloudId: string;
  sourceLocalId: string | null;
  name: string;
  format: MatchFormat;
  startDate: number;
  endDate?: number;
  pointsWin: number;
  pointsTie: number;
  pointsLoss: number;
  pointsNoResult: number;
  createdAt: number;
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
  bannerUrl?: string;
  logoUrl?: string;
}): Promise<string> {
  const db = await getDb();
  const existing = await db.getFirstAsync<any>(
    'SELECT id FROM tournaments WHERE cloud_id = ? OR id = ? LIMIT 1',
    input.cloudId,
    input.sourceLocalId ?? '',
  );
  const id = existing?.id ?? input.sourceLocalId ?? `cloud_${input.cloudId}`;
  await db.runAsync(
    `INSERT INTO tournaments
       (id, name, format, start_date, end_date, points_win, points_tie, points_loss,
        points_no_result, status, created_at, cloud_id, sync_status, sync_error, updated_at,
        organizer_profile_id, organizer_phone, location, latitude, longitude, google_place_id,
        google_maps_url, planned_team_count, players_per_team, overs_per_match,
        description, social_media_url, banner_url, logo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, 'SYNCED', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, format=excluded.format,
       start_date=excluded.start_date, end_date=excluded.end_date,
       points_win=excluded.points_win, points_tie=excluded.points_tie,
       points_loss=excluded.points_loss, points_no_result=excluded.points_no_result,
       cloud_id=excluded.cloud_id, sync_status='SYNCED', sync_error=NULL, updated_at=excluded.updated_at,
       organizer_profile_id=excluded.organizer_profile_id, organizer_phone=excluded.organizer_phone,
       location=excluded.location, latitude=excluded.latitude, longitude=excluded.longitude,
       google_place_id=excluded.google_place_id, google_maps_url=excluded.google_maps_url,
       planned_team_count=excluded.planned_team_count, players_per_team=excluded.players_per_team,
       overs_per_match=excluded.overs_per_match,
       description=excluded.description, social_media_url=excluded.social_media_url,
       banner_url=excluded.banner_url, logo_url=excluded.logo_url`,
    id, input.name, input.format, input.startDate, input.endDate ?? null,
    input.pointsWin, input.pointsTie, input.pointsLoss, input.pointsNoResult,
    input.createdAt, input.cloudId, Date.now(), input.organizerProfileId ?? null,
    input.organizerPhone ?? null, input.location ?? null, input.latitude ?? null, input.longitude ?? null,
    input.googlePlaceId ?? null, input.googleMapsUrl ?? null,
    input.plannedTeamCount, input.playersPerTeam, input.oversPerMatch,
    input.description ?? null, input.socialMediaUrl ?? null,
    input.bannerUrl ?? null, input.logoUrl ?? null,
  );
  return id;
}

export async function updateTournamentCloudMedia(
  tournamentId: string,
  bannerUrl?: string,
  logoUrl?: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE tournaments
     SET banner_url = ?, logo_url = ?,
         banner_local_uri = CASE WHEN ? IS NOT NULL THEN NULL ELSE banner_local_uri END,
         logo_local_uri = CASE WHEN ? IS NOT NULL THEN NULL ELSE logo_local_uri END
     WHERE id = ?`,
    bannerUrl ?? null,
    logoUrl ?? null,
    bannerUrl ?? null,
    logoUrl ?? null,
    tournamentId,
  );
}

export async function mergeCloudTeam(input: {
  cloudId: string;
  sourceLocalId: string | null;
  tournamentCloudId: string | null;
  name: string;
  shortName: string;
  colorHex: string;
  logoUrl?: string;
  createdAt: number;
}): Promise<void> {
  const db = await getDb();
  const tournament = input.tournamentCloudId
    ? await db.getFirstAsync<{ id: string }>('SELECT id FROM tournaments WHERE cloud_id = ?', input.tournamentCloudId)
    : null;
  const existing = await db.getFirstAsync<any>(
    'SELECT id FROM teams WHERE cloud_id = ? OR id = ? LIMIT 1',
    input.cloudId,
    input.sourceLocalId ?? '',
  );
  const id = existing?.id ?? input.sourceLocalId ?? `cloud_${input.cloudId}`;
  await db.runAsync(
    `INSERT INTO teams
       (id, tournament_id, name, short_name, color_hex, logo_url, created_at, cloud_id, sync_status, sync_error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', NULL, ?)
     ON CONFLICT(id) DO UPDATE SET tournament_id=excluded.tournament_id, name=excluded.name,
       short_name=excluded.short_name, color_hex=excluded.color_hex, logo_url=excluded.logo_url, cloud_id=excluded.cloud_id,
       sync_status='SYNCED', sync_error=NULL, updated_at=excluded.updated_at`,
    id, tournament?.id ?? null, input.name, input.shortName, input.colorHex, input.logoUrl ?? null,
    input.createdAt, input.cloudId, Date.now(),
  );
}

export async function mergeCloudPlayer(input: {
  cloudId: string;
  sourceLocalId: string | null;
  name: string;
  role: PlayerRole;
  battingHand?: 'RIGHT' | 'LEFT';
  bowlingStyle?: string;
  createdAt: number;
}): Promise<string> {
  const db = await getDb();
  const existing = await db.getFirstAsync<any>(
    'SELECT id FROM users WHERE cloud_id = ? OR id = ? LIMIT 1',
    input.cloudId,
    input.sourceLocalId ?? '',
  );
  const id = existing?.id ?? input.sourceLocalId ?? `cloud_${input.cloudId}`;
  await db.runAsync(
    `INSERT INTO users
       (id, name, role, batting_hand, bowling_style, created_at, cloud_id, sync_status, sync_error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', NULL, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role,
       batting_hand=excluded.batting_hand, bowling_style=excluded.bowling_style,
       cloud_id=excluded.cloud_id, sync_status='SYNCED', sync_error=NULL, updated_at=excluded.updated_at`,
    id, input.name, input.role, input.battingHand ?? null, input.bowlingStyle ?? null,
    input.createdAt, input.cloudId, Date.now(),
  );
  return id;
}

export async function getTeamPlayerForSync(teamId: string, userId: string) {
  const db = await getDb();
  return db.getFirstAsync<{
    team_cloud_id: string | null;
    player_cloud_id: string | null;
    jersey_no: number | null;
    is_captain: number;
    is_keeper: number;
  }>(
    `SELECT t.cloud_id AS team_cloud_id, u.cloud_id AS player_cloud_id,
            tp.jersey_no, tp.is_captain, tp.is_keeper
     FROM team_players tp
     JOIN teams t ON t.id = tp.team_id
     JOIN users u ON u.id = tp.user_id
     WHERE tp.team_id = ? AND tp.user_id = ?`,
    teamId,
    userId,
  );
}

export async function mergeCloudTeamPlayer(input: {
  teamCloudId: string;
  playerCloudId: string;
  jerseyNo?: number;
  isCaptain: boolean;
  isKeeper: boolean;
}): Promise<void> {
  const db = await getDb();
  const team = await db.getFirstAsync<{ id: string }>('SELECT id FROM teams WHERE cloud_id = ?', input.teamCloudId);
  const player = await db.getFirstAsync<{ id: string }>('SELECT id FROM users WHERE cloud_id = ?', input.playerCloudId);
  if (!team || !player) return;
  await db.runAsync(
    `INSERT INTO team_players
       (team_id, user_id, jersey_no, is_captain, is_keeper, sync_status, sync_error, updated_at)
     VALUES (?, ?, ?, ?, ?, 'SYNCED', NULL, ?)
     ON CONFLICT(team_id, user_id) DO UPDATE SET jersey_no=excluded.jersey_no,
       is_captain=excluded.is_captain, is_keeper=excluded.is_keeper,
       sync_status='SYNCED', sync_error=NULL, updated_at=excluded.updated_at`,
    team.id, player.id, input.jerseyNo ?? null,
    input.isCaptain ? 1 : 0, input.isKeeper ? 1 : 0, Date.now(),
  );
}

export async function getSyncCounts(): Promise<Record<SyncStatus, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ sync_status: SyncStatus; count: number }>(
    `SELECT sync_status, COUNT(*) AS count FROM (
       SELECT sync_status FROM tournaments UNION ALL SELECT sync_status FROM teams
       UNION ALL SELECT sync_status FROM users
       UNION ALL SELECT sync_status FROM team_players
     ) GROUP BY sync_status`,
  );
  const counts: Record<SyncStatus, number> = { LOCAL: 0, PENDING: 0, SYNCED: 0, FAILED: 0 };
  for (const row of rows) counts[row.sync_status] = row.count;
  return counts;
}

export function splitMembershipId(entityId: string): [string, string] {
  const separator = entityId.indexOf(':');
  if (separator <= 0 || separator === entityId.length - 1) {
    throw new Error(`Invalid team membership sync id: ${entityId}`);
  }
  return [entityId.slice(0, separator), entityId.slice(separator + 1)];
}

function entityTable(entityType: Exclude<SyncOutboxItem['entityType'], 'TEAM_PLAYER'>): string {
  if (entityType === 'TOURNAMENT') return 'tournaments';
  if (entityType === 'TEAM') return 'teams';
  return 'users';
}
