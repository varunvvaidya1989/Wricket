import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

const fixture = JSON.parse(await readFile(manifestPath,'utf8')); const stack = await localClients();
const owner = fixture.accounts[0]; const client = stack.client(); const ids = []; const errors = [];
const browser = await chromium.launch({ channel: 'chrome' }); const page = await browser.newPage({ viewport: { width: 376,height: 900 },reducedMotion: 'reduce' });
page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000); page.on('pageerror',error => errors.push(error.message));
page.on('dialog',dialog => dialog.accept());
const button = name => page.getByRole('button',{ name,exact: true }); const radio = name => page.getByRole('radio',{ name,exact: true });
const snapshot = async id => (await checked(stack.admin.from('match_snapshots').select('scoreboard').eq('match_id',id).maybeSingle()))?.scoreboard ?? { total_runs: 0,total_wickets: 0,legal_balls: 0 };
const events = id => checked(stack.admin.from('match_events').select('payload').eq('match_id',id).eq('kind','BALL_RECORDED').order('sequence'));
async function match() {
  const id = await checked(client.rpc('create_owned_match_idempotent',{ p_request_id: randomUUID(),p_tournament_id: null,p_team_a_id: fixture.teams[0].id,p_team_b_id: fixture.teams[1].id,p_format: 'T20',p_rules: { oversPerInnings: 2,playersPerSide: 3,inningsPerTeam: 1 },p_scheduled_at: null,p_venue: 'Form review ground' })); ids.push(id);
  const xi = offset => fixture.accounts.slice(offset,offset+3).map((account,index) => ({ player_id: account.playerId,batting_order: index+1,is_captain: index === 0,is_keeper: index === 1 }));
  await checked(client.rpc('start_match_setup',{ p_match_id: id,p_team_a_xi: xi(0),p_team_b_xi: xi(3),p_toss_winner_team_id: fixture.teams[0].id,p_toss_choice: 'BAT' }));
  await page.goto('http://127.0.0.1:4173/wricket/match/' + id + '/score');
  await button('Select R0 A1').click(); await button('Select R0 A2').click(); await button('Confirm').click(); await button('Select R0 B1').click(); await button('Confirm').click(); return id;
}
try {
  await checked(client.auth.signInWithPassword({ email: owner.email,password: fixture.password }));
  await page.goto('http://127.0.0.1:4173/auth'); await button('Sign in with password').click(); await page.getByPlaceholder('Email',{ exact: true }).fill(owner.email); await page.getByPlaceholder('Password',{ exact: true }).fill(fixture.password); await button('Sign in').click(); await page.waitForURL('**/live');
  const extrasId = await match(); let total = 0; let legal = 0; const expected = [];
  for (const [kind,label] of [['WIDE','Wide'],['NO_BALL','No ball'],['BYE','Bye'],['LEG_BYE','Leg bye']]) {
    for (const runs of [0,2]) {
      await button('Extras').click(); await radio(label).click();
      for (let n = 0; n < runs; n++) await button('Increase additional runs').click();
      if (runs) { await expect(button('Record delivery')).toBeDisabled(); await radio('Keep strike').click(); }
      await button('Record delivery').click(); const penalty = kind === 'WIDE' || kind === 'NO_BALL';
      total += runs + Number(penalty); legal += Number(!penalty);
      await expect(page.getByLabel(`Score ${total} for 0`,{ exact: true })).toBeVisible();
      await expect.poll(async () => { const s = await snapshot(extrasId); return [s.total_runs,s.legal_balls]; },{ timeout: 30000 }).toEqual([total,legal]);
      expected.push({ kind,bat: kind === 'NO_BALL' ? runs : 0,extra: kind === 'NO_BALL' ? 1 : runs + Number(penalty),legal: !penalty });
    }
  }
  assert.deepEqual((await events(extrasId)).map(({ payload }) => ({ kind: payload.extra_kind,bat: payload.runs_bat,extra: payload.runs_extra,legal: payload.is_legal })),expected);
  for (let n = 0; n < 2; n++) { await button('Record 0 runs').click(); if (n === 0) await expect(button('Record 0 runs')).toBeEnabled(); }
  await expect(page.getByText('Select bowler',{ exact: true })).toBeVisible();
  await expect.poll(async () => (await snapshot(extrasId)).legal_balls,{ timeout: 30000 }).toBe(6);
  await page.reload(); await expect(page.getByText('Select bowler',{ exact: true })).toBeVisible();
  await button('Select R0 B2').click(); await button('Confirm').click(); await button('Record 1 runs').click();
  await expect.poll(async () => (await snapshot(extrasId)).legal_balls,{ timeout: 30000 }).toBe(7);
  assert.equal((await events(extrasId)).at(-1).payload.bowler_id,fixture.accounts[4].playerId);
  console.info('PASS all four extras at zero/additional runs, mandatory strike decision, server bat/extra/legal parity, over transition and restored next-bowler prompt');
  for (const [kind,label] of [['BOWLED','Bowled'],['CAUGHT','Caught'],['LBW','LBW'],['RUN_OUT','Run out'],['STUMPED','Stumped'],['HIT_WICKET','Hit wicket'],['RETIRED_OUT','Retired out']]) {
    const id = await match(); await button('Wicket').click(); await radio(label).click();
    if (kind === 'RUN_OUT') await radio('Dismiss R0 A2').click();
    if (['CAUGHT','RUN_OUT','STUMPED'].includes(kind)) {
      await expect(button('Confirm wicket')).toBeDisabled();
      await radio((kind === 'CAUGHT' ? 'Fielder' : kind === 'STUMPED' ? 'Keeper' : 'Wicket broken by') + ': R0 B2').click();
      if (kind === 'RUN_OUT') { await expect(button('Confirm wicket')).toBeDisabled(); await radio('Thrower / assist (same player for direct hit): R0 B3').click(); }
    }
    await button('Confirm wicket').click(); await expect(page.getByText('Next batter',{ exact: true })).toBeVisible();
    await expect.poll(async () => (await snapshot(id)).total_wickets,{ timeout: 30000 }).toBe(1);
    const payload = (await events(id))[0].payload; assert.equal(payload.dismissal_kind,kind); assert.equal(payload.out_player_id,fixture.accounts[kind === 'RUN_OUT' ? 1 : 0].playerId);
    if (['CAUGHT','RUN_OUT','STUMPED'].includes(kind)) assert.equal(payload.fielder_id,fixture.accounts[4].playerId);
    if (kind === 'RUN_OUT') assert.equal(payload.assistant_fielder_id,fixture.accounts[5].playerId);
    await button('Select R0 A3').click(); await button('Confirm').click(); await button('Undo last ball').click();
    await expect(page.getByLabel('Score 0 for 0',{ exact: true })).toBeVisible(); await expect.poll(async () => (await snapshot(id)).total_wickets,{ timeout: 30000 }).toBe(0);
  }
  console.info('PASS every supported dismissal, non-striker run-out, required keeper/fielder/assist, replacement and Undo with authoritative parity');
  assert.deepEqual(errors,[]);
} finally { await browser.close(); for (const id of ids) await checked(stack.admin.from('matches').delete().eq('id',id).eq('created_by',owner.id)); await client.auth.signOut({ scope: 'local' }); }
