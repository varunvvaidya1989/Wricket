import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

const fixture = JSON.parse(await readFile(manifestPath,'utf8')); const stack = await localClients();
const owner = fixture.accounts[0]; const viewer = fixture.accounts.at(-1); const client = stack.client();
const browser = await chromium.launch({ channel: 'chrome' }); let id;
async function signIn(page,account) {
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000);
  await page.goto('http://127.0.0.1:4173/auth'); await page.getByRole('button',{ name: 'Sign in with password',exact: true }).click();
  await page.getByPlaceholder('Email',{ exact: true }).fill(account.email); await page.getByPlaceholder('Password',{ exact: true }).fill(fixture.password);
  await page.getByRole('button',{ name: 'Sign in',exact: true }).click(); await page.waitForURL('**/live');
}
try {
  await checked(client.auth.signInWithPassword({ email: owner.email,password: fixture.password }));
  id = await checked(client.rpc('create_owned_match_idempotent',{ p_request_id: randomUUID(),p_tournament_id: null,p_team_a_id: fixture.teams[0].id,p_team_b_id: fixture.teams[1].id,p_format: 'T20',p_rules: { oversPerInnings: 2,playersPerSide: 3,inningsPerTeam: 1 },p_scheduled_at: null,p_venue: null }));
  const xi = offset => fixture.accounts.slice(offset,offset+3).map((account,index) => ({ player_id: account.playerId,batting_order: index+1,is_captain: index === 0,is_keeper: index === 1 }));
  await checked(client.rpc('start_match_setup',{ p_match_id: id,p_team_a_xi: xi(0),p_team_b_xi: xi(3),p_toss_winner_team_id: fixture.teams[0].id,p_toss_choice: 'BAT' }));
  const spectator = await browser.newPage(); await signIn(spectator,viewer);
  await spectator.goto('http://127.0.0.1:4173/wricket/match/' + id + '/score');
  await expect(spectator.getByText('Could not resume scoring',{ exact: true })).toBeVisible();
  await expect(spectator.getByRole('button',{ name: 'Record 1 runs',exact: true })).toHaveCount(0);
  await spectator.close();
  const scorer = await browser.newPage(); await signIn(scorer,owner);
  await checked(client.rpc('acquire_scoring_lease',{ p_match_id: id,p_device_id: 'separate-native-device' }));
  await scorer.goto('http://127.0.0.1:4173/wricket/match/' + id + '/score');
  await expect(scorer.getByText('Could not resume scoring',{ exact: true })).toBeVisible();
  await expect(scorer.getByText('Another scorer currently holds this match',{ exact: true })).toBeVisible();
  await checked(stack.admin.from('scoring_leases').update({ expires_at: new Date(0).toISOString() }).eq('match_id',id));
  await scorer.getByRole('button',{ name: 'Try again',exact: true }).click(); await expect(scorer.getByText('Select openers',{ exact: true })).toBeVisible();
  // The account/device now has a cached grant. An authoritative new lease
  // denial must still block a fresh route instead of accepting that grant.
  await checked(stack.admin.from('scoring_leases').update({ device_id: 'another-device',expires_at: new Date(Date.now()+120000).toISOString() }).eq('match_id',id));
  await scorer.reload(); await expect(scorer.getByText('Could not resume scoring',{ exact: true })).toBeVisible();
  await expect(scorer.getByRole('button',{ name: 'Record 1 runs',exact: true })).toHaveCount(0);
  assert.equal((await checked(stack.admin.from('match_events').select('id').eq('match_id',id).eq('kind','BALL_RECORDED'))).length,0);
  console.info('PASS cold spectator denial, competing device lease, retry after expiry and authoritative denial despite a cached grant; no scoring writes');
} finally { await browser.close(); if (id) await checked(stack.admin.from('matches').delete().eq('id',id).eq('created_by',owner.id)); await client.auth.signOut({ scope: 'local' }); }
