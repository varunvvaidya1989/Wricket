import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';

const expect = baseExpect.configure({ timeout: 30000 });
await mkdir('.e2e/web-release', { recursive: true });
const origin = process.argv[2];
assert.match(origin ?? '', /^https:\/\/sportstageapp(?:--[a-z0-9]+)?\.expo\.app$/);
const label = origin.includes('--') ? 'preview' : 'production';
const fixture = JSON.parse(await readFile('.e2e/signed-release/private/fixture.json', 'utf8'));
assert.equal(fixture.cleaned, false);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(60000);
const runtimeErrors = [];
page.on('pageerror', error => runtimeErrors.push(error.message));
const routes = [];
try {
  const home = await page.goto(origin);
  assert.equal(home.status(), 200);
  assert.equal(home.headers()['cross-origin-opener-policy'], 'same-origin');
  assert.equal(home.headers()['cross-origin-embedder-policy'], 'credentialless');
  await expect(page.getByText('Back to your game.', { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  const scripts = await page.locator('script[src]').evaluateAll(elements => elements.map(element => new URL(element.src).pathname));
  await page.screenshot({ path: `.e2e/web-release/${label}-home.png`, fullPage: true });
  await page.goto(`${origin}/auth?returnTo=${encodeURIComponent(`/tournament?id=${fixture.tournamentId}`)}`);
  await page.getByRole('button', { name: 'Back', exact: true }).click({ trial: true });
  await expect(page.getByText('Opening your stage', { exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(fixture.accounts[0].email);
  await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith('/wricket/tournament/'));
  await expect(page.getByText(`Signed upgrade acceptance ${fixture.run}`, { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Teams', exact: true })).toBeVisible();
  routes.push({ path: new URL(page.url()).pathname, sharedPath: `/tournament?id=${fixture.tournamentId}`, refresh: true });
  await page.getByRole('tab', { name: 'Teams', exact: true }).click();
  await expect(page.getByText(`RC A ${fixture.run.slice(0, 8)}`, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `.e2e/web-release/${label}-teams.png`, fullPage: true });
  await page.getByRole('tab', { name: 'Matches', exact: true }).click();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await expect(page.getByText('ORGANISER WORKSPACE', { exact: true })).toBeVisible();
  const workspaceUrl = page.url();
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: `.e2e/web-release/${label}-workspace-320.png`, fullPage: true });
  await page.getByRole('button', { name: 'Fixture plan', exact: true }).click();
  await expect(page.getByText('A plan for every game.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('A plan for every game.', { exact: true })).toBeVisible();
  routes.push({ path: new URL(page.url()).pathname, refresh: true });
  await page.goto(workspaceUrl);
  await page.getByRole('button', { name: 'Registrations', exact: true }).click();
  await expect(page.getByText('ORGANISER WORKSPACE', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `.e2e/web-release/${label}-registrations.png`, fullPage: true });
  await page.goto(`${origin}/wricket/match/${fixture.matches[0].id}/live`);
  await expect(page.getByText('RC A', { exact: false }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('RC A', { exact: false }).first()).toBeVisible();
  routes.push({ path: new URL(page.url()).pathname, refresh: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(workspaceUrl);
  await expect(page.getByText('ORGANISER WORKSPACE', { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(runtimeErrors, []);
  const result = { recordedAt: new Date().toISOString(), origin, label, passed: true,
    passwordLogin: true, organiserWorkspace: true, teams: true, registrations: true,
    fixturePlan: true, directRoutes: routes, widths: [320, 390, 1280],
    crossOriginIsolated: true, runtimeErrors, scripts };
  await writeFile(`.e2e/web-release/${label}-verification.json`, JSON.stringify(result, null, 2));
  console.info(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
