import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runMigrations } from './schema';
import { DEFAULT_RULES } from '../domain/types';
import type { ScoringDatabase, ScoringTransaction } from './scoringTransaction';

const state = vi.hoisted(() => ({ db: undefined as unknown, scopedDb: undefined as unknown, platform: 'android', sync: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { get OS() { return state.platform; } } }));
vi.mock('./client', async () => ({ ...(await import('./ids')), getDb: async () => state.db, openScoringTransactionConnection: async () => state.scopedDb }));
vi.mock('@/lib/supabase/cloudScoringApi', async () => {
  const { enqueueScoringEvent } = await import('./scoringEventOutbox');
  return { queueCloudScoringEvent: async (event: never, tx: ScoringTransaction) => {
    await enqueueScoringEvent(event, tx.db);
    tx.afterCommit(state.sync);
  } };
});
vi.mock('../app/mvp', () => ({ recalculateMatchMvp: vi.fn() }));

import { withScoringTransaction } from './scoringTransaction';
import { createInnings, deleteLastBall, getMatch, insertBall, insertBatterRetirement, insertScoreAdjustment, listBalls, saveScoringSession, updateInningsTotals } from './repo';
import { enqueueScoringEvent } from './scoringEventOutbox';
import { closeAndAdvance, resolveAbandonedMatchLifecycle, startNextInnings } from '../app/innings-flow';

const matchId = '11111111-1111-4111-8111-111111111111';
const inningsId = '22222222-2222-4222-8222-222222222222';
const teamA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teamB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let sqlite: Database;
let connection: ScoringDatabase;
let failAt: string | undefined;
let inTransaction = false;
const query = <T,>(sql: string, params: unknown[] = []): T[] => {
  const statement = sqlite.prepare(sql);
  try {
    statement.bind(params as SqlValue[]);
    const rows: T[] = [];
    while (statement.step()) rows.push(statement.getAsObject() as T);
    return rows;
  } finally { statement.free(); }
};
const count = (table: string) => query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)[0].n;
beforeEach(async () => {
  const SQL = await initSqlJs(); sqlite = new SQL.Database();
  sqlite.run('PRAGMA foreign_keys = ON');
  failAt = undefined; inTransaction = false; state.platform = 'android'; state.sync.mockClear();
  connection = {
    runAsync: async (sql: string, ...params: unknown[]) => {
      if (failAt && sql.includes(failAt)) throw new Error('Injected disk failure');
      sqlite.run(sql, params as SqlValue[]);
      return { changes: sqlite.getRowsModified(), lastInsertRowId: 0 };
    },
    getFirstAsync: async <T,>(sql: string, ...params: unknown[]) => query<T>(sql, params)[0] ?? null,
    getAllAsync: async <T,>(sql: string, ...params: unknown[]) => query<T>(sql, params),
  };
  const transaction = async (task: (db: ScoringDatabase) => Promise<void>) => {
    if (inTransaction) throw new Error('Nested transaction');
    sqlite.run('BEGIN'); inTransaction = true;
    try { await task(connection); sqlite.run('COMMIT'); }
    catch (error) { sqlite.run('ROLLBACK'); throw error; }
    finally { inTransaction = false; }
  };
  const shared = {
    ...connection,
    runAsync: async (sql: string, ...params: unknown[]) => {
      if (inTransaction && state.platform !== 'web') throw new Error('Escaped exclusive transaction');
      return connection.runAsync(sql, ...params as (string | number | null)[]);
    },
    execAsync: async (sql: string) => { sqlite.run(sql); },
    withExclusiveTransactionAsync: transaction,
    withTransactionAsync: (task: () => Promise<void>) => transaction(() => task()),
  };
  state.db = shared;
  state.scopedDb = { ...connection, withTransactionAsync: (task: () => Promise<void>) => transaction(() => task()), closeAsync: async () => undefined };
  await runMigrations(shared);
  for (const id of [teamA, teamB]) sqlite.run('INSERT INTO teams(id,name,short_name,color_hex,created_at) VALUES(?,?,?,?,0)', [id, id, 'XI', '#ffffff']);
  for (const id of ['p1','p2','p3']) sqlite.run('INSERT INTO users(id,name,role,created_at) VALUES(?,?,?,0)', [id,id,'AR']);
  sqlite.run('INSERT INTO matches(id,format,rules_json,team_a_id,team_b_id,status,created_at) VALUES(?,?,?,?,?,?,0)', [matchId,'T20',JSON.stringify(DEFAULT_RULES.T20),teamA,teamB,'IN_PROGRESS']);
  await createInnings({ id: inningsId, matchId, sequence: 1, battingTeamId: teamA, bowlingTeamId: teamB });
});
afterEach(() => { sqlite.close(); });

