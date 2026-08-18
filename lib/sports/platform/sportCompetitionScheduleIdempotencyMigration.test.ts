import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818131000_harden_schedule_idempotency.sql',
), 'utf8').toLowerCase();

describe('schedule idempotency hardening', () => {
  it('binds every new key to the normalized fixture request', () => {
    expect(migration).toContain('idempotency_fingerprint');
    expect(migration).toContain('request_fingerprint := md5');
    expect(migration).toContain('idempotency key was already used for a different fixture request');
  });

  it('locks reordering outside mutable schedule lifecycles', () => {
    expect(migration).toContain('fixtures cannot be reordered in the current lifecycle');
  });
});
