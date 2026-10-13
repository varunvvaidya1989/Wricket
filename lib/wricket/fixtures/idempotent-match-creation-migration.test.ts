import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260927064528_add_idempotent_cricket_match_creation.sql'),
  'utf8',
);

describe('idempotent cricket match creation migration', () => {
  it('serializes retries by account and stable request ID', () => {
    expect(migration).toContain('matches_creator_setup_request_uidx');
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(migration).toContain('setup_request_fingerprint is distinct from request_fingerprint');
  });

  it('keeps privileged logic private with a pinned search path', () => {
    expect(migration).toContain('function app_private.create_owned_match_idempotent(');
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain('function public.create_owned_match_idempotent(');
    expect(migration).toContain('grant execute on function public.create_owned_match_idempotent');
  });
});
