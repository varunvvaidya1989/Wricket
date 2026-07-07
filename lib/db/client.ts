import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

const DB_NAME = 'wricket.db';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(SCHEMA_SQL);
  await db.runAsync(
    'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
    'schema_version',
    String(SCHEMA_VERSION),
  );
  _db = db;
  return db;
}

export async function resetDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DROP TABLE IF EXISTS balls;
    DROP TABLE IF EXISTS innings;
    DROP TABLE IF EXISTS match_xis;
    DROP TABLE IF EXISTS matches;
    DROP TABLE IF EXISTS team_players;
    DROP TABLE IF EXISTS teams;
    DROP TABLE IF EXISTS tournaments;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS meta;
  `);
  await db.execAsync(SCHEMA_SQL);
}

export function newId(): string {
  // sufficient unique id for local-only data
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}
