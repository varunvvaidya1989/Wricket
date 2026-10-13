import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import { localClients, checked, manifestPath } from './backend-fixture.mjs';

const expect = baseExpect.configure({ timeout: 30000 });
await expect.poll(async () => {
  try { return (await fetch('http://127.0.0.1:4173/status', { signal: AbortSignal.timeout(10000) })).ok; }
  catch { return false; }
}, { timeout: 180000, intervals: [1000, 3000, 5000] }).toBe(true);
const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const privacy = JSON.parse(await readFile(new URL('../../.e2e/r1.json', import.meta.url), 'utf8'));
const stack = await localClients();
const matches = await checked(stack.admin.from('matches').select('id').eq('created_by', fixture.accounts[0].id).limit(1));
assert.ok(matches.length, 'A real match from the setup fixture is required');
const browser = await chromium.launch({ channel: process.env.WRICKET_E2E_CHROME_CHANNEL || 'chrome' });
const output = new URL('../../.e2e/r1-screenshots/', import.meta.url);
await mkdir(output, { recursive: true });
let page;
async function login(account, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  // Exercise the browser download fallback. Native OS share acceptance is separate.
  await context.addInitScript(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); });
  const errors = [];
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(120000);
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) console.log('ROUTE', new URL(frame.url()).pathname); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/auth?returnTo=%2Fwricket', { timeout: 120000, waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill(account.email);
  await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/live');
  return { context, errors };
}
async function root() {
  await page.goto('http://127.0.0.1:4173/wricket', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: 'Now', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tablist')).toHaveCount(1);
}
async function noPhone() {
  await expect(page.locator('body')).not.toContainText(privacy.phone);
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
}
try {
  for (const width of (process.env.WRICKET_E2E_VIEWER_ONLY ? [] : [376, 320, 1280])) {
    const { context, errors } = await login(fixture.accounts[0], width);
    await root();
    await expect(page.getByRole('button', { name: /^View .+ versus / }).first()).toBeVisible();
    await expect(page.getByText('Loading your tasks…', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: fileURLToPath(new URL(`now-${width}.png`, output)), fullPage: true });
    const titleStyle = await page.getByText('Good day for cricket.', { exact: true }).evaluate(element => { const style = getComputedStyle(element); return { font: style.fontFamily, size: style.fontSize, line: style.lineHeight, spacing: style.letterSpacing }; });
    assert.equal(titleStyle.font, 'SpaceGrotesk_600SemiBold');
    assert.equal(titleStyle.size, '27px');
    assert.equal(titleStyle.line, '30.51px');
    assert.equal(titleStyle.spacing, '-0.7px');
    await page.getByRole('tab', { name: 'My cricket', exact: true }).click();
    await expect(page.getByText('Continue scoring', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Manage your tournament', { exact: true })).toBeVisible();
    await page.screenshot({ path: fileURLToPath(new URL(`my-${width}.png`, output)), fullPage: true });
    await page.getByRole('button', { name: 'My matches', exact: true }).click();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'My cricket', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'My tournaments', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create tournament', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await page.getByRole('tab', { name: 'Explore', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search cricket' }).fill('R1 International');
    await expect(page.getByRole('button', { name: privacy.tournament.name, exact: true })).toBeVisible();
    await page.screenshot({ path: fileURLToPath(new URL(`explore-${width}.png`, output)), fullPage: true });
    await page.getByRole('button', { name: privacy.tournament.name, exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Matches', exact: true })).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(1);
    await noPhone();
    await page.getByRole('tab', { name: 'Standings', exact: true }).click();
    await expect(page).toHaveURL(/tab=table/);
    await page.getByRole('tab', { name: 'Matches', exact: true }).click();
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await noPhone();
    await page.screenshot({ path: fileURLToPath(new URL(`tournament-about-${width}.png`, output)), fullPage: true });
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await page.getByRole('button', { name: 'Share tournament', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close share preview', exact: true })).toBeVisible();
    await noPhone();
    await page.screenshot({ path: fileURLToPath(new URL(`share-${width}.png`, output)), fullPage: true });
    if (width === 376) { const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Share or download image', exact: true }).click(); const download = await downloadPromise; await download.saveAs(fileURLToPath(new URL('exported-tournament.png', output))); }
    await page.getByRole('button', { name: 'Close share preview', exact: true }).click();
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await expect(page.getByText('Tournament details', { exact: true })).toBeVisible();
    await page.goto(`http://127.0.0.1:4173/wricket/match/${matches[0].id}/live?tab=scorecard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: 'Scorecard', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tablist')).toHaveCount(1);
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await expect(page).toHaveURL(/tab=summary/);
    await root();
    await page.getByRole('button', { name: 'Switch sport', exact: true }).click();
    await expect(page).toHaveURL(/\/apps/);
    await root();
    await page.getByRole('button', { name: 'Open account', exact: true }).click();
    await expect(page).toHaveURL(/\/account/);
    assert.deepEqual(errors, [], 'No browser runtime exceptions');
    await context.close();
    console.log(`PASS: root, collections, search, tournament, share, match tabs and sport/account exits at ${width}px.`);
  }
  const { context, errors } = await login(fixture.accounts.find(account => account.name === 'R0 Viewer'), 390);
  await page.goto(`http://127.0.0.1:4173/wricket/tournament/${privacy.tournament.id}?tab=settings`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Owner access required', { exact: true })).toBeVisible();
  await noPhone();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Matches', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS: viewer cold link, denied Manage and no phone in spectator DOM.');
} catch (error) {
  if (page && !page.isClosed()) {
    console.error((await page.locator('body').innerText()).slice(0, 6000));
    await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)), fullPage: true });
  }
  throw error;
} finally { await browser.close(); }
