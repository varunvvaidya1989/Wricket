import * as SQLite from 'expo-sqlite';
import { runMigrations } from './schema';

const DB_NAME = 'wricket.db';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await runMigrations(db);
  _db = db;
  return db;
}

export async function resetDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DROP TABLE IF EXISTS balls;
    DROP TABLE IF EXISTS score_adjustments;
    DROP TABLE IF EXISTS batter_retirements;
    DROP TABLE IF EXISTS scoring_sessions;
    DROP TABLE IF EXISTS innings;
    DROP TABLE IF EXISTS match_xis;
    DROP TABLE IF EXISTS matches;
    DROP TABLE IF EXISTS team_players;
    DROP TABLE IF EXISTS teams;
    DROP TABLE IF EXISTS tournaments;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS schema_migrations;
    DROP TABLE IF EXISTS meta;
  `);
  await runMigrations(db);
}

export function newId(): string {
  // sufficient unique id for local-only data
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}
