import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import initSqlJs from 'sql.js';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';
import { adb, nativePackage, nodes, tap, tapNode, type, hideKeyboard, open, openAuth, waitFor, waitForMetro, scrollTo, screenshot } from './native-driver.mjs';

const fixture = JSON.parse(await readFile(manifestPath,'utf8'));
const stack = await localClients(); const owner = fixture.accounts[0]; const client = stack.client();
const SQL = await initSqlJs(); let matchId; let gatewayStopped = false;
const gateway = 'supabase_kong_wricket-e2e';
function stopGateway() {
  const ports = execFileSync('docker',['inspect','--format','{{json .NetworkSettings.Ports}}',gateway],{ encoding: 'utf8',timeout: 30000 });
  assert.ok(ports.includes('54321'),'Only the isolated Wricket API gateway may be paused');
  execFileSync('docker',['stop','-t','1',gateway],{ timeout: 30000 }); gatewayStopped = true;
}
async function restoreGateway() {
  if (gatewayStopped) { execFileSync('docker',['start',gateway],{ timeout: 30000 }); gatewayStopped = false; }
  await poll(async () => { try { return (await fetch(fixture.backendURL + '/auth/v1/health',{ headers: { apikey: fixture.publishableKey },signal: AbortSignal.timeout(3000) })).ok; } catch { return false; } },'isolated API gateway recovery');
}
const originalScale = adb('shell','settings','get','system','font_scale').trim();
async function poll(check, description, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve,1000));
  }
  throw new Error('Native acceptance timed out: ' + description);
}
const cloudInnings = async () => (await checked(stack.admin.from('match_snapshots').select('scoreboard').eq('match_id',matchId).maybeSingle()))?.scoreboard ?? { total_runs: 0,legal_balls: 0 };
function localSnapshot() {
  const bytes = execFileSync('adb',['-s','emulator-5556','exec-out','run-as',nativePackage,'cat','files/SQLite/wricket.db'],{ timeout: 30000,maxBuffer: 20 * 1024 * 1024 });
  const db = new SQL.Database(bytes);
  const row = sql => db.exec(sql)[0]?.values[0];
  const innings = row(`SELECT i.total_runs,i.total_balls,(SELECT COUNT(*) FROM balls b WHERE b.innings_id=i.id) FROM innings i WHERE i.match_id='${matchId}' AND i.sequence=1`);
  const pending = row(`SELECT COUNT(*) FROM scoring_event_outbox WHERE match_id='${matchId}'`);
  const session = row(`SELECT last_committed_event_sequence FROM scoring_sessions WHERE match_id='${matchId}'`);
  db.close(); return { innings,pending: pending?.[0],sequence: session?.[0] };
}
async function chooser() {
  await poll(() => adb('shell','dumpsys','activity','activities').split(/\r?\n/).some(line => /(?:topResumedActivity|mResumedActivity)/.test(line) && /com.android.intentresolver|ResolverActivity|ChooserActivity/.test(line)), 'Android share chooser');
}
const cachedPngs = () => adb('shell','run-as',nativePackage,'find','cache','-type','f').split(/\r?\n/).filter(path => /\.png$/.test(path));
async function posterEvidence(previous,name) {
  for (const path of cachedPngs().filter(path => !previous.has(path))) {
    const png = execFileSync('adb',['-s','emulator-5556','exec-out','run-as',nativePackage,'cat',path],{ timeout: 30000,maxBuffer: 12 * 1024 * 1024 });
    if (png.length > 24 && png.subarray(1,4).toString() === 'PNG' && png.readUInt32BE(16) === 1080) { await writeFile('.e2e/' + name,png); return; }
  }
  throw new Error('The current native export did not produce a new 1080px PNG');
}
async function scoringReady(label) {
  await poll(() => {
    const tree = nodes(); const dismiss = tree.find(node => node.text === 'Dismiss');
    if (dismiss) { tapNode(dismiss); return false; }
    return tree.some(node => node.text === label || node['content-desc'] === label);
  },'scoring input after restoration',120000);
}
async function editable(password) {
  let acceptedDebugWait = false; let field;
  await poll(() => {
    const tree = nodes();
    if (tree.some(node => /SportStage E2E.*responding/.test(node.text))) {
      if (acceptedDebugWait) throw new Error('Repeated Android startup ANR');
      const wait = tree.find(node => node.text === 'Wait'); if (wait) { tapNode(wait); acceptedDebugWait = true; }
      return false;
    }
    field = tree.find(node => node.class === 'android.widget.EditText' && (node.password === 'true') === password);
    return Boolean(field);
  },'native password form',120000);
  return field;
}
try {
  await waitForMetro();
  await checked(client.auth.signInWithPassword({ email: owner.email,password: fixture.password }));
  matchId = await checked(client.rpc('create_owned_match_idempotent',{ p_request_id: randomUUID(),p_tournament_id: null,p_team_a_id: fixture.teams[0].id,p_team_b_id: fixture.teams[1].id,p_format: 'T20',p_rules: { oversPerInnings: 2,playersPerSide: 3,inningsPerTeam: 1 },p_scheduled_at: null,p_venue: 'Native review ground' }));
  const xi = offset => fixture.accounts.slice(offset,offset+3).map((account,index) => ({ player_id: account.playerId,batting_order: index+1,is_captain: index === 0,is_keeper: index === 1 }));
  await checked(client.rpc('start_match_setup',{ p_match_id: matchId,p_team_a_xi: xi(0),p_team_b_xi: xi(3),p_toss_winner_team_id: fixture.teams[0].id,p_toss_choice: 'BAT' }));
  if (process.env.WRICKET_NATIVE_SHARE_ONLY !== '1') {
  adb('shell','am','force-stop',nativePackage); adb('shell','pm','clear',nativePackage);
  adb('shell','run-as',nativePackage,'mkdir','-p','shared_prefs');
  adb('shell','run-as',nativePackage,'cp','/data/local/tmp/wricket-e2e-prefs.xml','shared_prefs/' + nativePackage + '_preferences.xml');
  adb('reverse','tcp:4173','tcp:4173'); adb('reverse','tcp:54321','tcp:54321');
  openAuth('/wricket'); await tap('Sign in with password');
  tapNode(await editable(false)); type(owner.email);
  tapNode(await editable(true)); type(fixture.password); hideKeyboard(); await tap('Sign in'); await waitFor('My cricket');
  open('/wricket/match/' + matchId + '/score'); await waitFor('Select openers');
  await tap('Select R0 A1'); await tap('Select R0 A2'); await tap('Confirm'); await tap('Select R0 B1'); await tap('Confirm');
  await tap('Record 1 runs'); await poll(async () => (await cloudInnings()).total_runs === 1,'first acknowledged delivery');
  await poll(() => localSnapshot().pending === 0,'acknowledged outbox drain');
  // Removing adb reverse leaves established sockets alive. Pause only the
  // isolated API gateway to force a real outage; retain the database/bundler.
  stopGateway(); await tap('Record 4 runs');
  await poll(() => localSnapshot().innings?.[0] === 5,'offline atomic save');
  const offline = localSnapshot(); assert.deepEqual(offline.innings,[5,2,2]); assert.equal(offline.pending,1); assert.equal(offline.sequence,2);
  screenshot('native-scoring-offline.png');
  adb('shell','am','force-stop',nativePackage);
  assert.deepEqual(localSnapshot().innings,[5,2,2]);
  open('/wricket/match/' + matchId + '/score');
  await scoringReady('Record 2 runs');
  await tap('Record 2 runs'); await poll(() => localSnapshot().innings?.[0] === 7,'cold offline resume');
  const resumed = localSnapshot(); assert.deepEqual(resumed.innings,[7,3,3]); assert.equal(resumed.pending,2); assert.equal(resumed.sequence,3);
  screenshot('native-scoring-cold-offline.png'); adb('shell','am','force-stop',nativePackage);
  await restoreGateway();
  // A cold link must be the initial Activity intent. Sending VIEW immediately
  // after a separate MAIN launch races JS linking initialization.
  open('/wricket/match/' + matchId + '/score');
  await scoringReady('Record 4 runs'); await poll(async () => (await cloudInnings()).total_runs === 7,'restart and reconnect replay');
  await poll(() => localSnapshot().pending === 0,'replayed event acknowledgement');
  const events = await checked(stack.admin.from('match_events').select('kind,client_event_id').eq('match_id',matchId).eq('kind','BALL_RECORDED'));
  assert.equal(events.length,3); assert.equal(new Set(events.map(event => event.client_event_id)).size,3);
  assert.deepEqual(localSnapshot().innings,[7,3,3]); screenshot('native-scoring-restored.png');
  console.info('PASS Android scoring: atomic SQLite totals/session/outbox, offline delivery, cold offline resume after process termination, reconnect and exactly-once acknowledgement');
  } else {
    adb('shell','am','force-stop',nativePackage);
  }
  open('/wricket/match/' + matchId + '/live'); await tap('Share match'); await waitFor('Share match link'); screenshot('native-match-share.png');
  await tap('Share match link'); await chooser(); screenshot('native-link-chooser.png'); adb('shell','input','keyevent','4');
  const previousPngs = new Set(cachedPngs());
  await tap('Export match image'); await chooser(); screenshot('native-image-chooser.png');
  await posterEvidence(previousPngs,'native-exported-poster.png'); adb('shell','input','keyevent','4');
  adb('shell','am','force-stop',nativePackage);
  adb('shell','settings','put','system','font_scale','1.3');
  open('/wricket/match/' + matchId + '/live'); await tap('Share match');
  await waitFor('Share match link'); screenshot('native-match-share-large-font.png');
  const previousLargePngs = new Set(cachedPngs()); await tap('Export match image'); await chooser();
  await posterEvidence(previousLargePngs,'native-exported-poster-large-font.png'); adb('shell','input','keyevent','4');
  // Keep the pre-export app layout capture; Android dismisses its chooser
  // asynchronously after Back, so an immediate second capture is still OS UI.
  console.info('PASS Android native link/image share choosers, cancellation, 1080px poster and reachable actions at 1.3 font scale');
} finally {
  await restoreGateway();
  adb('reverse','tcp:54321','tcp:54321');
  adb('shell','am','force-stop',nativePackage);
  if (/^\d+(?:\.\d+)?$/.test(originalScale)) adb('shell','settings','put','system','font_scale',originalScale);
  if (matchId) await checked(stack.admin.from('matches').delete().eq('id',matchId).eq('created_by',owner.id));
  await client.auth.signOut({ scope: 'local' });
}
