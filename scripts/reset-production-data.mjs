#!/usr/bin/env node

// Wipes all production data except one retained account (and the reference
// tables seeded by migrations). Always run with --dry-run first.
//
//   SPORTSTAGE_SUPABASE_URL=... SPORTSTAGE_SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/reset-production-data.mjs --production --keep-email you@example.com --dry-run

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const EXPECTED_PROJECT_REF = 'lzgnuqwvsioinwwrsdvn';
const RESET_CONFIRMATION = 'WIPE_PRODUCTION_EXCEPT_KEEP_ACCOUNT';
const BUCKETS = ['match-moments', 'profile-media', 'sponsor-logos', 'tournament-media'];
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = join(scriptDirectory, '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const keepEmail = option('--keep-email')?.toLowerCase();
const keepIdOption = option('--keep-id');

if (!argv.includes('--production')) fail('Refusing to access the linked database without --production.');
if (!keepEmail && !keepIdOption) fail('Pass --keep-email <email> or --keep-id <uuid> for the account to retain.');
if (!dryRun && option('--confirm') !== RESET_CONFIRMATION) {
  fail(`A real reset requires --confirm ${RESET_CONFIRMATION}. Run with --dry-run first.`);
}

const projectRefPath = join(projectDirectory, 'supabase', '.temp', 'project-ref');
if (!existsSync(projectRefPath)) fail('The Supabase project is not linked.');
const projectRef = readFileSync(projectRefPath, 'utf8').trim();
if (projectRef !== EXPECTED_PROJECT_REF) {
  fail(`Refusing to run against project ${projectRef || '(unknown)'}; expected ${EXPECTED_PROJECT_REF}.`);
}

const url = process.env.SPORTSTAGE_SUPABASE_URL;
const serviceKey = process.env.SPORTSTAGE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) fail('SPORTSTAGE_SUPABASE_URL and SPORTSTAGE_SUPABASE_SERVICE_ROLE_KEY are required.');
if (!url.includes(EXPECTED_PROJECT_REF)) fail(`SPORTSTAGE_SUPABASE_URL does not point at ${EXPECTED_PROJECT_REF}.`);

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const keepUser = await findKeepUser();
const totalUsers = await countUsers();
console.log(`Retaining ${keepUser.email ?? '(no email)'} (${keepUser.id}); ${totalUsers - 1} other accounts will be deleted.`);

const storageTargets = await collectStorageTargets(keepUser.id);
for (const [bucket, paths] of storageTargets) console.log(`Storage ${bucket}: ${paths.length} files to delete`);

if (!dryRun) {
  for (const [bucket, paths] of storageTargets) {
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await db.storage.from(bucket).remove(paths.slice(index, index + 100));
      if (error) fail(`Delete files from ${bucket}: ${error.message}`);
    }
  }
}

const source = readFileSync(join(scriptDirectory, 'reset-production-data.sql'), 'utf8');
if (!/commit;\s*$/i.test(source)) fail('Reset SQL must end with COMMIT.');
let sql = source
  .replaceAll('__KEEP_ACCOUNT_ID__', keepUser.id)
  .replaceAll('__ENFORCE_EMPTY_STORAGE__', dryRun ? 'false' : 'true');
if (dryRun) sql = sql.replace(/commit;\s*$/i, 'rollback;\n');

const sqlFile = join(tmpdir(), `sportstage-production-reset-${process.pid}.sql`);
writeFileSync(sqlFile, sql, { flag: 'wx' });
const supabaseCli = join(projectDirectory, 'node_modules', 'supabase', 'dist', 'supabase.js');
if (!existsSync(supabaseCli)) fail('Install dependencies before running the production reset.');
const result = spawnSync(process.execPath, [
  supabaseCli, 'db', 'query', '--linked', '--file', sqlFile, '--output', 'json',
], { cwd: projectDirectory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
rmSync(sqlFile, { force: true });

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) fail(result.error.message);
console.log(dryRun ? 'Dry run complete: database changes were rolled back and no files were deleted.' : 'Production reset complete.');
process.exit(result.status ?? 1);

async function findKeepUser() {
  if (keepIdOption) {
    const { data, error } = await db.auth.admin.getUserById(keepIdOption);
    if (error || !data.user) fail(`Account ${keepIdOption} was not found.`);
    if (keepEmail && data.user.email?.toLowerCase() !== keepEmail) fail('--keep-id and --keep-email refer to different accounts.');
    return data.user;
  }
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(error.message);
    const user = data.users.find(item => item.email?.toLowerCase() === keepEmail);
    if (user) return user;
    if (data.users.length < 1000) fail(`${keepEmail} does not exist in SportStage Auth.`);
  }
}

async function countUsers() {
  let total = 0;
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(error.message);
    total += data.users.length;
    if (data.users.length < 1000) return total;
  }
}

async function collectStorageTargets(keepAccountId) {
  const targets = new Map();
  for (const bucket of BUCKETS) {
    const paths = await listFiles(bucket, '');
    targets.set(bucket, bucket === 'profile-media'
      ? paths.filter(path => path.split('/')[0] !== keepAccountId)
      : paths);
  }
  return targets;
}

async function listFiles(bucket, prefix) {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) fail(`List ${bucket}/${prefix}: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // Folders are returned without an id.
      if (item.id) files.push(path);
      else files.push(...await listFiles(bucket, path));
    }
    if (data.length < 1000) return files;
  }
}

function option(name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
