import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { signedClients, checked } from './signed-release-fixture.mjs';
import { adb, releasePackage, openRelease, tap, waitFor, capture, stoppedSnapshot, nodes, until } from './signed-release-driver.mjs';

const fixture = JSON.parse(await readFile('.e2e/signed-release/private/fixture.json', 'utf8'));
const match = fixture.matches.find(item => item.name === 'batter');
const fresh = fixture.matches.find(item => item.name === 'recovery-new');
const baseline = JSON.parse(await readFile('.e2e/signed-release/before-recovery-batter.json', 'utf8'));
const stack = await signedClients();
const viewer = stack.client();
await checked(viewer.auth.signInWithPassword({ email: fixture.accounts[1].email, password: fixture.password }));
const updates = [];
const channel = viewer.channel('recovery-acceptance-' + fixture.run).on('postgres_changes', {
  event: '*', schema: 'public', table: 'match_snapshots', filter: 'match_id=eq.' + match.id,
}, payload => updates.push({ matchId: payload.new.match_id, sequence: payload.new.latest_sequence, scoreboard: payload.new.scoreboard }));
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Realtime subscribe timeout')), 30000);
  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
    if (status === 'CHANNEL_ERROR') { clearTimeout(timer); reject(new Error(status)); }
  });
});
const launch = id => { adb('shell', 'am', 'force-stop', releasePackage); openRelease(`/wricket/match/${id}/score`); };
try {
  launch(match.id);
  await waitFor('Select bowler');
  capture('recovery10-existing-offline-prompt.png');
  const offline = stoppedSnapshot(match.id);
  assert.deepEqual(offline, baseline, 'Offline active session, prompt, history and queue stay unchanged');
  assert.equal(offline.session[0].ui_version, 'revamp-v1');
  await writeFile('.e2e/signed-release/recovery10-offline-preserved.json', JSON.stringify(offline, null, 2));
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  launch(match.id);
  await waitFor('Select bowler');
  await until(async () => {
    const events = await checked(stack.admin.from('match_events').select('client_event_id').eq('match_id', match.id));
    return baseline.outbox.every(command => events.some(event => event.client_event_id === command.client_event_id));
  }, 'all recovery queued commands acknowledged');
  await until(() => updates.some(update => update.scoreboard?.legal_balls === 6 && update.scoreboard?.total_runs === 5), 'independent viewer receives final recovery score');
  const events = await checked(stack.admin.from('match_events').select('id,client_event_id,kind,sequence').eq('match_id', match.id));
  for (const command of baseline.outbox) assert.equal(events.filter(event => event.client_event_id === command.client_event_id).length, 1);
  const synced = stoppedSnapshot(match.id);
  assert.equal(synced.outbox.length, 0);
  assert.equal(synced.balls.length, 7);
  assert.equal(synced.session[0].pending_prompt, 'NEXT_BOWLER');
  assert.equal(synced.session[0].ui_version, 'revamp-v1');
  await writeFile('.e2e/signed-release/recovery10-queue-evidence.json', JSON.stringify({
    recordedAt: new Date().toISOString(), passed: true, offlinePreserved: true,
    queuedCommands: baseline.outbox.length, exactOnce: true, serverEvents: events,
    viewerRealtime: updates, pendingPrompt: synced.session[0].pending_prompt,
  }, null, 2));
  launch(match.id);
  await tap('Select RC B2'); await tap('Confirm'); await tap('Numbers');
  const existingKey = await waitFor('Record 0 runs');
  capture('recovery10-active-revamp-pad.png');
  const existingHeight = Number(existingKey.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)[4]) - Number(existingKey.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)[2]);
  const repeated = await checked(stack.admin.from('match_events').select('id,client_event_id,kind,sequence').eq('match_id', match.id));
  assert.deepEqual(repeated.sort((a, b) => a.sequence - b.sequence), events.sort((a, b) => a.sequence - b.sequence));
  launch(fresh.id);
  await waitFor('Select openers'); await tap('Select RC A1'); await tap('Select RC A2'); await tap('Confirm');
  await tap('Select RC B1'); await tap('Confirm'); await tap('Numbers');
  const newKey = await waitFor('Record 0 runs');
  const newHeight = Number(newKey.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)[4]) - Number(newKey.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)[2]);
  assert.ok(newHeight > existingHeight, 'New recovery session uses larger keys');
  assert.ok(nodes().some(node => node['content-desc'] === 'Gestures'), 'Both input options remain available');
  capture('recovery10-new-recovery-pad.png');
  await tap('Record 2 runs');
  await until(async () => (await checked(stack.admin.from('match_snapshots').select('scoreboard').eq('match_id', fresh.id).maybeSingle()))?.scoreboard?.total_runs === 2, 'new recovery session can score');
  await new Promise(resolve => setTimeout(resolve, 2000));
  const freshSnapshot = stoppedSnapshot(fresh.id);
  assert.equal(freshSnapshot.session[0].ui_version, 'recovery-v1');
  assert.equal(freshSnapshot.outbox.length, 0);
  adb('shell', 'svc', 'wifi', 'disable'); adb('shell', 'svc', 'data', 'disable');
  launch(fresh.id); await waitFor('Record 0 runs');
  const cold = stoppedSnapshot(fresh.id);
  assert.equal(cold.session[0].ui_version, 'recovery-v1');
  assert.deepEqual(cold.balls, freshSnapshot.balls);
  await writeFile('.e2e/signed-release/recovery10-new-session.json', JSON.stringify(cold, null, 2));
  const evidence = { recordedAt: new Date().toISOString(), passed: true,
    oldSessionUi: 'revamp-v1', newSessionUi: 'recovery-v1', keyHeights: { existing: existingHeight, recovery: newHeight },
    offlinePreserved: true, queuedCommands: baseline.outbox.length, exactOnce: true, repeatedReconnectStable: true,
    serverEvents: events, viewerRealtime: updates, gestureOptionPresent: true, gestureCalibration: 'paused by user',
    newSessionScoring: { totalRuns: 2 }, newSessionColdOfflineResume: true };
  await writeFile('.e2e/signed-release/recovery10-evidence.json', JSON.stringify(evidence, null, 2));
  console.info('PASS signed recovery: offline data and prompts retained, six queued events applied once, independent Realtime viewer, active UI pinned, new recovery UI larger, new session cold resume.');
} finally {
  adb('shell', 'svc', 'wifi', 'enable'); adb('shell', 'svc', 'data', 'enable');
  await viewer.removeChannel(channel); await viewer.auth.signOut({ scope: 'local' });
}
