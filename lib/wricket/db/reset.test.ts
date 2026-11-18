import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MigrationDatabase } from './schema';

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => state.db }));
import { getDb, resetDb } from './client';

let sqlite: Database;
beforeEach(async () => {
  // Client cache is reused within this isolated module; provide a fresh database only once.
  if (!sqlite) {
    sqlite = new (await initSqlJs()).Database();
    const db: MigrationDatabase = {
      execAsync: async sql => { sqlite.run(sql); },
      runAsync: async (sql, ...params) => { sqlite.run(sql, params as SqlValue[]); return {}; },
      getFirstAsync: async <T,>(sql: string, ...params: unknown[]) => {
        const statement = sqlite.prepare(sql);
        try { statement.bind(params as SqlValue[]); return statement.step() ? statement.getAsObject() as T : null; }
        finally { statement.free(); }
      },
    };
    state.db = db;
  }
  await getDb();
});
afterEach(async () => { await resetDb(); });
afterAll(() => { sqlite.close(); });

describe('account/device SQLite cleanup', () => {
  it('clears and recreates a fresh schema repeatedly with foreign keys enabled', async () => {
    await expect(resetDb()).resolves.toBeUndefined();
    await expect(resetDb()).resolves.toBeUndefined();
    expect(sqlite.exec('PRAGMA foreign_keys')[0].values[0][0]).toBe(1);
    expect(sqlite.exec('SELECT COUNT(*) FROM scoring_event_outbox')[0].values[0][0]).toBe(0);
  });
  it('removes queued scoring with its referenced innings before recreating tables', async () => {
    sqlite.run("insert into teams(id,name,short_name,color_hex,created_at) values('a','A','A','#fff',0),('b','B','B','#fff',0)");
    sqlite.run("insert into matches(id,format,rules_json,team_a_id,team_b_id,status,created_at) values('m','T20','{}','a','b','IN_PROGRESS',0)");
    sqlite.run("insert into innings(id,match_id,sequence,batting_team_id,bowling_team_id,total_runs,total_wickets,total_balls,is_closed,is_follow_on) values('i','m',1,'a','b',0,0,0,0,0)");
    sqlite.run("insert into scoring_event_outbox(client_event_id,match_id,innings_id,kind,payload_json,created_at) values('queued','m','i','BALL_RECORDED','{}',0)");
    await expect(resetDb()).resolves.toBeUndefined();
    for (const table of ['matches', 'innings', 'scoring_event_outbox']) {
      expect(sqlite.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0]).toBe(0);
    }
  });
});
