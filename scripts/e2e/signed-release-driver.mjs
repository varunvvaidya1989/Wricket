import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { adb, tapNode, type, hideKeyboard } from './native-driver.mjs';

export { adb, tapNode, type, hideKeyboard };
export const releasePackage = 'com.vcreativestudio.sportstage';
export const serial = 'emulator-5556';
export const evidenceDirectory = resolve('.e2e/signed-release');
export function nodes() {
  const result = adb('shell', 'am', 'instrument', '-w',
    'com.vcreativestudio.sportstage.releaseinspection/com.vcreativestudio.sportstage.releaseinspection.UiTree');
  const raw = result.match(/^INSTRUMENTATION_RESULT: nodes=(.+)$/m)?.[1];
  if (!raw) throw new Error('Signed release UI inspection failed');
  return JSON.parse(raw);
}
export async function waitFor(label, timeout = 90000) {
  console.info('WAIT signed release: ' + label);
  let result;
  await until(() => {
    const tree = nodes();
    const dismiss = tree.find(node => node.text === 'DISMISS' || node.text === 'Dismiss');
    if (dismiss) { tapNode(dismiss); return false; }
    result = tree.find(node => node.text === label || node['content-desc'] === label);
    return Boolean(result);
  }, label, timeout);
  return result;
}
export async function tap(label) { tapNode(await waitFor(label)); }
export async function scrollTo(label) {
  for (let i=0; i<8; i++) {
    const found = nodes().find(node => node.text === label || node['content-desc'] === label);
    if (found) return found;
    adb('shell', 'input', 'swipe', '540', '1500', '540', '650', '350');
  }
  throw new Error('Signed release scroll target missing: ' + label);
}
export function assertRehearsalDevice() {
  assert.ok(adb('emu', 'avd', 'name').startsWith('Wricket_E2E'), 'Only the dedicated acceptance emulator may be modified');
}
export function openRelease(route) {
  assert.ok(/^\/(wricket(?:\/|$)|auth\?returnTo=)/.test(route) && /^[\w\/%?=&.-]+$/.test(route), 'Unexpected release route');
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'sportstage://' + route, '-p', releasePackage);
}
export function capture(name) {
  assert.match(name, /^[\w-]+\.png$/);
  writeFileSync(join(evidenceDirectory, name), execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 30000, maxBuffer: 15 * 1024 * 1024 }));
}
export async function until(check, description, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  capture('failed.png'); throw new Error('Signed release timed out: ' + description);
}
export function stoppedSnapshot(matchId) {
  assert.match(matchId, /^[0-9a-f-]{36}$/i);
  adb('shell', 'am', 'force-stop', releasePackage);
  const result = adb('shell', 'am', 'instrument', '-w', '-e', 'matchId', matchId,
    'com.vcreativestudio.sportstage.releaseinspection/com.vcreativestudio.sportstage.releaseinspection.ScoringSnapshot');
  const raw = result.match(/^INSTRUMENTATION_RESULT: snapshot=(.+)$/m)?.[1];
  if (!raw || !result.includes('INSTRUMENTATION_CODE: -1')) throw new Error('Read-only signed scoring inspection failed: ' + result);
  return JSON.parse(raw);
}
export function artifactIdentity(path) {
  const tools = join(process.env.ANDROID_HOME ?? '', 'build-tools/36.0.0');
  const certificate = execFileSync('java', ['-jar', join(tools, 'lib/apksigner.jar'), 'verify', '--print-certs', path], { encoding: 'utf8', timeout: 60000 });
  const manifest = execFileSync(join(tools, 'aapt2.exe'), ['dump', 'badging', path], { encoding: 'utf8', timeout: 60000 });
  const info = manifest.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
  if (!info || info[1] !== releasePackage || manifest.includes('application-debuggable')) throw new Error('Artifact must be the non-debuggable production app');
  return { package: info[1], versionCode: Number(info[2]), versionName: info[3],
    certificateSha256: certificate.match(/certificate SHA-256 digest: ([0-9a-f]+)/)?.[1] };
}
export function installedIdentity() {
  const state = adb('shell', 'dumpsys', 'package', releasePackage);
  const versionCode = Number(state.match(/versionCode=(\d+)/)?.[1]);
  const firstInstallTime = state.match(/firstInstallTime=([^\r\n]+)/)?.[1].trim();
  const userId = state.match(/(?:userId|appId)=(\d+)/)?.[1];
  if (!versionCode || !firstInstallTime || !userId || state.includes('DEBUGGABLE')) throw new Error('Existing signed release is required');
  return { versionCode, firstInstallTime, userId };
}
export function installUpgrade(previousPath, candidatePath) {
  assertRehearsalDevice();
  const previous = artifactIdentity(previousPath); const candidate = artifactIdentity(candidatePath);
  assert.equal(candidate.certificateSha256, previous.certificateSha256, 'Upgrade certificate must match');
  assert.ok(candidate.versionCode > previous.versionCode, 'Recovery uses a higher-version release');
  const before = installedIdentity(); assert.equal(before.versionCode, previous.versionCode);
  // No uninstall, downgrade, data clear or debug installation flags.
  const output = adb('install', '-r', candidatePath); assert.ok(output.includes('Success'));
  const after = installedIdentity(); assert.equal(after.versionCode, candidate.versionCode);
  assert.equal(after.firstInstallTime, before.firstInstallTime); assert.equal(after.userId, before.userId);
  return { before, after, previous, candidate, installCommand: 'adb install -r', dataCleared: false };
}
export function scoringDigest(snapshot) {
  return createHash('sha256').update(JSON.stringify({ match: snapshot.match, innings: snapshot.innings,
    balls: snapshot.balls, outbox: snapshot.outbox })).digest('hex');
}
