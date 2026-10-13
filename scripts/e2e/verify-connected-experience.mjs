import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect as playwrightExpect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';
const expect = playwrightExpect.configure({ timeout: 30000 });

// Uses only the existing disposable local fixture; never reads hosted credentials.
const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(fixture.cleaned, false, 'Seed the local E2E fixture first');
const stack = await localClients();
const account = fixture.accounts.at(-1);
const client = stack.client();
await checked(client.auth.signInWithPassword({ email: account.email, password: fixture.password }));
const original = await checked(client.from('account_sports').select('sport_id,is_primary,access_status').eq('account_id', account.id));
const catalog = await checked(client.from('sports').select('id,code'));
const originalCodes = original.map(row => catalog.find(sport => sport.id === row.sport_id)?.code).filter(Boolean);
const primary = catalog.find(sport => sport.id === original.find(row => row.is_primary)?.sport_id)?.code ?? originalCodes[0];
assert.equal(original.every(row => row.access_status === 'ACTIVE'), true, 'Use an active local test account');
const errors = [];
const report = { date: '2026-10-12', target: stack.backendURL, checks: [], visuals: [], pageErrors: errors };
const base = 'http://127.0.0.1:4173';
const evidence = '.e2e/rest-of-app-ux1';
await mkdir(evidence, { recursive: true });
await expect.poll(async () => {
  try { return (await fetch(`${base}/live`, { signal: AbortSignal.timeout(10000) })).ok; }
  catch { return false; }
}, { timeout: 120000 }).toBe(true);
const browser = await chromium.launch({ channel: 'chrome' });
const visible = locator => locator.filter({ visible: true });
async function pageFor(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));
  return page;
}
async function rootNav(page) {
  const tabs = visible(page.getByRole('button', { name: /^(Now|My sports|Explore)(, current page)?$/ }));
  await expect(tabs.first()).toBeVisible();
  await expect(tabs).toHaveCount(3);
  assert.deepEqual(await tabs.allTextContents(), ['Now', 'My sports', 'Explore']);
  await expect.poll(async () => (await tabs.first().boundingBox())?.y ?? 1000).toBeLessThan(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'No horizontal page overflow');
}
async function capture(page, name, focused = false) {
  // A hydrated screen may sit behind the launch animation after direct refresh.
  // Trial click waits for the actual visible, usable screen without navigating.
  await page.getByRole('button', { name: focused ? 'Back' : 'Switch sport', exact: true }).click({ trial: true });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText('Opening your stage', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: `${evidence}/${name}.png`, animations: 'disabled' });
}
async function signIn(page) {
  if (await page.getByRole('button', { name: 'Sign in with password', exact: true }).isVisible()) await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill(account.email);
  await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
try {
  for (const width of [320, 390, 1280]) {
    const page = await pageFor(width);
    await page.goto(`${base}/live`);
    await expect(page.getByText('Back to your game.', { exact: true })).toBeVisible();
    await rootNav(page);
    await page.getByRole('button', { name: 'Switch sport', exact: true }).click({ trial: true });
    await expect(page.getByText('Opening your stage', { exact: true })).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const design = await page.getByText('Back to your game.', { exact: true }).evaluate(element => {
      const style = getComputedStyle(element);
      return { font: style.fontFamily, size: style.fontSize, color: style.color };
    });
    assert.match(design.font, /SpaceGrotesk_600SemiBold/);
    assert.equal(design.size, '29px'); assert.equal(design.color, 'rgb(240, 244, 239)');
    const bodyFont = await page.getByText('A little cricket. A little court time. All in one place.', { exact: true }).evaluate(element => ({ font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize }));
    const labelFont = await page.getByText('YOUR SPORTS', { exact: true }).evaluate(element => ({ font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize }));
    assert.match(bodyFont.font, /Inter_400Regular/); assert.equal(bodyFont.size, '12px');
    assert.match(labelFont.font, /IBMPlexMono_500Medium/); assert.equal(labelFont.size, '10px');
    await capture(page, `home-${width}`);
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect(page.getByText('Find your next game.', { exact: true })).toBeVisible();
    await rootNav(page);
    await page.getByRole('textbox', { name: 'Search all sports', exact: true }).fill('Northstar');
    await page.getByRole('radio', { name: 'Teams', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Search all sports', exact: true })).toHaveValue('Northstar');
    await expect(page.getByRole('radio', { name: 'Teams', exact: true })).toHaveAttribute('aria-checked', 'true');
    await capture(page, `explore-${width}`);
    await page.getByRole('button', { name: 'Switch sport', exact: true }).click();
    await expect(page.getByText('Where to next?', { exact: true })).toBeVisible();
    await expect(visible(page.getByRole('tab'))).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(6);
    await capture(page, `switcher-${width}`, true);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Search all sports', exact: true })).toHaveValue('Northstar');
    await expect(page.getByRole('radio', { name: 'Teams', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Now', exact: true }).click();
    await page.getByRole('button', { name: 'Start a match', exact: true }).click();
    await expect(page.getByText('Which sport today?', { exact: true })).toBeVisible();
    await expect(visible(page.getByRole('tab'))).toHaveCount(0);
    await capture(page, `launcher-${width}`, true);
    report.visuals.push({ width, ...design, noOverflow: true, topNavigation: true });
    await page.context().close();
  }
  report.checks.push('Guest roots, focused switcher and launcher at 320/390/1280; search/filter direct refresh and Back; fonts and title size');

  const page = await pageFor(390);
  await page.goto(`${base}/start-match`);
  await page.getByRole('button', { name: 'Set up Cricket', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/auth');
  assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/wricket/match/new');
  await signIn(page);
  await page.waitForURL(url => url.pathname === '/wricket/match/new');
  report.checks.push('Cricket setup survives guest sign-in; existing scoring access gate remains in place');
  await page.goto(`${base}/apps`);
  await expect(page.getByText('Made for your game.', { exact: true })).toBeVisible();
  await rootNav(page);
  await capture(page, 'my-sports-390');
  await page.getByRole('button', { name: 'Switch sport', exact: true }).click();
  await page.getByRole('button', { name: 'Open Badminton', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/account');
  await expect(page.getByText('Connect Badminton to continue', { exact: true })).toBeVisible();
  await page.goto(`${base}/start-match`);
  await page.getByRole('button', { name: 'Set up Badminton', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/account');
  assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/badminton/match/new');
  await page.getByRole('checkbox', { name: 'Badminton', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/badminton/match/new');
  report.checks.push('Unconnected sport carries chosen setup through account save and profile refresh');
  await page.goto(`${base}/explore`);
  await expect(page.getByRole('button', { name: 'Your profile', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch sport', exact: true }).click({ trial: true });
  await page.getByRole('textbox', { name: 'Search all sports', exact: true }).fill(fixture.teams[0].name);
  await page.getByRole('radio', { name: 'Teams', exact: true }).click();
  await visible(page.getByText(fixture.teams[0].name, { exact: true })).click();
  await page.waitForURL(url => url.pathname === `/wricket/team/${fixture.teams[0].id}`);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Search all sports', exact: true })).toHaveValue(fixture.teams[0].name);
  await expect(page.getByRole('radio', { name: 'Teams', exact: true })).toHaveAttribute('aria-checked', 'true');
  report.checks.push('Authorised team search opens the real team; Back restores query and category');
  // A controlled response reviews the live-card layout without fabricating any
  // persisted match, scoring events or production data.
  await page.route('**/rest/v1/rpc/discover_sportstage_live', route => route.fulfill({ json: [{
    scoring_match_id: '00000000-0000-4000-8000-000000000001', sport_id: catalog.find(sport => sport.code === 'CRICKET').id,
    sport_code: 'CRICKET', competition_name: 'Layout review fixture', participant_a: 'Northstar Community Cricket Club', participant_b: 'City Cricket Academy',
    status: 'LIVE', headline_score: '147/4 (18.2)', refreshed_at: new Date().toISOString(), stale_after: new Date(Date.now() + 600000).toISOString(), share_slug: 'layout-review',
  }] }));
  await page.route('**/rest/v1/rpc/discover_sportstage_upcoming', route => route.fulfill({ json: [] }));
  await page.goto(`${base}/live`);
  await expect(page.getByText('Northstar Community Cricket Club', { exact: true })).toBeVisible();
  await capture(page, 'home-live-layout-390');
  report.checks.push('Controlled live-card visual review: wrapping participants and score; no persisted match created');
  await page.context().close();

  const failed = await pageFor(390);
  await failed.route('**/rest/v1/rpc/discover_sportstage_*', route => route.abort());
  await failed.goto(`${base}/live`);
  await failed.getByRole('button', { name: 'Switch sport', exact: true }).click({ trial: true });
  await expect(failed.getByText('Some matches could not be loaded. Check your connection and try again.', { exact: true })).toBeVisible();
  await expect(failed.getByText('No public matches are live right now. Explore competitions and upcoming games.', { exact: true })).toHaveCount(0);
  await capture(failed, 'home-load-error-390');
  report.checks.push('Failed live request is displayed as failure, with retry, rather than empty matches');
  assert.deepEqual(errors, []);
  report.result = 'PASS';
  await writeFile(`${evidence}/review.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, checks: report.checks, pageErrors: errors.length, evidence }));
} finally {
  await checked(client.rpc('save_my_sports', { p_display_name: account.name, p_sport_codes: originalCodes, p_primary_sport_code: primary }));
  await client.auth.signOut({ scope: 'local' });
  await browser.close();
}
