import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients();
const owner = fixture.accounts[0];
const runName = 'Tournament Form Review ' + randomUUID();
const createdIds = [];
const errors = [];
let browser;
await expect.poll(async () => {
  try { return (await fetch('http://127.0.0.1:4173/auth', { signal: AbortSignal.timeout(10000) })).ok; } catch { return false; }
}, { timeout: 120000 }).toBe(true);
try {
  browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto('http://127.0.0.1:4173/auth?returnTo=' + encodeURIComponent('/wricket'), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill(owner.email);
  await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith('/wricket'));
  const chooseFormat = async name => {
    await page.getByRole('button', { name: 'Choose tournament format', exact: true }).click();
    await page.getByRole('radio', { name, exact: true }).click();
    await expect(page.getByRole('radio', { name, exact: true })).toHaveCount(0);
  };
  try {
    await page.goto('http://127.0.0.1:4173/wricket/tournament/new');
    await expect(page.getByText('Set the stage.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create tournament', exact: true })).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: 'Overs per match', exact: true })).toHaveValue('10');
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.getByText('Set the stage.', { exact: true }).evaluate(element => getComputedStyle(element).fontFamily), 'SpaceGrotesk_600SemiBold');
    assert.equal(await page.getByText('Set the stage.', { exact: true }).evaluate(element => getComputedStyle(element).fontSize), '27px');
    assert.equal(await page.getByRole('textbox', { name: 'Tournament name', exact: true }).evaluate(element => getComputedStyle(element).fontFamily), 'Inter_400Regular');
    assert.equal(await page.getByRole('textbox', { name: 'Tournament name', exact: true }).evaluate(element => getComputedStyle(element).fontSize), '12px');
    await page.screenshot({ path: '.e2e/new-tournament-376.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
    await expect(page.getByText('Give your tournament a name.', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Tournament name', exact: true }).fill(runName);
    await page.getByRole('textbox', { name: 'Planned teams', exact: true }).fill('1');
    await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
    await expect(page.getByText('Choose between 2 and 64 teams.', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Planned teams', exact: true }).fill('8');
    await page.getByRole('textbox', { name: 'Squad size', exact: true }).fill('26');
    await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
    await expect(page.getByText('Choose between 2 and 25 players per team.', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Squad size', exact: true }).fill('11');
    for (const [label, overs, players] of [['Box Cricket', '5', '6'], ['T20', '20', '11'], ['T10', '10', '11'], ['ODI', '50', '11'], ['Turf cricket', '10', '11'], ['Test', '90', '11']]) {
      await chooseFormat(label);
      await expect(page.getByRole('textbox', { name: label === 'Test' ? 'Overs per innings' : 'Overs per match', exact: true })).toHaveValue(overs);
      await expect(page.getByRole('textbox', { name: 'Squad size', exact: true })).toHaveValue(players);
      await expect(page.getByRole('textbox', { name: 'Tournament name', exact: true })).toHaveValue(runName);
    }
    await expect(page.getByRole('textbox', { name: 'Overs per match', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose tournament format', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Test', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Keep current format', exact: true }).click();
    await page.getByRole('textbox', { name: 'Overs per innings', exact: true }).fill('0');
    await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
    await expect(page.getByText('Choose between 1 and 100 overs per innings.', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Overs per innings', exact: true }).fill('72');
    await page.getByRole('textbox', { name: 'Planned teams', exact: true }).fill('4');
    await page.getByLabel('Starts on', { exact: true }).fill('2026-11-10');
    await page.getByLabel('Start time', { exact: true }).fill('15:00');
    await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
    await expect(page.getByText('Enter a valid organiser contact number.', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Organiser phone number', exact: true }).fill('+91 90000 00000');
    await page.getByRole('button', { name: 'Add venue, artwork & details', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Location', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose logo', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose 16:9 banner', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Four teams playing two innings per side.');
    await page.getByRole('textbox', { name: 'Social media link', exact: true }).fill('invalid');
    await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
    await expect(page.getByText('Enter a full link beginning with http:// or https://.', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Social media link', exact: true }).fill('https://example.com/tournament');
    await expect(page.getByText('Check your tournament details', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Hide venue, artwork & details', exact: true }).click();
    await page.getByRole('button', { name: 'Add venue, artwork & details', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Four teams playing two innings per side.');
    assert.ok((await page.getByRole('button', { name: 'Choose logo', exact: true }).boundingBox()).width >= 80);
    await page.getByRole('button', { name: 'Choose logo', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.e2e/new-tournament-details.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Hide venue, artwork & details', exact: true }).click();
    await page.setViewportSize({ width: 320, height: 820 });
    await page.getByTestId('new-tournament-form').evaluate(element => { element.scrollTop = 0; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: '.e2e/new-tournament-test-320.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 376, height: 900 });
    await page.route('**/rest/v1/tournaments*', async route => route.request().method() === 'POST' ? route.abort() : route.continue(), { times: 1 });
    await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
    await expect(page.getByText('Check your tournament details', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Overs per innings', exact: true })).toHaveValue('72');
    await expect(page.getByRole('textbox', { name: 'Tournament name', exact: true })).toHaveValue(runName);
    assert.deepEqual(await checked(stack.admin.from('tournaments').select('id').eq('name', runName).eq('created_by', owner.id)), []);
    await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith('/wricket/tournament/') && !url.pathname.endsWith('/new'));
    const created = await checked(stack.admin.from('tournaments').select('id,format,planned_team_count,players_per_team,overs_per_match,start_at,description,social_media_url,visibility').eq('name', runName).eq('created_by', owner.id).single());
    createdIds.push(created.id);
    assert.equal(created.format, 'TURF_TEST'); assert.equal(created.overs_per_match, 72); assert.equal(created.planned_team_count, 4); assert.equal(created.players_per_team, 11); assert.equal(created.visibility, 'PRIVATE');
    assert.equal(created.description, 'Four teams playing two innings per side.'); assert.equal(created.social_media_url, 'https://example.com/tournament');
    const localSchedule = new Date(created.start_at); assert.equal(localSchedule.getFullYear(), 2026); assert.equal(localSchedule.getMonth(), 10); assert.equal(localSchedule.getDate(), 10); assert.equal(localSchedule.getHours(), 15); assert.equal(localSchedule.getMinutes(), 0);
    await page.goto('http://127.0.0.1:4173/wricket/tournament/new');
    await page.getByRole('textbox', { name: 'Tournament name', exact: true }).fill(runName + ' Turf');
    await page.getByRole('textbox', { name: 'Overs per match', exact: true }).fill('12');
    await page.getByRole('textbox', { name: 'Organiser phone number', exact: true }).fill('+91 90000 00000');
    await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith('/wricket/tournament/') && !url.pathname.endsWith('/new'));
    const turf = await checked(stack.admin.from('tournaments').select('id,format,overs_per_match,players_per_team,planned_team_count').eq('name', runName + ' Turf').eq('created_by', owner.id).single());
    createdIds.push(turf.id);
    assert.equal(turf.format, 'TURF'); assert.equal(turf.overs_per_match, 12); assert.equal(turf.players_per_team, 11); assert.equal(turf.planned_team_count, 8);
    assert.deepEqual(errors, []);
    console.log('PASS: approved form hierarchy/fonts and 320px layout; all six format defaults; Test innings label and validation; format cancel; date/time; required contact; optional fields retained; failed creation/retry; Test and Turf persisted with unchanged parameters and private visibility.');
  } catch (error) {
    console.error(error.stack ?? error); console.error('Browser state: ' + page.url() + '\n' + (await page.locator('body').innerText()).slice(0, 4500));
    await page.screenshot({ path: '.e2e/new-tournament-failure.png', fullPage: true }).catch(() => undefined); throw error;
  }
} finally {
  await browser?.close();
  // Include any successfully committed row if a later assertion failed before its ID was recorded.
  const owned = await checked(stack.admin.from('tournaments').select('id').in('name', [runName, runName + ' Turf']).eq('created_by', owner.id));
  for (const id of new Set([...createdIds, ...owned.map(item => item.id)])) await checked(stack.admin.from('tournaments').delete().eq('id', id).eq('created_by', owner.id));
}
