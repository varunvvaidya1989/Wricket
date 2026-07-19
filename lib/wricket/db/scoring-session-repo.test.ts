import { describe, expect, it } from 'vitest';

import {
  clearScoringSessionInDb,
  getScoringSessionFromDb,
  rowToScoringSession,
  saveScoringSessionInDb,
  type ScoringSessionDatabase,
} from './scoringSessionRepo';

class FakeSessionDb implements ScoringSessionDatabase {
  transactions = 0;
  runs: { sql: string; params: unknown[] }[] = [];
  row: Record<string, unknown> | null = null;

  async withTransactionAsync<T>(task: () => Promise<T>): Promise<T> {
    this.transactions += 1;
    return task();
  }

  async runAsync(sql: string, ...params: unknown[]): Promise<unknown> {
    this.runs.push({ sql, params });
    return undefined;
  }

  async getFirstAsync<T>(_sql: string, _matchId: string): Promise<T | null> {
    return this.row as T | null;
  }
}

describe('scoring session repository', () => {
  it('saves scoring session state inside a transaction', async () => {
    const db = new FakeSessionDb();
    const session = await saveScoringSessionInDb(db, {
      matchId: 'match-1',
      inningsId: 'innings-1',
      strikerId: 'batter-1',
      nonStrikerId: 'batter-2',
      bowlerId: 'bowler-1',
      pendingPrompt: null,
      lastCommittedEventSequence: 8,
      updatedAt: 123,
    });

    expect(db.transactions).toBe(1);
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0].sql).toContain('INSERT OR REPLACE INTO scoring_sessions');
    expect(db.runs[0].params).toEqual([
      'match-1',
      'innings-1',
      'batter-1',
      'batter-2',
      'bowler-1',
      null,
      null,
      null,
      8,
      123,
    ]);
    expect(session.updatedAt).toBe(123);
  });

  it('persists pending prompt details for interrupted scoring flows', async () => {
    const db = new FakeSessionDb();
    await saveScoringSessionInDb(db, {
      matchId: 'match-1',
      inningsId: 'innings-1',
      strikerId: undefined,
      nonStrikerId: 'batter-2',
      bowlerId: undefined,
      pendingPrompt: 'NEXT_BATTER',
      pendingPlayerId: 'batter-1',
      completedOver: 4,
      lastCommittedEventSequence: 18,
      updatedAt: 456,
    });

    expect(db.runs[0].params).toEqual([
      'match-1',
      'innings-1',
      null,
      'batter-2',
      null,
      'NEXT_BATTER',
      'batter-1',
      4,
      18,
      456,
    ]);
  });

  it('loads and maps nullable session columns', async () => {
    const db = new FakeSessionDb();
    db.row = {
      match_id: 'match-1',
      innings_id: 'innings-1',
      striker_id: null,
      non_striker_id: 'batter-2',
      bowler_id: null,
      pending_prompt: 'NEXT_BOWLER',
      pending_player_id: null,
      completed_over: 3,
      last_committed_event_sequence: 24,
      updated_at: 789,
    };

    await expect(getScoringSessionFromDb(db, 'match-1')).resolves.toEqual({
      matchId: 'match-1',
      inningsId: 'innings-1',
      strikerId: undefined,
      nonStrikerId: 'batter-2',
      bowlerId: undefined,
      pendingPrompt: 'NEXT_BOWLER',
      pendingPlayerId: undefined,
      completedOver: 3,
      lastCommittedEventSequence: 24,
      updatedAt: 789,
    });
  });

  it('clears a scoring session inside a transaction', async () => {
    const db = new FakeSessionDb();

    await clearScoringSessionInDb(db, 'match-1');

    expect(db.transactions).toBe(1);
    expect(db.runs).toEqual([
      {
        sql: 'DELETE FROM scoring_sessions WHERE match_id = ?',
        params: ['match-1'],
      },
    ]);
  });

  it('maps database rows without requiring a live sqlite connection', () => {
    expect(
      rowToScoringSession({
        match_id: 'match-1',
        innings_id: 'innings-1',
        striker_id: 'batter-1',
        non_striker_id: 'batter-2',
        bowler_id: 'bowler-1',
        pending_prompt: null,
        pending_player_id: null,
        completed_over: null,
        last_committed_event_sequence: 1,
        updated_at: 100,
      }),
    ).toEqual({
      matchId: 'match-1',
      inningsId: 'innings-1',
      strikerId: 'batter-1',
      nonStrikerId: 'batter-2',
      bowlerId: 'bowler-1',
      pendingPrompt: null,
      pendingPlayerId: undefined,
      completedOver: undefined,
      lastCommittedEventSequence: 1,
      updatedAt: 100,
    });
  });
});
