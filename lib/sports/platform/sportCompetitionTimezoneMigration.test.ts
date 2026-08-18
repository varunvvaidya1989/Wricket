import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818123000_validate_competition_timezones.sql',
), 'utf8').toLowerCase();

describe('competition time-zone validation migration', () => {
  it('validates time zones against the PostgreSQL IANA catalog', () => {
    expect(migration).toContain('pg_catalog.pg_timezone_names');
    expect(migration).toContain('invalid iana time zone');
  });

  it('guards every insert and time-zone update at the table boundary', () => {
    expect(migration).toContain('before insert or update of timezone');
    expect(migration).toContain('execute function app_private.enforce_sport_competition_timezone()');
  });

  it('checks existing competition data before enabling the trigger', () => {
    expect(migration).toContain('existing sport competition has an invalid iana time zone');
  });
});
