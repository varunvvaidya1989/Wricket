import { getDb } from './client';

export interface PendingScoringEvent {
  clientEventId: string;
  matchId: string;
  inningsId: string;
  kind:
    | 'BALL_RECORDED'
    | 'BALL_CORRECTED'
    | 'SCORE_ADJUSTED'
    | 'BATTER_RETIRED'
    | 'INNINGS_CLOSED'
    | 'INNINGS_STARTED'
    | 'MATCH_COMPLETED'
    | 'MATCH_ABANDONED';
  payload: Record<string, unknown>;
  attempts: number;
}

export async function enqueueScoringEvent(
  event: Omit<PendingScoringEvent, 'attempts'>,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO scoring_event_outbox (
       client_event_id, match_id, innings_id, kind, payload_json, attempts, created_at
     ) VALUES (?, ?, ?, ?, ?, 0, ?)`,
    event.clientEventId,
    event.matchId,
    event.inningsId,
    event.kind,
    JSON.stringify(event.payload),
    Date.now(),
  );
}

export async function listPendingScoringEvents(matchId: string): Promise<PendingScoringEvent[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM scoring_event_outbox
     WHERE match_id = ?
     ORDER BY rowid`,
    matchId,
  );
  return rows.map(row => ({
    clientEventId: row.client_event_id,
    matchId: row.match_id,
    inningsId: row.innings_id,
    kind: row.kind,
    payload: JSON.parse(row.payload_json),
    attempts: row.attempts,
  }));
}

export async function markScoringEventSent(clientEventId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM scoring_event_outbox WHERE client_event_id = ?',
    clientEventId,
  );
}

export async function markScoringEventFailed(
  clientEventId: string,
  error: unknown,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE scoring_event_outbox
     SET attempts = attempts + 1, last_error = ?
     WHERE client_event_id = ?`,
    error instanceof Error ? error.message : String(error),
    clientEventId,
  );
}
