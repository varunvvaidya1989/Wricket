import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';
import { adb, nativePackage, tap, tapNode, open, scrollTo, screenshot, waitFor, waitForMetro } from './native-driver.mjs';

if (process.env.WRICKET_NATIVE_EXISTING_OWNER_SESSION !== '1') throw new Error('Establish the isolated owner session first');
const fixture = JSON.parse(await readFile(manifestPath,'utf8')); const stack = await localClients();
const owner = fixture.accounts[0]; const client = stack.client(); let matchId;
const originalScale = adb('shell','settings','get','system','font_scale').trim();
const press = async label => { console.info('ACTION native controls: ' + label); tapNode(await scrollTo(label)); };
async function poll(check) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve,1000));
  }
  throw new Error('Native controls canonical state did not settle');
}
const scoreboard = async () => (await checked(stack.admin.from('match_snapshots').select('scoreboard').eq('match_id',matchId).maybeSingle()))?.scoreboard;
try {
  await waitForMetro(); await checked(client.auth.signInWithPassword({ email: owner.email,password: fixture.password }));
  matchId = await checked(client.rpc('create_owned_match_idempotent',{ p_request_id: randomUUID(),p_tournament_id: null,p_team_a_id: fixture.teams[0].id,p_team_b_id: fixture.teams[1].id,p_format: 'T20',p_rules: { oversPerInnings: 2,playersPerSide: 3,inningsPerTeam: 1,followOnEnabled: false },p_scheduled_at: null,p_venue: 'Native controls review' }));
  const xi = offset => fixture.accounts.slice(offset,offset+3).map((account,index) => ({ player_id: account.playerId,batting_order: index+1,is_captain: index === 0,is_keeper: index === 1 }));
  await checked(client.rpc('start_match_setup',{ p_match_id: matchId,p_team_a_xi: xi(0),p_team_b_xi: xi(3),p_toss_winner_team_id: fixture.teams[0].id,p_toss_choice: 'BAT' }));
  adb('shell','am','force-stop',nativePackage); adb('shell','settings','put','system','font_scale','1.3');
  open('/wricket/match/' + matchId + '/score'); await waitFor('Select openers');
  await tap('Select R0 A1'); await tap('Select R0 A2'); await tap('Confirm'); await tap('Select R0 B1'); await tap('Confirm');
  await press('Controls'); await press('Penalty / bonus runs'); await press('Bonus'); await press('6');
  await waitFor('Add 6 runs'); screenshot('native-adjustment-large-font.png'); await press('Add 6 runs');
  await poll(async () => (await scoreboard())?.total_runs === 6);
  assert.equal((await scoreboard()).legal_balls,0);
  assert.equal((await checked(stack.admin.from('match_events').select('id').eq('match_id',matchId).eq('kind','BALL_RECORDED'))).length,0);
  await press('Controls'); await press('Retire a batter'); await waitFor('Confirm retirement'); screenshot('native-retirement-large-font.png');
  await press('Confirm retirement'); await tap('Select R0 A3'); await tap('Confirm');
  await poll(async () => (await checked(stack.admin.from('match_events').select('id').eq('match_id',matchId).eq('kind','BATTER_RETIRED'))).length === 1);
  assert.equal((await scoreboard()).total_wickets,0);
  await press('Controls'); await press('End innings early'); await waitFor('Keep scoring'); screenshot('native-end-innings-large-font.png');
  await press('Keep scoring'); await press('Controls'); await press('End match exceptionally');
  await waitFor('Confirm no result'); screenshot('native-end-match-large-font.png'); await press('Confirm no result'); await waitFor('Scorecard');
  await poll(async () => (await checked(stack.admin.from('matches').select('result').eq('id',matchId).single())).result?.kind === 'NO_RESULT');
  console.info('PASS Android large-font native control modals, non-ball bonus, retired-hurt replacement, closure cancellation and canonical no-result transition');
} finally {
  adb('shell','am','force-stop',nativePackage);
  if (/^\d+(?:\.\d+)?$/.test(originalScale)) adb('shell','settings','put','system','font_scale',originalScale);
  if (matchId) await checked(stack.admin.from('matches').delete().eq('id',matchId).eq('created_by',owner.id));
  await client.auth.signOut({ scope: 'local' });
}
