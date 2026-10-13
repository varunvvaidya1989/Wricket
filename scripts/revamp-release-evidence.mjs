import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sourceFingerprint, releaseCases, additionalGates } from './revamp-release-gate.mjs';

// Record local evidence without promoting partial platform coverage to release approval.
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = [];
for (const path of [
  '.e2e/phases789-release-build.log', '.e2e/phases789-release-build-exit.txt', '.e2e/phases789-tournament-evidence.json',
  '.e2e/phases789-tournament-current-review.log', '.e2e/r7-preset-backend-evidence.json',
  '.e2e/r7-fixture-plan-transactions.log', '.e2e/r7-manual-transactions.log',
  '.e2e/r8-statistics-backend-evidence.json', '.e2e/r8-moments-chromium-evidence.json',
  '.e2e/r8-moments-firefox-evidence.json', '.e2e/r8-moments-webkit-evidence.json',
  '.e2e/r8-native-evidence.json', '.e2e/r8-native-final.log', '.e2e/r8-native-exit.txt', '.e2e/r9-large-schedule-evidence.json',
  '.e2e/r9-worker-upgrade-tests.log', '.e2e/r9-release-tests.log',
  '.e2e/r9-web-memory-tests.log', '.e2e/phases789-local-migration-ledger.log',
  '.e2e/r8-worker-final.log', '.e2e/phases789-hosted-migration-audit.log',
  'docs/revamp/UX-R0-R5-COMPLETION-REVIEW.md',
  'docs/revamp/UX-R6-REVIEW.md', 'docs/revamp/UX-R7-REVIEW.md',
  '.e2e/hosted/final-status.json', '.e2e/hosted/acceptance-evidence.json',
  '.e2e/hosted/migration-history-after.log', '.e2e/hosted/hosted-postconditions.log',
  '.e2e/hosted/build-check.log', '.e2e/hosted/build-check-exit.txt',
  '.e2e/signed-release/binaries.json', '.e2e/signed-release/production-source.json',
  '.e2e/signed-release/recovery-source.json', '.e2e/signed-release/upgrade-8-to-9.json',
  '.e2e/signed-release/upgrade-9-to-10.json', '.e2e/signed-release/reconnect9-evidence.json',
  '.e2e/signed-release/recovery10-evidence.json', '.e2e/signed-release/build-check-exit.txt',
  '.e2e/web-release/deployment.json', '.e2e/web-release/preview-verification.json',
  '.e2e/web-release/production-verification.json', 'docs/revamp/SIGNED-ANDROID-REHEARSAL.md',
]) {
  try {
    const bytes = await readFile(resolve(root, path));
    artifacts.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const reasons = {
  'hosted-migrations': 'Read-only hosted migration audit returned 403; local migrations do not establish hosted rollout.',
  'cloud-mvp-worker': 'Worker and lease/correction acceptance pass locally; a hosted worker and production monitoring have not been deployed.',
  'physical-device-accessibility': 'Android emulator large-text checks are supplementary; physical TalkBack/VoiceOver and iOS acceptance are unavailable.',
  'physical-device-performance': 'Local automation and 2016-fixture measurements are supplementary; reference-device budgets and physical 30-minute soak remain unverified.',
  'previous-build-upgrade': 'Previous committed SQLite schema upgrade passes; signed Android evidence is checked below. Physical/Play-installed upgrade remains open.',
  'signed-release-artifact': 'Signed Android evidence is checked below; iOS was excluded from the current user-requested release scope. Broad release acceptance remains open.',
  'organiser-scorer-pilot': 'Automated separate-client tournament completes; real organiser/scorer pilot sign-off remains unverified.',
  'rollback-rehearsal': 'Pinned UI version and recovery flag tests pass; an installed production candidate rollback remains unverified.',
};
const recordedAt = new Date().toISOString();
const currentFingerprint = await sourceFingerprint(root);
let hosted;
try { hosted = JSON.parse(await readFile(resolve(root, '.e2e/hosted/final-status.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const currentHosted = hosted?.sourceFingerprint === currentFingerprint
  && hosted?.projectRef === 'lzgnuqwvsioinwwrsdvn' && hosted?.verifiedBy && hosted?.recordedAt;
if (currentHosted && hosted.migrationAuditPassed) reasons['hosted-migrations'] =
  `${hosted.migrationCount} hosted migration versions match the repository; hosted permission/privacy postconditions pass.`;
if (currentHosted && hosted.workerAcceptancePassed) reasons['cloud-mvp-worker'] =
  `Scheduled Supabase Edge worker and independent viewer completion/correction acceptance pass. ${hosted.dataIssues} historical data issue(s) remain; monitor flags incomplete rules. External notification routing is not configured.`;
let signed;
try {
  const upgrade = JSON.parse(await readFile(resolve(root, '.e2e/signed-release/reconnect9-evidence.json'), 'utf8'));
  const recovery = JSON.parse(await readFile(resolve(root, '.e2e/signed-release/recovery10-evidence.json'), 'utf8'));
  const identities = JSON.parse(await readFile(resolve(root, '.e2e/signed-release/binaries.json'), 'utf8'));
  signed = upgrade.passed && recovery.passed && identities.map(item => item.versionCode).join(',') === '8,9,10';
} catch (error) { if (error.code !== 'ENOENT') throw error; }
if (signed) {
  reasons['previous-build-upgrade'] = 'Actual signed Android 8 -> 9 -> 10 emulator upgrades retain prompts, queues and history; reconnect applies client IDs once. Prior team-cache initialization and first connected authorization are documented. Physical/Play-installed upgrade remains open.';
  reasons['signed-release-artifact'] = 'EAS production Android code 9 and recovery code 10 are signed with the existing certificate, downloaded and installed. Build-submission fingerprints and APK/AAB hashes are recorded; later test-helper changes are outside those binaries. iOS excluded by user; full-platform gate remains partial.';
  reasons['rollback-rehearsal'] = 'Higher-version signed Android recovery retains active revamp UI and offline prompt/queue; new sessions use larger recovery keys, score and cold-resume offline. Independent Realtime viewer and repeat reconnect pass on Android 14 emulator; physical rollout remains open.';
}
const casePaths = {
  E19: ['r7-manual-transactions', 'phases789-tournament', 'UX-R6-REVIEW'],
  E20: ['r7-fixture-plan', 'r7-preset-backend', 'UX-R6-REVIEW'],
  E21: ['r7-manual-transactions', 'phases789-release-build', 'UX-R6-REVIEW'],
  E22: ['r7-preset-backend', 'r7-manual-transactions', 'UX-R6-REVIEW'],
  E26: ['r8-statistics-backend', 'r8-native', 'phases789-tournament', 'UX-R7-REVIEW'],
  E27: ['r8-moments-', 'r8-native', 'UX-R7-REVIEW'],
  E28: ['phases789-tournament', 'UX-R6-REVIEW'],
  E29: ['r9-worker-upgrade', 'r9-release-tests', 'phases789-release-build'],
  E30: ['r9-large-schedule', 'r8-native', 'r8-moments-', 'r9-web-memory'],
};
const platforms = {
  E19: ['chromium'], E20: ['chromium'], E21: ['chromium'], E22: ['chromium'],
  E26: ['chromium', 'android'], E27: ['chromium', 'firefox', 'webkit', 'android'],
  E28: ['chromium'], E29: [], E30: ['chromium', 'firefox', 'webkit', 'android'],
};
const checks = releaseCases.map(id => ({
  id, status: ['E08', 'E09'].includes(id) ? 'PAUSED' : 'PARTIAL',
  reason: ['E08', 'E09'].includes(id)
    ? 'Native gesture verification remains paused at the user instruction.'
    : 'Local evidence is documented in UX-R6/R7/R8 reviews; the complete supported-platform and physical-device case matrix is not verified.',
  verifiedBy: 'Codex local acceptance', recordedAt,
  // Listed platforms have supplementary coverage, not a full case pass.
  platforms: platforms[id] ?? [],
  artifacts: artifacts.filter(artifact => (casePaths[id] ?? ['UX-R0-R5-COMPLETION']).some(fragment => artifact.path.includes(fragment))),
})).concat(additionalGates.map(id => {
  let status = 'BLOCKED';
  if (currentHosted && id === 'hosted-migrations' && hosted.migrationAuditPassed) status = 'PASS';
  if (currentHosted && id === 'cloud-mvp-worker' && hosted.workerAcceptancePassed) status = hosted.workerHealthy ? 'PASS' : 'PARTIAL';
  if (signed && ['previous-build-upgrade', 'signed-release-artifact', 'rollback-rehearsal'].includes(id)) status = 'PARTIAL';
  return { id, status, reason: reasons[id], recordedAt, artifacts,
    ...(status === 'PASS' ? { verifiedBy: hosted.verifiedBy } : {}) };
}));
const report = {
  recordedAt,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceFingerprint: currentFingerprint,
  environment: 'Windows development workspace; isolated wricket-e2e Supabase; hosted Wricket schema/Edge/Cron backend acceptance; local browsers and dedicated Android emulator. Uncommitted source fingerprint identifies the tested working tree.',
  checks,
};
await mkdir(resolve(root, '.e2e/release'), { recursive: true });
await writeFile(resolve(root, '.e2e/release/evidence.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Recorded ${checks.length} release checks and ${artifacts.length} local artifacts; release approval remains blocked.`);
