import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { reviewAccessibility } from './accessibility-review.mjs';
import { signedClients, checked } from './signed-release-fixture.mjs';
const expect = baseExpect.configure({ timeout: 30000 });
const origin = process.argv[2];
const exportDir = process.env.REVIEW_EXPORT_DIR ?? 'dist';
assert.match(origin ?? '', /^(?:http:\/\/127\.0\.0\.1:418[01]|https:\/\/sportstageapp(?:--[a-z0-9]+)?\.expo\.app)$/);
const label = origin.startsWith('http://') ? 'local-export' : origin.includes('--') ? 'preview' : 'production';
const phase = process.env.REVIEW_PHASE ?? 'coverage2';
assert.match(phase, /^[a-z0-9-]+$/);
const evidence = `.e2e/web-release/${phase}-${label}`;
await mkdir(evidence, { recursive: true });
const stack = await signedClients();
const run = randomUUID();
const email = `wricket-form-${run}@example.test`;
const password = `Form!${randomBytes(18).toString('hex')}`;
let accountId;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const report = { origin, label, widths: [320, 390, 1280], checks: [], pageErrors: errors };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function visit(route) {
  await pause(label === 'local-export' ? 500 : 10000);
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try { response = await page.goto(`${origin}${route}`); }
    catch (error) {
      if (attempt >= 2 || !/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NETWORK_CHANGED/.test(String(error))) throw error;
      console.info('Browser network lookup failed; waiting before bounded retry.');
      await pause(15000); continue;
    }
    if (response.status() === 429) { await pause(30000); continue; }
    assert.equal(response.status(), 200);
    await expect(page.getByText('Opening your stage', { exact: true })).toHaveCount(0);
    return;
  }
  throw new Error('Hosting is still throttled');
}
async function capture(name, title) {
  await expect(page.getByText('Opening your stage', { exact: true })).toHaveCount(0);
  const back = page.getByRole('button', { name: 'Back', exact: true });
  if (name !== 'create-competition' && await back.count()) await back.click({ trial: true });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (title) {
    const typography = await page.getByText(title, { exact: true }).evaluate(element => ({ size: getComputedStyle(element).fontSize, font: getComputedStyle(element).fontFamily }));
    assert.equal(typography.size, '29px'); assert.match(typography.font, /SpaceGrotesk/);
  }
  if (process.env.REVIEW_A11Y === '1') await reviewAccessibility(page, name, report);
  await page.screenshot({ path: `${evidence}/${name}.png`, animations: 'disabled' });
  console.info(`Reviewed ${name}`);
}
try {
  await visit('/live');
  const script = await page.locator('script[src]').evaluateAll(elements => elements.map(element => new URL(element.src).pathname).find(path => path.includes('/_expo/static/js/web/entry-')));
  const remote = Buffer.from(await (await fetch(`${origin}${script}`)).arrayBuffer());
  assert.deepEqual(remote, await readFile(`${exportDir}/client${script}`));
  report.bundleSHA256 = createHash('sha256').update(remote).digest('hex');
  const { user } = await checked(stack.admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { web_release_run: run } }));
  accountId = user.id;
  const client = stack.client(); await checked(client.auth.signInWithPassword({ email, password }));
  await checked(client.rpc('save_my_sports', { p_display_name: `Form reviewer ${run.slice(0,8)}`, p_sport_codes: ['BADMINTON','CRICKET'], p_primary_sport_code: 'BADMINTON' }));
  await visit('/auth?returnTo=%2Fprofile');
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/profile');
  await visit('/manual');
  for (const width of report.widths) { await page.setViewportSize({ width, height: 900 }); await capture(`help-${width}`, 'What are you trying to do?'); }
  await page.getByRole('button', { name: /^Score a match,/ }).click();
  await expect(page.getByText('From setup to the first rally.', { exact: true })).toBeVisible();
  await visit('/manual?task=scoring');
  for (const width of report.widths) { await page.setViewportSize({ width, height: 900 }); await capture(`scoring-guide-${width}`, 'From setup to the first rally.'); }
  await expect(page.getByText(/Cricket uses its own Numbers/)).toBeVisible();
  await page.getByRole('button', { name: 'Start a match', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/start-match');
  await visit('/manual');
  await page.getByRole('textbox', { name: 'Search help', exact: true }).fill('no-such-guide-review');
  await expect(page.getByText('No guide found. Try scoring, teams or competitions.', { exact: true })).toBeVisible();
  await capture('help-no-results');
  report.checks.push('Task-based help and scoring guide at three widths; 29px Space Grotesk headings; direct guide refresh, real match-launch destination, empty search');
  await page.setViewportSize({ width: 390, height: 900 });
  await visit('/wricket/ay-profile-link');
  await expect(page.getByText('Is this your record?', { exact: true })).toBeVisible();
  await expect(page.getByText('Checking your previous record\u2026', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Connect player profile', exact: true })).toHaveCount(0);
  await capture('record-link');
  await page.route('**/rest/v1/rpc/resolve_auction_yodha_link', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Controlled record lookup failure' }) }));
  await visit('/wricket/ay-profile-link');
  await expect(page.getByText('Could not check your previous record.', { exact: true })).toBeVisible();
  await capture('record-link-error');
  await page.unroute('**/rest/v1/rpc/resolve_auction_yodha_link');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Could not check your previous record.', { exact: true })).toHaveCount(0);
  report.checks.push('Standalone record-link screen retains identity boundary and recoverable lookup errors without claiming a record');
  await visit('/badminton/competitions');
  await page.getByRole('button', { name: 'Create a competition', exact: true }).click();
  const inputFont = await page.getByPlaceholder('Competition name', { exact: true }).evaluate(element => ({ size: getComputedStyle(element).fontSize, font: getComputedStyle(element).fontFamily }));
  assert.equal(inputFont.size, '13px'); assert.match(inputFont.font, /Inter_400Regular/);
  await capture('create-competition');
  await page.getByLabel('Close', { exact: true }).click();
  report.checks.push('Competition creation dialog uses 13px Inter Regular and closes without saving');
  await visit('/account?section=data');
  let deletionCalls = 0;
  await page.route('**/rest/v1/rpc/delete_my_sportstage_account', route => { deletionCalls++; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Controlled deletion failure' }) }); });
  await page.getByRole('button', { name: 'Clear device data', exact: true }).click();
  await expect(page.getByText('Clear this device?', { exact: true })).toBeVisible();
  await capture('clear-data-review', 'Clear this device?');
  await page.getByRole('button', { name: 'Keep my data', exact: true }).click();
  await page.getByRole('button', { name: 'Review account deletion', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Permanently delete account', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Type DELETE to confirm', exact: true }).fill('DELETE');
  for (const width of report.widths) { await page.setViewportSize({ width, height: 900 }); await capture(`delete-review-${width}`, 'Delete your account?'); }
  await expect(page.getByRole('button', { name: 'Permanently delete account', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Keep my data', exact: true }).click();
  assert.equal(deletionCalls, 0);
  assert.equal((await checked(stack.admin.auth.admin.getUserById(accountId))).user.id, accountId);
  await page.getByRole('button', { name: 'Review account deletion', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Type DELETE to confirm', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Keep my data', exact: true }).click();
  await page.getByRole('button', { name: 'Review account deletion', exact: true }).click();
  await page.getByRole('textbox', { name: 'Type DELETE to confirm', exact: true }).fill('DELETE');
  await page.getByRole('button', { name: 'Permanently delete account', exact: true }).evaluate(element => { element.click(); element.click(); });
  await expect(page.getByText('Could not delete account. Please try again.', { exact: true })).toBeVisible();
  assert.equal(deletionCalls, 1);
  assert.equal((await checked(stack.admin.auth.admin.getUserById(accountId))).user.id, accountId);
  await capture('delete-failure');
  await page.getByRole('button', { name: 'Keep my data', exact: true }).click();
  await page.unroute('**/rest/v1/rpc/delete_my_sportstage_account');
  report.checks.push('Controlled deletion failure remains visible and rapid-repeat confirm sends one request; real deletion is reserved for compatibility acceptance');
  report.checks.push('Device clearing and deletion have explicit cancellable review; typed DELETE gate, reset after cancel, no deletion RPC on review/cancel and account survives');
  assert.deepEqual(errors, []);
  report.status = 'PASS';
} finally {
  await browser.close();
  if (accountId) {
    const { user } = await checked(stack.admin.auth.admin.getUserById(accountId));
    assert.equal(user.user_metadata.web_release_run, run);
    await checked(stack.admin.auth.admin.deleteUser(accountId));
  }
  report.fixtureRemoved = true;
  await writeFile(`${evidence}/review.json`, JSON.stringify(report, null, 2));
}
console.info(JSON.stringify(report));
