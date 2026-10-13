import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
const expectedRef = 'lzgnuqwvsioinwwrsdvn';

export function verifyTarget(linkedRef, projects) {
  if (linkedRef !== expectedRef) throw new Error('The linked project does not match Wricket. No hosted command was run.');
  if (!projects.some(project => project.id === expectedRef || project.ref === expectedRef)) {
    throw new Error('The current Supabase login cannot see Wricket. Authenticate an authorised account/token scope.');
  }
}

async function cli(args) {
  const result = await execute(process.execPath, ['node_modules/supabase/dist/supabase.js', ...args], {
    cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  });
  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

export async function preflight({ run = cli, output = '.e2e/hosted/preflight.json' } = {}) {
  const report = { at: new Date().toISOString(), projectRef: expectedRef, status: 'BLOCKED',
    mutationPerformed: false, migrations: [], checks: [], reason: null };
  try {
    const linked = (await readFile(resolve(root, 'supabase/.temp/project-ref'), 'utf8')).trim();
    // A wrong link fails before even reading remote project settings.
    if (linked !== expectedRef) verifyTarget(linked, []);
    if (!process.env.SUPABASE_DB_PASSWORD) {
      const projects = JSON.parse(await run(['projects', 'list', '--output', 'json']));
      verifyTarget(linked, projects);
      report.checks.push('authorised_project_visible');
    } else {
      // Explicit database credentials can connect independently of Management API scopes.
      report.checks.push('explicit_database_password_supplied');
    }
    const directory = resolve(root, 'supabase/migrations');
    for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
      const bytes = await readFile(resolve(directory, name));
      report.migrations.push({ name, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    const history = await run(['migration', 'list', '--linked']);
    const preview = await run(['db', 'push', '--linked', '--dry-run']);
    const destination = resolve(root, output);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(resolve(dirname(destination), 'migration-history.log'), history);
    await writeFile(resolve(dirname(destination), 'migration-preview.log'), preview);
    report.checks.push('hosted_history_read', 'pending_migrations_previewed');
    // Review the actual schema and older drift before applying anything.
    report.status = 'REVIEW_REQUIRED';
    report.reason = 'Hosted ledger and dry run are captured. Compare schema and older history drift before applying pending migrations.';
  } catch (cause) {
    // Do not write connection details or child-process errors into a public report.
    report.reason = cause.message.startsWith('The current Supabase login') || cause.message.startsWith('The linked project')
      ? cause.message : 'Hosted preflight failed. Check authorised project access, database credentials and migration history.';
  }
  const destination = resolve(root, output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await preflight();
  console.log(JSON.stringify({ projectRef: report.projectRef, status: report.status,
    mutationPerformed: report.mutationPerformed, checks: report.checks, reason: report.reason }));
  if (report.status === 'BLOCKED') process.exitCode = 2;
}
