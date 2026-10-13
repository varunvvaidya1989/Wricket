import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

const check = expect.configure({ timeout: 60000 });
const origin = 'http://127.0.0.1:4173';
const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients();
await check.poll(async () => { try { return (await fetch(origin + '/status')).ok; } catch { return false; } }, { timeout: 180000 }).toBe(true);
const browserName = process.env.WRICKET_REVIEW_BROWSER ?? 'chromium';
const engine = { chromium, firefox, webkit }[browserName];
assert.ok(engine, 'A supported browser is required');
const browser = await engine.launch(browserName === 'chromium' ? { channel: process.env.WRICKET_E2E_CHROME_CHANNEL ?? 'chrome' } : {});
const owner = fixture.accounts[0], viewer = fixture.accounts[1];
const run = randomUUID().slice(0, 8);
const tournament = await checked(stack.admin.from('tournaments').insert({ created_by: owner.id, source_local_id: randomUUID(), name: 'Moments acceptance ' + run, format: 'TURF', visibility: 'PUBLIC', start_date: '2026-10-11', planned_team_count: 2, players_per_team: 3, overs_per_match: 1 }).select('id').single());
const client = stack.client();
await checked(client.auth.signInWithPassword({ email: owner.email, password: fixture.password }));
const errors = [];
async function login(account) {
  const context = await browser.newContext({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', error => errors.push(error.message));
  try {
  const destination = '/tournament?id=' + tournament.id;
  await page.goto(origin + '/auth?returnTo=' + encodeURIComponent(destination), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill(account.email);
  await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith('/wricket/tournament/'));
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await page.getByRole('button', { name: 'Match moments', exact: true }).click();
  await check(page.getByRole('textbox', { name: 'Moment caption', exact: true })).toBeVisible();
  return page;
  } catch (error) {
    console.error('Navigation diagnostics: ' + JSON.stringify({ browserName, errors, url: page.url() }));
    console.error((await page.locator('body').innerText()).slice(0, 4000));
    await page.screenshot({ path: '.e2e/moments-' + browserName + '-navigation-failure.png', fullPage: true });
    throw error;
  }
}
let author, reader;
try {
  author = await login(owner); console.info('PASS ' + browserName + ' Moments navigation and signed-in composer');
  const caption = author.getByRole('textbox', { name: 'Moment caption', exact: true });
  await caption.fill('Boundary photo ' + run);
  const [file] = await Promise.all([author.waitForEvent('filechooser'), author.getByLabel('Add photo', { exact: true }).click()]);
  await file.setFiles('assets/sportstage/logo/sportstage-icon-192.png');
  await check(author.getByRole('button', { name: 'Remove attached photo', exact: true })).toBeVisible();
  const uploadRoute = '**/storage/v1/object/match-moments/**';
  await author.route(uploadRoute, route => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
  await author.getByRole('button', { name: 'Share moment', exact: true }).click();
  await check(author.getByRole('alert')).toContainText('Could not publish moment');
  await check(caption).toHaveValue('Boundary photo ' + run);
  await check(author.getByRole('button', { name: 'Remove attached photo', exact: true })).toBeVisible();
  await author.unroute(uploadRoute);
  await author.getByRole('button', { name: 'Share moment', exact: true }).click();
  await check(caption).toHaveValue(''); console.info('PASS upload failure retention and real successful retry');
  const first = await checked(stack.admin.from('match_moments').select('id').eq('tournament_id', tournament.id).eq('status', 'PUBLISHED').eq('caption', 'Boundary photo ' + run).single());
  await caption.fill('Second highlight ' + run);
  const [secondFile] = await Promise.all([author.waitForEvent('filechooser'), author.getByLabel('Add photo', { exact: true }).click()]);
  await secondFile.setFiles('assets/sportstage/logo/sportstage-icon-192.png');
  await author.getByRole('button', { name: 'Share moment', exact: true }).click();
  await check(caption).toHaveValue('');
  await check(author.getByRole('button', { name: 'Next highlight', exact: true })).toBeEnabled();
  await author.getByRole('button', { name: 'Next highlight', exact: true }).click();
  await check(author.getByRole('button', { name: 'Previous highlight', exact: true })).toBeEnabled();
  await author.getByRole('button', { name: 'Previous highlight', exact: true }).click();
  reader = await login(viewer);
  await reader.getByRole('button', { name: 'Like moment', exact: true }).first().click();
  await check.poll(async () => (await checked(stack.admin.from('moment_reactions').select('moment_id').eq('profile_id', viewer.id).eq('tournament_id', tournament.id))).length).toBe(1);
  await reader.getByRole('button', { name: 'View comments on moment by ' + owner.name, exact: true }).first().click();
  await reader.getByRole('textbox', { name: 'Comment on moment by ' + owner.name, exact: true }).first().fill('Great game ' + run);
  await reader.getByRole('button', { name: 'Send comment on moment by ' + owner.name, exact: true }).first().click();
  await check(reader.getByText('Great game ' + run, { exact: false })).toBeVisible();
  await reader.getByRole('button', { name: 'Report moment by ' + owner.name, exact: true }).first().click();
  await reader.getByRole('button', { name: 'Report moment', exact: true }).click();
  await check(reader.getByRole('alert').first()).toContainText('Report received');
  await author.getByRole('button', { name: 'Remove moment by ' + owner.name, exact: true }).first().click();
  await author.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await checked(stack.admin.from('match_moments').select('id').eq('tournament_id', tournament.id).eq('status', 'PUBLISHED'))).length, 2);
  await author.getByRole('button', { name: 'Remove moment by ' + owner.name, exact: true }).first().click();
  await author.getByRole('button', { name: 'Remove moment', exact: true }).click();
  await check.poll(async () => (await checked(stack.admin.from('match_moments').select('id').eq('tournament_id', tournament.id).eq('status', 'PUBLISHED'))).length).toBe(1);
  // Read failure tests the rendered image fallback, without fabricating content.
  await reader.route('**/storage/v1/object/sign/match-moments/**', route => route.request().method() === 'GET' ? route.abort('failed') : route.continue());
  await reader.reload({ waitUntil: 'domcontentloaded' });
  await check(reader.getByRole('button', { name: 'Like moment', exact: true })).toHaveCount(1);
  await check(reader.getByText('Photo unavailable', { exact: true }).first()).toBeVisible();
  await reader.setViewportSize({ width: 320, height: 900 });
  assert.ok(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await reader.screenshot({ path: '.e2e/r8-moments-' + browserName + '.png', fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile('.e2e/r8-moments-' + browserName + '-evidence.json', JSON.stringify({ recordedAt: new Date().toISOString(), browser: browserName, version: browser.version(), passed: true, cases: ['real upload', 'failed upload retains caption/photo', 'retry publishes once', 'visible highlight navigation', 'independent reaction/comment/report', 'remove cancel/confirm', 'image fallback', '320px overflow'], firstMomentId: first.id }, null, 2));
  console.info('PASS ' + browserName + ' Moments uploads/retry/highlights, independent discussion/report, confirmation and fallback');
} catch (error) {
  for (const page of [author, reader].filter(Boolean)) { console.error((await page.locator('body').innerText()).slice(0, 4000)); await page.screenshot({path: '.e2e/moments-' + browserName + '-failure.png',fullPage: true}); }
  throw error;
} finally {
  const media = await checked(stack.admin.from('moment_media').select('storage_path,match_moments!inner(tournament_id)').eq('match_moments.tournament_id', tournament.id));
  if (media.length) await checked(stack.admin.storage.from('match-moments').remove(media.map(row => row.storage_path)));
  await checked(client.rpc('delete_owned_tournament', { p_tournament_id: tournament.id }));
  await client.auth.signOut({ scope: 'local' });
  await browser.close();
}
