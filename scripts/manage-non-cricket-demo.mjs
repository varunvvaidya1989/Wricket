#!/usr/bin/env node

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const EXPECTED_PROJECT_REF = 'lzgnuqwvsioinwwrsdvn';
const CLEAR_CONFIRMATION = 'DELETE_NON_CRICKET_DEMO_2026_V1';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = join(scriptDirectory, '..');
const action = process.argv[2];
const args = new Set(process.argv.slice(3));

if (!['seed', 'status', 'clear'].includes(action)) {
  fail('Usage: node scripts/manage-non-cricket-demo.mjs <seed|status|clear> --production [--confirm DELETE_NON_CRICKET_DEMO_2026_V1]');
}
if (!args.has('--production')) fail('Refusing to access the linked database without --production.');

const projectRefPath = join(projectDirectory, 'supabase', '.temp', 'project-ref');
if (!existsSync(projectRefPath)) fail('The Supabase project is not linked.');
const projectRef = readFileSync(projectRefPath, 'utf8').trim();
if (projectRef !== EXPECTED_PROJECT_REF) {
  fail(`Refusing to run against project ${projectRef || '(unknown)'}; expected ${EXPECTED_PROJECT_REF}.`);
}

if (action === 'clear') {
  const confirmationIndex = process.argv.indexOf('--confirm');
  const confirmation = confirmationIndex >= 0 ? process.argv[confirmationIndex + 1] : undefined;
  if (confirmation !== CLEAR_CONFIRMATION) {
    fail(`Cleanup requires --confirm ${CLEAR_CONFIRMATION}.`);
  }
}

const sourceSqlFile = join(scriptDirectory, `${action}-non-cricket-production-demo.sql`);
let sqlFile = sourceSqlFile;
let temporarySqlFile;
if (action === 'clear' && args.has('--dry-run')) {
  temporarySqlFile = join(tmpdir(), `sportstage-demo-clear-dry-run-${process.pid}.sql`);
  const source = readFileSync(sourceSqlFile, 'utf8');
  if (!/commit;\s*$/i.test(source)) fail('Cleanup SQL must end with COMMIT.');
  writeFileSync(temporarySqlFile, source.replace(/commit;\s*$/i, 'rollback;\n'), { flag: 'wx' });
  sqlFile = temporarySqlFile;
}
const supabaseCli = join(projectDirectory, 'node_modules', 'supabase', 'dist', 'supabase.js');
if (!existsSync(supabaseCli)) fail('Install dependencies before running the demo data manager.');
const result = spawnSync(process.execPath, [
  supabaseCli, 'db', 'query', '--linked', '--file', sqlFile, '--output', 'json',
], { cwd: projectDirectory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

if (temporarySqlFile) rmSync(temporarySqlFile, { force: true });

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) fail(result.error.message);
process.exit(result.status ?? 1);

function fail(message) {
  console.error(message);
  process.exit(1);
}
