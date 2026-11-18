import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createClient } from '@supabase/supabase-js';

// Offline compatibility experiment. No Firebase/Supabase connection, SMS, secrets,
// project creation, migration or application auth changes.
const root = fileURLToPath(new URL('../', import.meta.url));
const schema = await readFile(resolve(root, 'supabase/migrations/20260710105737_initial_cloud_schema.sql'), 'utf8');
const profileDefinition = schema.match(/create table public\.profiles \([\s\S]*?\n\);/)?.[0];
assert.ok(profileDefinition, 'Expected the current profile identity definition');
const db = new PGlite();
const findings = [];
const accountId = '00000000-0000-4000-8000-000000000001';

async function expectsSqlError(id, query, params, expectedCode, detail) {
  let observed;
  try { await db.query(query, params); }
  catch (error) { observed = error.code; }
  assert.equal(observed, expectedCode, id);
  findings.push({ id, result: 'REPRODUCED', postgresCode: observed, detail });
}

try {
  await db.exec(`create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;`);
  // Actual repository table definition; auth.uid is the UUID helper used by the
  // repository's existing migration test harness, not a fetched hosted function.
  await db.exec(profileDefinition);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", ['firebase_demo_non_uuid_subject']);
  await expectsSqlError('firebase-subject-versus-uuid-helper', 'select auth.uid()', [], '22P02',
    'A non-UUID Firebase subject cannot be used by the existing UUID auth.uid contract.');
  await expectsSqlError('uuid-without-supabase-auth-user',
    "insert into public.profiles(id, display_name) values ($1, 'Demo player')", [accountId], '23503',
    'Even a UUID-shaped Firebase subject needs a matching Supabase Auth row under the existing profile foreign key.');
  await db.query('insert into auth.users(id) values ($1)', [accountId]);
  await db.query("insert into public.profiles(id, display_name) values ($1, 'Existing player')", [accountId]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [accountId]);
  const baseline = await db.query('select id from public.profiles where id = auth.uid()');
  assert.equal(baseline.rows[0]?.id, accountId);
  findings.push({ id: 'existing-supabase-identity-baseline', result: 'PASS', detail: 'The existing UUID account contract succeeds in the same fixture.' });

  const external = createClient('https://example.invalid', 'not-a-real-key', {
    accessToken: async () => null,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  assert.throws(() => external.auth.getSession(), /accessToken.*accessing supabase\.auth\.getSession.*not possible/);
  findings.push({ id: 'external-token-client-auth-api', result: 'REPRODUCED',
    detail: 'The installed Supabase SDK disables its auth API on an accessToken client; AuthProvider needs a separate design.' });

  const report = {
    recordedAt: new Date().toISOString(),
    status: 'INTEGRATION_CHANGES_REQUIRED',
    scope: 'Offline PGlite reproduction of repository identity constraints and installed SDK behavior. Not a live Firebase, SMS, hosted RLS, Android or web acceptance test.',
    findings,
    nextGate: 'Create/configure the Firebase project, choose and implement the canonical identity/session strategy, then run test-number acceptance before paid SMS.',
  };
  const output = resolve(root, '.e2e/firebase-auth/feasibility.json');
  await mkdir(resolve(root, '.e2e/firebase-auth'), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(report.status);
  for (const finding of findings) console.log(`${finding.result}: ${finding.id} — ${finding.detail}`);
  console.log('Evidence: .e2e/firebase-auth/feasibility.json');
} finally {
  await db.close();
}
