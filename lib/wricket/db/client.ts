import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { runMigrations } from './schema';

export { newId, newUuid } from './ids';

// expo-sqlite web persistence uses the alpha OPFS AccessHandle VFS. Its worker
// can retain an exclusive file handle across Fast Refresh or a tab reload,
// causing createSyncAccessHandle/statement-finalization crashes. Web is
// cloud-authoritative, so its SQLite layer is intentionally an ephemeral cache.
// Native keeps the durable database required for offline scoring.
export const DB_NAME = Platform.OS === 'web' ? ':memory:' : 'wricket.db';

type DbCache = {
  db: SQLite.SQLiteDatabase | null;
  promise: Promise<SQLite.SQLiteDatabase> | null;
};

const DB_CACHE_KEY = '__wricketSqliteCache';
const globalWithDbCache = globalThis as typeof globalThis & {
  [DB_CACHE_KEY]?: DbCache;
};

// Expo web keeps its SQLite worker alive across Fast Refresh. Keeping this
// cache on globalThis prevents a refreshed module from opening the same OPFS
// database through a second worker connection.
const dbCache = globalWithDbCache[DB_CACHE_KEY] ??= { db: null, promise: null };

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbCache.db) return dbCache.db;
  if (!dbCache.promise) {
    dbCache.promise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME, {
        useNewConnection: false,
      });
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await runMigrations(db);
      dbCache.db = db;
      return db;
    })().catch(error => {
      dbCache.promise = null;
      throw error;
    });
  }
  return dbCache.promise;
}

export async function resetDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DROP TABLE IF EXISTS balls;
    DROP TABLE IF EXISTS score_adjustments;
    DROP TABLE IF EXISTS batter_retirements;
    DROP TABLE IF EXISTS scoring_sessions;
    DROP TABLE IF EXISTS sync_outbox;
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
