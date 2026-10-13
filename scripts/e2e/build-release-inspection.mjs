import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

// Separate, same-certificate instrumentation inspects SQLite without enabling
// debugging, changing the release binary, or exporting authentication storage.
const output = resolve('.e2e/signed-release/inspection');
const privatePath = resolve('.e2e/signed-release/private');
const sdk = process.env.ANDROID_HOME;
if (!sdk) throw new Error('ANDROID_HOME is required');
const tools = join(sdk, 'build-tools/36.0.0');
const androidJar = join(sdk, 'platforms/android-34/android.jar');
const signing = JSON.parse(await readFile(join(privatePath, 'signing.json'), 'utf8'));
await mkdir(join(output, 'classes'), { recursive: true });
await mkdir(join(output, 'dex'), { recursive: true });
const run = (command, args) => execFileSync(command, args, { stdio: 'pipe', timeout: 120000 });
run('javac', ['-source', '8', '-target', '8', '-cp', androidJar, '-d', join(output, 'classes'),
  'e2e/release/android/ScoringSnapshot.java', 'e2e/release/android/UiTree.java', 'e2e/release/android/TeamFixture.java']);
run('jar', ['cf', join(output, 'classes.jar'), '-C', join(output, 'classes'), '.']);
run('java', ['-cp', join(tools, 'lib/d8.jar'), 'com.android.tools.r8.D8', '--lib', androidJar,
  '--min-api', '24', '--output', join(output, 'dex'), join(output, 'classes.jar')]);
run(join(tools, 'aapt2.exe'), ['link', '--manifest', 'e2e/release/android/AndroidManifest.xml', '-I', androidJar, '-o', join(output, 'unsigned.apk')]);
run('jar', ['uf', join(output, 'unsigned.apk'), '-C', join(output, 'dex'), 'classes.dex']);
run(join(tools, 'zipalign.exe'), ['-f', '4', join(output, 'unsigned.apk'), join(output, 'aligned.apk')]);
run('java', ['-jar', join(tools, 'lib/apksigner.jar'), 'sign', '--ks', join(privatePath, 'existing-release.jks'),
  '--ks-key-alias', signing.keyAlias, '--ks-pass', 'file:' + join(privatePath, 'store-password.txt'),
  '--key-pass', 'file:' + join(privatePath, 'key-password.txt'), '--out', join(output, 'inspection.apk'), join(output, 'aligned.apk')]);
const certificate = run('java', ['-jar', join(tools, 'lib/apksigner.jar'), 'verify', '--print-certs', join(output, 'inspection.apk')]).toString();
const sha256 = certificate.match(/certificate SHA-256 digest: ([0-9a-f]+)/)?.[1];
if (sha256 !== signing.certificateSha256.toLowerCase().replace(/:/g, '')) throw new Error('Inspection signing certificate mismatch');
await writeFile(resolve('.e2e/signed-release/inspection-artifact.json'), JSON.stringify({
  recordedAt: new Date().toISOString(), package: 'com.vcreativestudio.sportstage.releaseinspection',
  target: 'com.vcreativestudio.sportstage', scoringInspectionReadOnly: true,
  fixtureInitializer: 'two scoped test teams only', certificateSha256: sha256,
  sha256: createHash('sha256').update(await readFile(join(output, 'inspection.apk'))).digest('hex'),
}, null, 2));
console.info('Built separate read-only scoring inspection APK with the existing release certificate.');
