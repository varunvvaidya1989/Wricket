import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { getDb, openScoringTransactionConnection } from './client';

export type ScoringDatabase = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;
export interface ScoringTransaction {
  db: ScoringDatabase;
  afterCommit(effect: () => void | Promise<void>): void;
}

// Serialize commands. Native uses a private connection so unrelated cache writes
// cannot join, with foreign keys enabled before the transaction begins.
let commandTail: Promise<unknown> = Promise.resolve();
export async function withScoringTransaction<T>(
  task: (transaction: ScoringTransaction) => Promise<T>,
  existing?: ScoringTransaction,
): Promise<T> {
  if (existing) return task(existing);
  const execute = async () => {
    const db = Platform.OS === 'web' ? await getDb() : await openScoringTransactionConnection();
    const effects: (() => void | Promise<void>)[] = [];
    let value!: T;
    const run = async (connection: ScoringDatabase) => {
      value = await task({ db: connection, afterCommit: effect => { effects.push(effect); } });
    };
    try { await db.withTransactionAsync(() => run(db)); }
    finally { if (Platform.OS !== 'web') await db.closeAsync(); }
    return { value, effects };
  };
  const next = commandTail.then(execute, execute);
  commandTail = next.then(() => undefined, () => undefined);
  const { value, effects } = await next;
  // Release the writer queue before effects that may open another command.
  // Never publish a UI receipt or send a cloud event before SQLite commits.
  for (const effect of effects) await effect();
  return value;
}
