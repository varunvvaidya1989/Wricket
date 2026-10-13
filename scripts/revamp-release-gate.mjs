import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const releaseCases = Array.from({ length: 30 }, (_, index) => `E${String(index + 1).padStart(2, '0')}`);
export const releasePlatforms = ['chromium', 'firefox', 'webkit', 'android', 'ios'];
export const additionalGates = ['hosted-migrations', 'cloud-mvp-worker', 'physical-device-accessibility', 'physical-device-performance', 'previous-build-upgrade', 'signed-release-artifact', 'organiser-scorer-pilot', 'rollback-rehearsal'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function sourceFingerprint(root) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean).filter(path => /\.(tsx?|mjs|js|sql|json|toml|yml|yaml)$/.test(path) && !path.startsWith('docs/')).sort();
  const hash = createHash('sha256');
  for (const path of files) {
    try { hash.update(path); hash.update(await readFile(resolve(root, path))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return hash.digest('hex');
}

export async function auditReleaseEvidence(report, root, currentFingerprint) {
  const issues = [];
  if (report.sourceFingerprint !== currentFingerprint) issues.push('Evidence does not match the current source fingerprint.');
  if (!report.commit || !report.environment || !report.recordedAt) issues.push('Build revision, environment and evidence date are required.');
  const checks = report.checks ?? [];
  const keys = checks.map(check => check.id);
  if (new Set(keys).size !== keys.length) issues.push('Evidence contains duplicate check IDs.');
  for (const id of [...releaseCases, ...additionalGates]) {
    const check = checks.find(item => item.id === id);
    if (!check || check.status !== 'PASS') issues.push(`${id}: ${check?.status ?? 'MISSING'}${check?.reason ? ` - ${check.reason}` : ''}`);
    if (!check) continue;
    if (check.status === 'PASS' && (!check.verifiedBy || !check.recordedAt || !check.artifacts?.length)) issues.push(`${id}: passing evidence needs verifier, date and artifacts.`);
    if (check.status === 'PASS' && releaseCases.includes(id)) {
      for (const platform of releasePlatforms) if (!check.platforms?.includes(platform)) issues.push(`${id}: ${platform} evidence is missing.`);
    }
    for (const artifact of check.artifacts ?? []) {
      const path = resolve(root, artifact.path ?? '');
      if (/\.env(?:\.|$)|fixture\.json|storage-state|private[\\/]/i.test(artifact.path ?? '')) { issues.push(`${id}: private configuration/session files are not release evidence.`); continue; }
      try {
        const actual = digest(await readFile(path));
        if (actual !== artifact.sha256) issues.push(`${id}: artifact hash changed: ${artifact.path}`);
      } catch { issues.push(`${id}: artifact unavailable: ${artifact.path}`); }
    }
  }
  return { status: issues.length ? 'BLOCKED' : 'PASS', issues };
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = process.argv.slice(2);
  const input = args[args.indexOf('--evidence') + 1];
  if (!args.includes('--evidence') || !input) throw new Error('Use --evidence <report.json>. See docs/revamp/UX-R8-RELEASE.md.');
  const report = JSON.parse(await readFile(resolve(root, input), 'utf8'));
  const result = await auditReleaseEvidence(report, root, await sourceFingerprint(root));
  const output = args.includes('--output') ? args[args.indexOf('--output') + 1] : '.e2e/release/gate.json';
  const destination = resolve(root, output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify({ auditedAt: new Date().toISOString(), ...result }, null, 2) + '\n');
  console.log(`Wricket release gate: ${result.status}`);
  for (const issue of result.issues) console.log(issue);
  process.exitCode = result.status === 'PASS' ? 0 : 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
