import { describe, expect, it } from 'vitest';

import { getPendingMigrations, MIGRATIONS, SCHEMA_SQL, SCHEMA_VERSION } from './schema';

describe('schema migrations', () => {
  it('keeps schema version aligned with the latest migration', () => {
    expect(SCHEMA_VERSION).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
  });

  it('returns migrations after the applied version', () => {
    expect(getPendingMigrations(0).map((migration) => migration.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(getPendingMigrations(1).map((migration) => migration.version)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(getPendingMigrations(SCHEMA_VERSION)).toEqual([]);
  });

  it('contains migration tracking and core scoring tables', () => {
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS schema_migrations');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS balls');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS innings');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS scoring_sessions');
    expect(SCHEMA_SQL).toContain('last_committed_event_sequence INTEGER NOT NULL DEFAULT 0');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS sync_outbox');
    expect(SCHEMA_SQL).toContain('ALTER TABLE users ADD COLUMN cloud_id TEXT');
    expect(SCHEMA_SQL).toContain('ALTER TABLE tournaments ADD COLUMN organizer_profile_id TEXT');
    expect(SCHEMA_SQL).toContain('ALTER TABLE tournaments ADD COLUMN location TEXT');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS scoring_event_outbox');
    expect(SCHEMA_SQL).toContain('ALTER TABLE balls ADD COLUMN assistant_fielder_id TEXT');
    expect(SCHEMA_SQL).toContain('ALTER TABLE tournaments ADD COLUMN latitude REAL');
  });
});
