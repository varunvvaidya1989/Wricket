import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { checked, signedClients } from './signed-release-fixture.mjs';
import { adb, releasePackage, openRelease, waitFor, capture, stoppedSnapshot } from './signed-release-driver.mjs';

const fixture = JSON.parse(await readFile('.e2e/signed-release/private/fixture.json', 'utf8'));
const stack = await signedClients();
const viewer = stack.client();
await checked(viewer.auth.signInWithPassword({ email: fixture.accounts[1].email, password: fixture.password }));
const updates = [];
const channel = viewer.channel('signed-release-' + fixture.run).on('postgres_changes', {
  event: '*', schema: 'public', table: 'match_snapshots',
}, payload => {
  if (fixture.matches.some(match => match.id === payload.new.match_id)) {
    updates.push({ matchId: payload.new.match_id, sequence: payload.new.latest_sequence, scoreboard: payload.new.scoreboard });
  }
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Viewer Realtime timeout')), 30000);
  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
    if (status === 'CHANNEL_ERROR') { clearTimeout(timer); reject(new Error(status)); }
  });
});
try {
  const evidence = [];
  for (const match of fixture.matches.slice(0, 2)) {
    const baseline = JSON.parse(await readFile(`.e2e/signed-release/baseline-${match.name}.json`, 'utf8'));
    adb('shell', 'am', 'force-stop', releasePackage);
    openRelease(`/wricket/match/${match.id}/score`);
    await waitFor(match.name === 'bowler' ? 'Select bowler' : 'Next batter');
    capture(`production9-restored-${match.name}.png`);
    await new Promise(resolve => setTimeout(resolve, 7000));
    const local = stoppedSnapshot(match.id);
    assert.equal(local.outbox.length, 0, 'All queued events acknowledged');
    const server = await checked(stack.admin.from('match_events').select('id,client_event_id,kind,sequence').eq('match_id', match.id));
    for (const queued of baseline.outbox) {
      assert.equal(server.filter(event => event.client_event_id === queued.client_event_id).length, 1);
    }
    const snapshot = await checked(stack.admin.from('match_snapshots').select('latest_sequence,scoreboard').eq('match_id', match.id).single());
    assert.equal(snapshot.scoreboard.legal_balls, match.name === 'bowler' ? 6 : 0);
    assert.equal(snapshot.scoreboard.total_runs, match.name === 'bowler' ? 2 : 1);
    assert.equal(local.session[0].pending_prompt, baseline.session[0].pending_prompt);
    await writeFile(`.e2e/signed-release/reconnected9-${match.name}.json`, JSON.stringify(local, null, 2));
    // A second cold reconnect must neither drop nor reapply an acknowledged command.
    adb('shell', 'am', 'force-stop', releasePackage);
    openRelease(`/wricket/match/${match.id}/score`);
    await waitFor(match.name === 'bowler' ? 'Select bowler' : 'Next batter');
    await new Promise(resolve => setTimeout(resolve, 5000));
    const repeated = await checked(stack.admin.from('match_events').select('id,client_event_id,kind,sequence').eq('match_id', match.id));
    assert.deepEqual(repeated.sort((a, b) => a.sequence - b.sequence), server.sort((a, b) => a.sequence - b.sequence));
    stoppedSnapshot(match.id);
    evidence.push({ match: match.name, pendingPrompt: local.session[0].pending_prompt, outbox: 0, server, snapshot, repeatedReconnectStable: true });
  }
  await writeFile('.e2e/signed-release/reconnect9-evidence.json', JSON.stringify({ recordedAt: new Date().toISOString(), passed: true, evidence, viewerRealtime: updates }, null, 2));
  console.info('PASS signed upgrade: both pending prompts, queues drained, each original client ID applied once, stable repeat reconnect.');
} finally {
  await viewer.removeChannel(channel);
  await viewer.auth.signOut({ scope: 'local' });
}
