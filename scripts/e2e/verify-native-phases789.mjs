import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { manifestPath } from './backend-fixture.mjs';
import { adb, nativePackage, nodes, tap, tapNode, type, hideKeyboard, open, openAuth, scrollTo, screenshot, waitFor, waitForMetro } from './native-driver.mjs';

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const journey = JSON.parse(await readFile('.e2e/phases789-tournament-journey.json', 'utf8'));
assert.ok(journey.complete, 'Review only an actually completed tournament');
const account = fixture.accounts[0];
const scale = adb('shell', 'settings', 'get', 'system', 'font_scale').trim();
const press = async label => tapNode(await scrollTo(label));
try {
  await waitForMetro();
  adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3');
  // Reset only the dedicated acceptance app; preserve other emulator apps.
  adb('shell', 'am', 'force-stop', nativePackage); adb('shell', 'pm', 'clear', nativePackage);
  adb('shell', 'run-as', nativePackage, 'mkdir', '-p', 'shared_prefs');
  adb('shell', 'run-as', nativePackage, 'cp', '/data/local/tmp/wricket-e2e-prefs.xml', 'shared_prefs/' + nativePackage + '_preferences.xml');
  adb('reverse', 'tcp:4173', 'tcp:4173'); adb('reverse', 'tcp:54321', 'tcp:54321');
  adb('shell', 'am', 'start', '-n', nativePackage + '/.MainActivity'); await waitFor('SPORTSTAGE NOW');
  openAuth('/wricket'); await tap('Sign in with password');
  tapNode(nodes().find(node => node.class === 'android.widget.EditText' && node.password !== 'true')); type(account.email);
  tapNode(nodes().find(node => node.class === 'android.widget.EditText' && node.password === 'true')); type(fixture.password); hideKeyboard();
  await tap('Sign in'); await waitFor('My cricket');
  open('/wricket/tournament/' + journey.tournamentId + '?tab=stats');
  await tap('Celebrate');
  await waitFor('MVP leaderboard');
  await press('Fielding leaderboard'); await waitFor('No fielding actions recorded yet');
  await press('MVP leaderboard'); await scrollTo('Tournament MVP.'); screenshot('native-r8-leaderboard-130.png');
  await press('View ' + account.name + ' performance'); await waitFor('Performance period Last year');
  await tap('Performance period Last year'); await waitFor('No completed matches in this period'); screenshot('native-r8-period-empty-130.png');
  await press('View all-time performance'); await scrollTo('MATCH HISTORY'); screenshot('native-r8-performance-130.png');
  open('/wricket/tournament/' + journey.tournamentId);
  await press('About'); await press('Match moments'); await scrollTo('Moment caption'); screenshot('native-r8-moments-130.png');
  await writeFile('.e2e/r8-native-evidence.json', JSON.stringify({ recordedAt: new Date().toISOString(), environment: 'Dedicated Wricket_E2E Android emulator', os: adb('shell', 'getprop', 'ro.build.version.release').trim(), fontScale: 1.3, passed: true, cases: ['real tournament leaderboard', 'discipline empty state', 'performance periods/history', 'Moments navigation/composer'], excluded: ['gesture verification remains paused', 'physical touch/haptics', 'TalkBack manual acceptance', 'iOS'] }, null, 2));
  console.info('PASS Android actual completed leaderboard, period/history and Moments routes at 1.3 font scale');
} finally {
  adb('shell', 'am', 'force-stop', nativePackage);
  if (/^\d+(?:\.\d+)?$/.test(scale)) adb('shell', 'settings', 'put', 'system', 'font_scale', scale);
}
