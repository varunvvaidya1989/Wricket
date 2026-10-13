import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';
import { adb, nativePackage, nodes, tap, tapNode, type, hideKeyboard, open, openAuth, waitFor, waitForMetro, scrollTo, screenshot } from './native-driver.mjs';

// Run after verify-native-scoring-share, which establishes the isolated owner
// session. This never clears a production app or changes a personal emulator.
const freshSignIn = process.env.WRICKET_NATIVE_SETUP_SIGN_IN === '1';
if (!freshSignIn && process.env.WRICKET_NATIVE_EXISTING_OWNER_SESSION !== '1') throw new Error('Establish the isolated owner session or opt into E2E-only sign-in');
const fixture = JSON.parse(await readFile(manifestPath,'utf8')); const stack = await localClients(); const owner = fixture.accounts[0];
const originalScale = adb('shell','settings','get','system','font_scale').trim();
const venue = 'Native setup ' + Date.now(); let matchId;
const press = async label => { console.info('ACTION native setup: ' + label); tapNode(await scrollTo(label)); };
async function fill(label,value) {
  console.info('EDIT native setup: ' + label);
  await scrollTo(label); const field = nodes().find(node => node.class === 'android.widget.EditText' && (node['content-desc'] === label || node.text === label));
  assert.ok(field,'Native setup field: ' + label); tapNode(field); adb('shell','input','keyevent','123');
  for (let n = 0; n < 30; n++) adb('shell','input','keyevent','67');
  type(value); hideKeyboard();
}
try {
  await waitForMetro();
  if (nodes().some(node => node.text === 'Share match link' || node['content-desc'] === 'Share match link')) adb('shell','input','keyevent','4');
  adb('shell','am','force-stop',nativePackage);
  if (freshSignIn) {
    adb('shell','pm','clear',nativePackage);
    adb('shell','run-as',nativePackage,'mkdir','-p','shared_prefs');
    adb('shell','run-as',nativePackage,'cp','/data/local/tmp/wricket-e2e-prefs.xml','shared_prefs/' + nativePackage + '_preferences.xml');
    adb('reverse','tcp:4173','tcp:4173'); adb('reverse','tcp:54321','tcp:54321');
  }
  adb('shell','settings','put','system','font_scale','1.3');
  if (freshSignIn) {
    openAuth('/wricket'); await tap('Sign in with password');
    const email = nodes().find(node => node.class === 'android.widget.EditText' && node.password !== 'true');
    assert.ok(email); tapNode(email); type(owner.email);
    const password = nodes().find(node => node.class === 'android.widget.EditText' && node.password === 'true');
    assert.ok(password); tapNode(password); type(fixture.password); hideKeyboard(); await tap('Sign in'); await waitFor('My cricket');
  }
  open('/wricket/match/new');
  // Setup deliberately restores a prior draft. Return to its first step before
  // editing this run's independent match; do not clear the device database.
  for (let attempt = 0; attempt < 30; attempt++) {
    const window = nodes();
    if (window.some(node => node['content-desc'] === 'Choose players')) break;
    const back = window.find(node => node['content-desc'] === 'Back');
    if (back) tapNode(back);
    await new Promise(resolve => setTimeout(resolve,500));
  }
  await waitFor('Choose players');
  await press('TEAM A: ' + fixture.teams[0].name); await press('TEAM B: ' + fixture.teams[1].name);
  await press('Test'); await fill('Overs','1'); await fill('Players per side','3'); await fill('Ground or venue',venue);
  screenshot('native-setup-large-font.png'); await press('Choose players');
  await press('Continue to toss'); await press('On-field toss'); await press(fixture.teams[0].name);
  await press('Bat first'); screenshot('native-toss-large-font.png'); await press('Review match');
  await press('Start scoring'); await waitFor('Select openers'); screenshot('native-setup-openers.png');
  const matches = await checked(stack.admin.from('matches').select('id,format,rules,toss_choice,toss_winner_team_id,status').eq('created_by',owner.id).eq('venue',venue));
  assert.equal(matches.length,1); const match = matches[0]; matchId = match.id;
  assert.equal(match.format,'TURF_TEST'); assert.equal(match.rules.oversPerInnings,1); assert.equal(match.rules.inningsPerTeam,2); assert.equal(match.rules.playersPerSide,3);
  assert.equal(match.toss_choice,'BAT'); assert.equal(match.toss_winner_team_id,fixture.teams[0].id); assert.equal(match.status,'IN_PROGRESS');
  assert.equal((await checked(stack.admin.from('match_xis').select('player_id').eq('match_id',matchId))).length,6);
  console.info('PASS Android Test setup: eligible clubs/XIs, numeric/text keyboards, on-field toss, one canonical match, rules and reachable actions at 1.3 font scale');
} finally {
  adb('shell','am','force-stop',nativePackage);
  if (/^\d+(?:\.\d+)?$/.test(originalScale)) adb('shell','settings','put','system','font_scale',originalScale);
  // Scope cleanup by the unique venue too, including a failure after creation.
  await checked(stack.admin.from('matches').delete().eq('created_by',owner.id).eq('venue',venue));
}
