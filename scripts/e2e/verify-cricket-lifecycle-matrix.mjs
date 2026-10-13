import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

const fixture = JSON.parse(await readFile(manifestPath,'utf8')); const stack = await localClients();
const owner = fixture.accounts[0]; const client = stack.client(); const ids = []; const errors = [];
const browser = await chromium.launch({ channel: 'chrome' }); const page = await browser.newPage({ viewport: { width: 376,height: 900 },reducedMotion: 'reduce' });
page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000); page.on('pageerror',error => errors.push(error.message));
const button = name => page.getByRole('button',{ name,exact: true });
const radio = name => page.getByRole('radio',{ name,exact: true });
async function openers(side) {
  await expect(page.getByText('Select openers',{ exact: true })).toBeVisible();
  for (const index of [1,2]) await button(`Select R0 ${side}${index}`).click();
  await button('Confirm').click(); await button(`Select R0 ${side === 'A' ? 'B' : 'A'}1`).click(); await button('Confirm').click();
}
async function newMatch(format = 'T20') {
  const id = await checked(client.rpc('create_owned_match_idempotent',{ p_request_id: randomUUID(),p_tournament_id: null,p_team_a_id: fixture.teams[0].id,p_team_b_id: fixture.teams[1].id,p_format: format,p_rules: { oversPerInnings: 1,playersPerSide: 3,inningsPerTeam: format === 'TURF_TEST' ? 2 : 1,followOnEnabled: format === 'TURF_TEST' },p_scheduled_at: null,p_venue: 'Review ground' })); ids.push(id);
  const xi = offset => fixture.accounts.slice(offset,offset+3).map((account,index) => ({ player_id: account.playerId,batting_order: index+1,is_captain: index === 0,is_keeper: index === 1 }));
  await checked(client.rpc('start_match_setup',{ p_match_id: id,p_team_a_xi: xi(0),p_team_b_xi: xi(3),p_toss_winner_team_id: fixture.teams[0].id,p_toss_choice: 'BAT' }));
  await page.goto('http://127.0.0.1:4173/wricket/match/' + id + '/score'); await openers('A'); return id;
}
async function bonus(runs) {
  for (let remaining = runs; remaining > 0;) {
    const amount = Math.min(6,remaining);
    await button('Controls').click(); await button('Penalty / bonus runs').click(); await radio('Bonus').click();
    await radio(String(amount)).click(); await button('Add ' + amount + ' runs').click(); remaining -= amount;
  }
}
async function endInnings() { await button('Controls').click(); await button('End innings early').click(); await button('End innings').click(); }
async function retireOut() { await button('Controls').click(); await button('Retire a batter').click(); await radio('Retired out').click(); await button('Confirm retirement').click(); }
const result = id => checked(stack.admin.from('matches').select('result,status').eq('id',id).single());
try {
  await checked(client.auth.signInWithPassword({ email: owner.email,password: fixture.password }));
  await page.goto('http://127.0.0.1:4173/auth'); await button('Sign in with password').click(); await page.getByPlaceholder('Email',{ exact: true }).fill(owner.email); await page.getByPlaceholder('Password',{ exact: true }).fill(fixture.password); await button('Sign in').click(); await page.waitForURL('**/live');
  for (const resolution of ['CANCELLED','WALKOVER_A','WALKOVER_B']) {
    const id = await newMatch(); await button('Controls').click(); await button('End match exceptionally').click();
    if (resolution === 'CANCELLED') { await radio('Cancelled').click(); await button('Confirm cancelled').click(); }
    else { await radio('Walkover').click(); const winner = fixture.teams[resolution.endsWith('A') ? 0 : 1]; await radio(winner.name).click(); await button('Confirm walkover').click(); }
    await page.waitForURL('**/scorecard'); await expect.poll(async () => (await result(id)).result?.kind).toBe(resolution === 'CANCELLED' ? 'CANCELLED' : 'WALKOVER');
    if (resolution !== 'CANCELLED') assert.equal((await result(id)).result.winnerTeamId,fixture.teams[resolution.endsWith('A') ? 0 : 1].id);
    await page.goto('http://127.0.0.1:4173/wricket/match/' + id + '/live');
    await expect(page.getByText(resolution === 'CANCELLED' ? 'Match cancelled' : fixture.teams[resolution.endsWith('A') ? 0 : 1].name + ' won by walkover',{ exact: true }).first()).toBeVisible();
    await page.screenshot({ path: '.e2e/lifecycle-' + resolution.toLowerCase() + '.png',fullPage: true });
  }
  console.info('PASS confirmed cancellation and both walkover winners, authoritative results and spectator presentation');
  for (const [runs,kind,margin] of [[4,'WIN_BY_RUNS',1],[5,'TIE',undefined],[6,'WIN_BY_WICKETS',2]]) {
    console.info('CHECK normal result: ' + kind);
    const id = await newMatch(); await bonus(5); await endInnings(); await openers('B');
    for (const delivery of runs === 5 ? [4,1] : [runs]) {
      await button('Record ' + delivery + ' runs').click();
      if (runs < 6) await expect(button('Record 0 runs')).toBeEnabled();
    }
    if (runs < 6) await endInnings();
    await page.waitForURL('**/scorecard'); await expect.poll(async () => (await result(id)).result?.kind).toBe(kind);
    const canonical = await result(id); assert.equal(canonical.status,'COMPLETED');
    if (margin !== undefined) assert.equal(canonical.result.margin,margin);
    else assert.equal(canonical.result.winnerTeamId,undefined);
    await page.goto('http://127.0.0.1:4173/wricket/match/' + id + '/score');
    await page.waitForURL('**/scorecard');
  }
  console.info('PASS normal runs/wickets wins and tied terminal outcome, correct margins and read-only scoring cold links');
  for (const enforce of [false,true]) {
    console.info('CHECK Test follow-on: ' + (enforce ? 'enforce' : 'decline'));
    const id = await newMatch('TURF_TEST'); await bonus(35); await endInnings(); await openers('B'); await bonus(10);
    await retireOut(); await button('Select R0 B3').click(); await button('Confirm').click();
    if (enforce) await retireOut();
    else { await button('Wicket').click(); await button('Confirm wicket').click(); }
    await expect(page.getByText('Follow-on decision',{ exact: true })).toBeVisible();
    await expect.poll(async () => (await checked(stack.admin.from('match_innings').select('status').eq('match_id',id).eq('sequence',2).single())).status,{ timeout: 30000 }).toBe('COMPLETED');
    await page.reload(); await expect(page.getByText('Follow-on decision',{ exact: true })).toBeVisible();
    await page.screenshot({ path: '.e2e/lifecycle-follow-on.png',fullPage: true });
    await button(enforce ? 'Enforce on ' + fixture.teams[1].name : 'Decline — ' + fixture.teams[0].name + ' bat').click();
    await openers(enforce ? 'B' : 'A');
    if (enforce) { await bonus(20); await endInnings(); await page.waitForURL('**/scorecard'); await expect.poll(async () => (await result(id)).result?.kind).toBe('WIN_BY_INNINGS'); }
    else {
      await bonus(1); await endInnings(); await openers('B'); await expect(page.getByText('Need 27 from 6 balls',{ exact: true })).toBeVisible();
      await endInnings(); await page.waitForURL('**/scorecard');
      await expect.poll(async () => (await result(id)).result?.kind).toBe('WIN_BY_RUNS');
      assert.equal((await result(id)).result.margin,26);
    }
    const innings = await checked(stack.admin.from('match_innings').select('sequence,is_follow_on').eq('match_id',id).order('sequence'));
    assert.equal(innings.length,enforce ? 3 : 4); assert.equal(innings[2].is_follow_on,enforce);
  }
  console.info('PASS retired-out all-out progression, persistent follow-on decision, enforce/decline, fourth-innings target and innings victory');
  assert.deepEqual(errors,[]);
} finally { await browser.close(); for (const id of ids) await checked(stack.admin.from('matches').delete().eq('id',id).eq('created_by',owner.id)); await client.auth.signOut({ scope: 'local' }); }
