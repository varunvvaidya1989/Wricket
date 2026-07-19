import type { ScoringSession } from '../domain/types';

export interface ScoringSessionDatabase {
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
}

export async function saveScoringSessionInDb(
  db: ScoringSessionDatabase,
  input: Omit<ScoringSession, 'updatedAt'> & { updatedAt?: number },
): Promise<ScoringSession> {
  const session: ScoringSession = {
    ...input,
    updatedAt: input.updatedAt ?? Date.now(),
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO scoring_sessions (
         match_id, innings_id, striker_id, non_striker_id, bowler_id,
         pending_prompt, pending_player_id, completed_over,
         last_committed_event_sequence, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      session.matchId,
      session.inningsId,
      session.strikerId ?? null,
      session.nonStrikerId ?? null,
      session.bowlerId ?? null,
      session.pendingPrompt,
      session.pendingPlayerId ?? null,
      session.completedOver ?? null,
      session.lastCommittedEventSequence,
      session.updatedAt,
    );
  });

  return session;
}

export async function getScoringSessionFromDb(
  db: Pick<ScoringSessionDatabase, 'getFirstAsync'>,
  matchId: string,
): Promise<ScoringSession | null> {
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM scoring_sessions WHERE match_id = ?',
    matchId,
  );
  return row ? rowToScoringSession(row) : null;
}

export async function clearScoringSessionInDb(
  db: ScoringSessionDatabase,
  matchId: string,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM scoring_sessions WHERE match_id = ?', matchId);
  });
}

export function rowToScoringSession(row: any): ScoringSession {
  return {
    matchId: row.match_id,
    inningsId: row.innings_id,
    strikerId: row.striker_id ?? undefined,
    nonStrikerId: row.non_striker_id ?? undefined,
    bowlerId: row.bowler_id ?? undefined,
    pendingPrompt: row.pending_prompt ?? null,
    pendingPlayerId: row.pending_player_id ?? undefined,
    completedOver: row.completed_over ?? undefined,
    lastCommittedEventSequence: row.last_committed_event_sequence,
    updatedAt: row.updated_at,
  };
}