async function delivery(tx: ScoringTransaction) {
  const ball = await insertBall({ inningsId, overNo: 0, ballInOver: 1, legalBallInOver: 1, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'p3', runsBat: 4, runsExtra: 0, extraKind: null, isLegal: true, isWicket: false }, tx.db);
  await updateInningsTotals(inningsId, { runs: 4, wickets: 0, balls: 1 }, tx.db);
  await saveScoringSession({ matchId, inningsId, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'p3', pendingPrompt: null, lastCommittedEventSequence: 1 }, tx.db);
  await enqueueScoringEvent({ clientEventId: ball.id, matchId, inningsId, kind: 'BALL_RECORDED', payload: { runs_bat: 4 } }, tx.db);
}

describe('durable scoring commands against SQLite', () => {
  it.each(['UPDATE innings', 'INSERT OR REPLACE INTO scoring_sessions', 'INSERT OR IGNORE INTO scoring_event_outbox'])('rolls back a delivery when %s fails and emits no receipt', async failure => {
    failAt = failure; const receipt = vi.fn();
    await expect(withScoringTransaction(async tx => { await delivery(tx); tx.afterCommit(receipt); })).rejects.toThrow('disk failure');
    expect(count('balls')).toBe(0); expect(count('scoring_sessions')).toBe(0); expect(count('scoring_event_outbox')).toBe(0);
    expect(query<{ total_runs: number }>('SELECT total_runs FROM innings')[0].total_runs).toBe(0);
    expect(receipt).not.toHaveBeenCalled();
    failAt = undefined; await withScoringTransaction(delivery);
    expect(count('balls')).toBe(1); expect(count('scoring_event_outbox')).toBe(1);
  });
  it('publishes feedback after commit and restores the event, totals, session and outbox after reopening', async () => {
    const receipt = vi.fn(() => { expect(inTransaction).toBe(false); });
    await withScoringTransaction(async tx => { await delivery(tx); tx.afterCommit(receipt); });
    expect(receipt).toHaveBeenCalledOnce();
    const bytes = sqlite.export(); sqlite.close(); sqlite = new (await initSqlJs()).Database(bytes);
    expect(count('balls')).toBe(1); expect(count('scoring_sessions')).toBe(1); expect(count('scoring_event_outbox')).toBe(1);
    expect(query<{ total_runs: number; total_balls: number }>('SELECT total_runs,total_balls FROM innings')[0]).toEqual({ total_runs: 4, total_balls: 1 });
  });
  it('retains the original ball and totals when Undo cannot save its correction event', async () => {
    await withScoringTransaction(delivery); failAt = 'INSERT OR IGNORE INTO scoring_event_outbox';
    await expect(withScoringTransaction(async tx => {
      const ball = await deleteLastBall(inningsId, tx.db);
      await updateInningsTotals(inningsId, { runs: 0, wickets: 0, balls: 0 }, tx.db);
      await enqueueScoringEvent({ clientEventId: 'undo', matchId, inningsId, kind: 'BALL_CORRECTED', payload: { target_client_event_id: ball!.id } }, tx.db);
    })).rejects.toThrow('disk failure');
    expect((await listBalls(inningsId))[0].runsBat).toBe(4);
    expect(query<{ total_runs: number }>('SELECT total_runs FROM innings')[0].total_runs).toBe(4);
    expect(count('scoring_event_outbox')).toBe(1);
  });
  it.each(['BONUS','PENALTY'] as const)('rolls back %s when its restoration state cannot be saved', async kind => {
    failAt = 'INSERT OR REPLACE INTO scoring_sessions';
    await expect(withScoringTransaction(async tx => {
      await insertScoreAdjustment({ inningsId, kind, runs: 5 }, tx.db);
      await updateInningsTotals(inningsId, { runs: 5, wickets: 0, balls: 0 }, tx.db);
      await saveScoringSession({ matchId, inningsId, pendingPrompt: null, lastCommittedEventSequence: 1 }, tx.db);
    })).rejects.toThrow('disk failure');
    expect(count('score_adjustments')).toBe(0);
  });
  it.each(['RETIRED_HURT','RETIRED_OUT'] as const)('rolls back %s rather than losing the batter after a failed save', async kind => {
    failAt = 'UPDATE innings';
    await expect(withScoringTransaction(async tx => {
      await insertBatterRetirement({ inningsId, playerId: 'p1', kind }, tx.db);
      await updateInningsTotals(inningsId, { runs: 0, wickets: kind === 'RETIRED_OUT' ? 1 : 0, balls: 0 }, tx.db);
    })).rejects.toThrow('disk failure');
    expect(count('batter_retirements')).toBe(0);
  });
  it('rolls back closing, session clearing and the next innings when its start event fails', async () => {
    await withScoringTransaction(delivery);
    failAt = 'INSERT OR IGNORE INTO scoring_event_outbox';
    await expect(withScoringTransaction(async tx => {
      const step = await closeAndAdvance(matchId, inningsId, tx);
      await startNextInnings(matchId, step.next!, tx);
    })).rejects.toThrow('disk failure');
    expect(count('innings')).toBe(1); expect(count('scoring_sessions')).toBe(1);
    expect(query<{ is_closed: number }>('SELECT is_closed FROM innings')[0].is_closed).toBe(0);
    expect(state.sync).not.toHaveBeenCalled();
    failAt = undefined;
    await withScoringTransaction(async tx => { const step = await closeAndAdvance(matchId, inningsId, tx); await startNextInnings(matchId, step.next!, tx); });
    expect(count('innings')).toBe(2); expect(count('scoring_sessions')).toBe(0);
    expect(query<{ kind: string }>('SELECT kind FROM scoring_event_outbox ORDER BY rowid').map(row => row.kind)).toEqual(['BALL_RECORDED','INNINGS_CLOSED','INNINGS_STARTED']);
    expect((await getMatch(matchId))?.status).toBe('IN_PROGRESS');
  });
  it.each(['CANCELLED','NO_RESULT','WALKOVER'] as const)('retains the active match when %s cannot be queued, then commits the result and session cleanup together', async resolution => {
    await withScoringTransaction(delivery); failAt = 'INSERT OR IGNORE INTO scoring_event_outbox';
    await expect(resolveAbandonedMatchLifecycle(matchId, inningsId, resolution, teamB)).rejects.toThrow('disk failure');
    expect((await getMatch(matchId))?.status).toBe('IN_PROGRESS'); expect(count('scoring_sessions')).toBe(1);
    failAt = undefined; await resolveAbandonedMatchLifecycle(matchId, inningsId, resolution, teamB);
    expect((await getMatch(matchId))?.result).toEqual(resolution === 'WALKOVER' ? { kind: resolution, winnerTeamId: teamB } : { kind: resolution });
    expect(count('scoring_sessions')).toBe(0); expect(state.sync).toHaveBeenCalledOnce();
  });
  it('serializes web scoring commands and releases its queue after rollback', async () => {
    state.platform = 'web'; const order: string[] = [];
    const first = withScoringTransaction(async tx => { order.push('first'); await insertScoreAdjustment({ inningsId, kind: 'BONUS', runs: 1 }, tx.db); throw new Error('disk failure'); });
    const second = withScoringTransaction(async tx => { order.push('second'); await insertScoreAdjustment({ inningsId, kind: 'BONUS', runs: 2 }, tx.db); });
    await expect(first).rejects.toThrow('disk failure'); await second;
    expect(order).toEqual(['first','second']); expect(count('score_adjustments')).toBe(1);
  });
  it('enforces outbox foreign keys and releases the writer queue before post-commit commands', async () => {
    await expect(withScoringTransaction(tx => enqueueScoringEvent({ clientEventId: 'orphan', matchId, inningsId: 'missing', kind: 'INNINGS_STARTED', payload: {} }, tx.db))).rejects.toThrow('FOREIGN KEY');
    await withScoringTransaction(async tx => { tx.afterCommit(() => withScoringTransaction(delivery)); });
    expect(count('balls')).toBe(1);
  });
  it.each([
    { second: 9, result: { kind: 'WIN_BY_RUNS', winnerTeamId: teamA, margin: 1, marginUnit: 'RUNS' } },
    { second: 10, result: { kind: 'TIE' } },
    { second: 11, result: { kind: 'WIN_BY_WICKETS', winnerTeamId: teamB, margin: 2, marginUnit: 'WICKETS' } },
  ])('commits the limited-overs outcome when the chase ends on $second runs', async ({ second, result }) => {
    sqlite.run('UPDATE matches SET rules_json=? WHERE id=?', [JSON.stringify({ ...DEFAULT_RULES.T20, playersPerSide: 3 }),matchId]);
    await updateInningsTotals(inningsId,{ runs: 10,wickets: 0,balls: 6 });
    const next = await closeAndAdvance(matchId,inningsId); await startNextInnings(matchId,next.next!);
    const secondId = query<{ id: string }>('SELECT id FROM innings WHERE sequence=2')[0].id;
    await updateInningsTotals(secondId,{ runs: second,wickets: 0,balls: 6 });
    const completed = await closeAndAdvance(matchId,secondId);
    expect(completed.result).toEqual(result); expect((await getMatch(matchId))?.result).toEqual(result);
    expect(query<{ kind: string }>('SELECT kind FROM scoring_event_outbox ORDER BY rowid').at(-1)?.kind).toBe('MATCH_COMPLETED');
  });
  it.each([false,true])('preserves a follow-on decision across restart and applies enforce=%s without duplicating innings', async enforce => {
    sqlite.run('UPDATE matches SET format=?,rules_json=? WHERE id=?', ['TURF_TEST',JSON.stringify({ ...DEFAULT_RULES.TURF_TEST, oversPerInnings: 1,playersPerSide: 3,followOnEnabled: true }),matchId]);
    await updateInningsTotals(inningsId,{ runs: 35,wickets: 0,balls: 6 });
    const next = await closeAndAdvance(matchId,inningsId); await startNextInnings(matchId,next.next!);
    const secondId = query<{ id: string }>('SELECT id FROM innings WHERE sequence=2')[0].id;
    await updateInningsTotals(secondId,{ runs: 10,wickets: 2,balls: 6 });
    expect((await closeAndAdvance(matchId,secondId)).kind).toBe('FOLLOW_ON_DECISION');
    const bytes = sqlite.export(); sqlite.close(); sqlite = new (await initSqlJs()).Database(bytes);
    expect((await getMatch(matchId))?.status).toBe('FOLLOW_ON_DECISION'); expect(count('innings')).toBe(2);
    const decision = { sequence: 3 as const,battingTeamId: enforce ? teamB : teamA,bowlingTeamId: enforce ? teamA : teamB,isFollowOn: enforce };
    await startNextInnings(matchId,decision); await startNextInnings(matchId,decision);
    expect(count('innings')).toBe(3);
    const third = query<{ id: string; batting_team_id: string; is_follow_on: number }>('SELECT id,batting_team_id,is_follow_on FROM innings WHERE sequence=3')[0];
    expect(third.batting_team_id).toBe(decision.battingTeamId); expect(third.is_follow_on).toBe(Number(enforce));
    expect(query<{ n: number }>("SELECT COUNT(*) AS n FROM scoring_event_outbox WHERE kind='INNINGS_STARTED'")[0].n).toBe(2);
  });
  it('rolls back the terminal innings, result and queued completion when final result persistence fails', async () => {
    const next = await closeAndAdvance(matchId,inningsId); await startNextInnings(matchId,next.next!);
    const secondId = query<{ id: string }>('SELECT id FROM innings WHERE sequence=2')[0].id;
    const previousEvents = count('scoring_event_outbox'); state.sync.mockClear(); failAt = 'UPDATE matches SET result_json';
    await expect(closeAndAdvance(matchId,secondId)).rejects.toThrow('disk failure');
    expect(query<{ is_closed: number }>('SELECT is_closed FROM innings WHERE id=?',[secondId])[0].is_closed).toBe(0);
    expect((await getMatch(matchId))?.result).toBeUndefined(); expect(count('scoring_event_outbox')).toBe(previousEvents);
    expect(state.sync).not.toHaveBeenCalled();
  });
  it.each([teamA,teamB])('records either participating team as the walkover winner (%s)', async winner => {
    await resolveAbandonedMatchLifecycle(matchId,inningsId,'WALKOVER',winner);
    expect((await getMatch(matchId))?.result).toEqual({ kind: 'WALKOVER',winnerTeamId: winner });
    expect((await getMatch(matchId))?.status).toBe('COMPLETED');
  });
});
