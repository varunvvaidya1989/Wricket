import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260822121632_prevent_cricket_fixture_status_trigger_recursion.sql',
), 'utf8');

describe('cricket fixture status projection migration', () => {
  it('guards both directions of status synchronization against recursive updates', () => {
    expect(migration).toContain('create or replace function app_private.sync_fixture_status_to_match()');
    expect(migration).toContain('create or replace function app_private.sync_match_status_to_fixture()');
    expect(migration.match(/old\.status is not distinct from new\.status/g)).toHaveLength(2);
    expect(migration.match(/and status is distinct from case new\.status/g)).toHaveLength(2);
  });
});
