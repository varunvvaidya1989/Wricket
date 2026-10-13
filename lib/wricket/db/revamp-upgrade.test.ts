import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runMigrations, type MigrationDatabase } from './schema';
import { writeScoringSessionInDb, getScoringSessionFromDb } from './scoringSessionRepo';
import { pinnedScoringUiVersion } from '../presentation/uiRelease';

const baseline = JSON.parse(readFileSync(new URL('../../../e2e/data/legacy-scoring-schema.json', import.meta.url), 'utf8')) as {
  schemaVersion: number; sourceRevision: string; migrations: { version: number; name: string; sql: string }[];
};
const read = <T,>(db: Database, sql: string, params: unknown[] = []): T | null => {
  const statement = db.prepare(sql);
  try { statement.bind(params as SqlValue[]); return statement.step() ? statement.getAsObject() as T : null; }
  finally { statement.free(); }
};
const adapter = (db: Database): MigrationDatabase => ({
  execAsync: async sql => { db.run(sql); },
  runAsync: async (sql, ...params) => { db.run(sql, params as SqlValue[]); return {}; },
  getFirstAsync: async <T,>(sql: string, ...params: unknown[]) => read<T>(db, sql, params),
});

describe('upgrade of a previous committed scoring database', () => {
  it('reopens schema 14, preserves pending prompt, event IDs and queued payloads, and pins presentation during rollback', async () => {
    const SQL = await initSqlJs(); let db = new SQL.Database();
    try {
      expect(baseline.schemaVersion).toBe(14);
      for (const migration of baseline.migrations) {
        // The committed version guards its logo repair when the initial schema
        // already contains that column. Reproduce that existing baseline path.
        const logoPresent = migration.version === 11 && read<{ n: number }>(db, "select count(*) as n from pragma_table_info('teams') where name='logo_url'")?.n;
        if (!logoPresent) db.run(migration.sql);
        db.run('insert into schema_migrations(version,name,applied_at) values(?,?,0)', [migration.version, migration.name]);
      }
      db.run("insert into teams(id,name,short_name,color_hex,created_at) values('a','Club A','A','#a6f477',0),('b','Club B','B','#efcb7a',0)");
      db.run("insert into users(id,name,role,created_at) values('p','Batter','BAT',0),('q','Other batter','BAT',0),('r','Bowler','BOWL',0)");
      db.run("insert into matches(id,format,rules_json,team_a_id,team_b_id,status,created_at) values('m','T20','{}','a','b','IN_PROGRESS',0)");
      db.run("insert into innings(id,match_id,sequence,batting_team_id,bowling_team_id,total_runs,total_wickets,total_balls,is_closed,is_follow_on) values('i','m',1,'a','b',4,0,1,0,0)");
      db.run("insert into scoring_sessions(match_id,innings_id,striker_id,non_striker_id,pending_prompt,completed_over,last_committed_event_sequence,updated_at) values('m','i','p','q','NEXT_BOWLER',0,1,123)");
      const payload = JSON.stringify({ runs_bat: 4, innings_id: 'i', striker_id: 'p' });
      db.run("insert into scoring_event_outbox(client_event_id,match_id,innings_id,kind,payload_json,created_at) values('same-event','m','i','BALL_RECORDED',?,123)", [payload]);
      const saved = db.export(); db.close(); db = new SQL.Database(saved);
      const storage = adapter(db);
      await runMigrations(storage); await runMigrations(storage);
      const session = await getScoringSessionFromDb(storage, 'm');
      expect(session).toMatchObject({ pendingPrompt: 'NEXT_BOWLER', lastCommittedEventSequence: 1, uiVersion: 'revamp-v1', strikerId: 'p' });
      expect(pinnedScoringUiVersion(session?.uiVersion, 'recovery-v1')).toBe('revamp-v1');
      await writeScoringSessionInDb(storage, { ...session!, pendingPrompt: null, bowlerId: 'r' });
      expect((await getScoringSessionFromDb(storage, 'm'))?.uiVersion).toBe('revamp-v1');
      expect(read(db, 'select client_event_id,payload_json,attempts from scoring_event_outbox')).toEqual({ client_event_id: 'same-event', payload_json: payload, attempts: 0 });
      expect(read(db, 'select total_runs,total_balls from innings')).toEqual({ total_runs: 4, total_balls: 1 });
      expect(read(db, 'select count(*) as count from schema_migrations where version=15')).toEqual({ count: 1 });
      expect(pinnedScoringUiVersion(undefined, 'recovery-v1')).toBe('recovery-v1');
    } finally { db.close(); }
  });
});
