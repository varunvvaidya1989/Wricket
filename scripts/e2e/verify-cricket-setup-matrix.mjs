import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

const fixture = JSON.parse(await readFile(manifestPath,'utf8')); const stack = await localClients();
const owner = fixture.accounts[0]; const ids = []; const errors = []; let emptyTeam;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 376,height: 900 },reducedMotion: 'reduce' });
page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000); page.on('pageerror',error => errors.push(error.message));
const button = name => page.getByRole('button',{ name,exact: true });
try {
  await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:4173/status')).ok; } catch { return false; } }, { timeout: 180000, intervals: [1000,3000] }).toBe(true);
  await page.goto('http://127.0.0.1:4173/auth'); await button('Sign in with password').click();
  await page.getByPlaceholder('Email',{ exact: true }).fill(owner.email); await page.getByPlaceholder('Password',{ exact: true }).fill(fixture.password);
  await button('Sign in').click(); await page.waitForURL('**/live');
  for (const [format,label] of [['BOX','Box Cricket'],['TURF','Turf cricket'],['TURF_TEST','Test'],['T20','T20'],['T10','T10'],['ODI','ODI']]) {
    await page.goto('http://127.0.0.1:4173/wricket/match/new');
    await button('TEAM A: ' + fixture.teams[0].name).click(); await button('TEAM B: ' + fixture.teams[1].name).click();
    await page.getByRole('radio',{ name: label,exact: true }).click();
    await expect(page.getByRole('radio',{ name: label,exact: true })).toBeChecked();
    await page.getByRole('textbox',{ name: 'Overs',exact: true }).fill('1'); await page.getByRole('textbox',{ name: 'Players per side',exact: true }).fill('3');
    await button('Choose players').click(); await expect(page.getByText('3/3 selected',{ exact: true })).toHaveCount(2);
    await button('Continue to toss').click(); await button('On-field toss').click();
    await button(fixture.teams[0].name).click(); await button('Bat first').click(); await button('Review match').click();
    if (format === 'BOX') {
      await page.route('**/rest/v1/rpc/start_match_setup',route => route.fulfill({ status: 403,contentType: 'application/json',headers: { 'access-control-allow-origin': '*' },body: JSON.stringify({ message: 'Scoring permission denied for this review.' }) }));
      await button('Start scoring').click(); await expect(page.getByText('Could not start match',{ exact: true })).toBeVisible();
      await expect(page.getByText('Scoring permission denied for this review.',{ exact: true })).toBeVisible();
      await expect(button('Start scoring')).toBeEnabled();
      await page.screenshot({ path: '.e2e/setup-failed-start.png',fullPage: true });
      await page.unroute('**/rest/v1/rpc/start_match_setup');
      await page.route('**/rest/v1/rpc/start_match_setup',route => route.abort('failed'));
      await button('Start scoring').click(); await expect(page.getByText('Could not start match',{ exact: true })).toBeVisible();
      await expect(button('Start scoring')).toBeEnabled(); await page.unroute('**/rest/v1/rpc/start_match_setup');
    }
    await button('Start scoring').click(); await page.waitForURL('**/score');
    const id = page.url().match(/match\/([^/]+)\/score/)[1]; ids.push(id);
    const row = await checked(stack.admin.from('matches').select('format,rules,status').eq('id',id).single());
    assert.equal(row.format,format); assert.equal(row.rules.oversPerInnings,1); assert.equal(row.rules.playersPerSide,3);
    assert.equal(row.rules.inningsPerTeam,format === 'TURF_TEST' ? 2 : 1); assert.equal(row.status,'IN_PROGRESS');
    await expect(page.getByText('Select openers',{ exact: true })).toBeVisible();
  }
  console.info('PASS all six formats through real XIs, toss and canonical match start; denied/network start retains review and recovers');
  emptyTeam = await checked(stack.admin.from('teams').insert({ name: 'Empty Setup ' + randomUUID().slice(0,8),short_name: 'ES',entity_owner_id: owner.id,color_hex: '#a6f477' }).select('id,name').single());
  await page.goto('http://127.0.0.1:4173/wricket/match/new');
  await button('TEAM A: ' + fixture.teams[0].name).click(); await button('TEAM B: ' + emptyTeam.name).click();
  await page.getByRole('textbox',{ name: 'Players per side',exact: true }).fill('3');
  await button('Choose players').click(); await button('Continue to toss').click();
  await expect(page.getByText('Playing XI incomplete',{ exact: true })).toBeVisible();
  await expect(page.getByText('0/3 selected',{ exact: true })).toBeVisible();
  assert.deepEqual(errors,[]); console.info('PASS missing roster blocks progression with visible guidance and retains the selected teams');
} finally {
  await browser.close();
  for (const id of ids) await checked(stack.admin.from('matches').delete().eq('id',id).eq('created_by',owner.id));
  if (emptyTeam) await checked(stack.admin.from('teams').delete().eq('id',emptyTeam.id).eq('entity_owner_id',owner.id));
}
