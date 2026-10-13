import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { reviewAccessibility } from './accessibility-review.mjs';
import { signedClients, checked } from './signed-release-fixture.mjs';

const expect = baseExpect.configure({ timeout: 30000 });
const origin = process.argv[2];
const exportDir = process.env.REVIEW_EXPORT_DIR ?? 'dist';
assert.match(origin ?? '', /^(?:http:\/\/127\.0\.0\.1:418[01]$|https:\/\/sportstageapp(?:--[a-z0-9]+)?\.expo\.app$)/);
const label = origin.startsWith('http://127.') ? 'local-export' : origin.includes('--') ? 'preview' : 'production';
const phase = process.env.REVIEW_PHASE ?? 'ux4';
assert.match(phase, /^[a-z0-9-]+$/);
const evidence = `.e2e/web-release/${phase}-${label}`;
await mkdir(evidence, { recursive: true });
const stack = await signedClients();
const run = randomUUID();
const email = `wricket-web-${run}@example.test`;
const password = `Web!${randomBytes(18).toString('hex')}`;
let accountId, competitionId;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
const errors = [];
page.on('pageerror', error => { errors.push(error.message); console.info(`Browser exception: ${error.stack ?? error.message}`); });
const report = { origin, label, widths: [320, 390, 1280], checks: [], pageErrors: errors };
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function visit(target, url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await target.goto(url);
    if (response.status() !== 429) return response;
    console.info('Hosting throttled a browser request; waiting before retry.');
    await pause(30000);
  }
  throw new Error('Hosting remains rate limited after bounded retries');
}
async function capture(name) {
  await expect(page.getByText('Opening your stage', { exact: true })).toHaveCount(0);
  const back = page.getByRole('button', { name: 'Back', exact: true });
  if (await back.count()) await back.click({ trial: true });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.REVIEW_A11Y === '1') await reviewAccessibility(page, name, report);
  await page.screenshot({ path: `${evidence}/${name}.png`, animations: 'disabled' });
  console.info(`Reviewed ${name}`);
}
try {
  const response = await visit(page, `${origin}/live`);
  assert.equal(response.status(), 200);
  assert.equal(response.headers()['cross-origin-opener-policy'], 'same-origin');
  assert.equal(response.headers()['cross-origin-embedder-policy'], 'credentialless');
  await expect(page.getByText('Back to your game.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch sport', exact: true }).click({ trial: true });
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  const script = await page.locator('script[src]').evaluateAll(elements => elements.map(element => new URL(element.src).pathname).find(path => path.includes('/_expo/static/js/web/entry-')));
  assert.ok(script);
  const remote = Buffer.from(await (await fetch(`${origin}${script}`)).arrayBuffer());
  const local = await readFile(`${exportDir}/client${script}`);
  assert.deepEqual(remote, local, 'Hosted JavaScript matches the reviewed export');
  report.bundleSHA256 = createHash('sha256').update(remote).digest('hex');
  for (const width of report.widths) {
    await page.setViewportSize({ width, height: 900 });
    await capture(`home-${width}`);
  }
  report.checks.push('Actual production configuration, isolation headers, guest roots at three widths, hosted JavaScript exactly matches export');
  const { user } = await checked(stack.admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { web_release_run: run } }));
  accountId = user.id;
  const client = stack.client();
  await checked(client.auth.signInWithPassword({ email, password }));
  await checked(client.rpc('save_my_sports', { p_display_name: 'Web release reviewer', p_sport_codes: ['BADMINTON'], p_primary_sport_code: 'BADMINTON' }));
  competitionId = await checked(client.rpc('create_sport_competition_profile', { p_sport_code: 'BADMINTON', p_kind: 'LEAGUE', p_name: `Web release review ${run.slice(0, 8)}`, p_rules: { matchUnitsToWin: 2 }, p_match_format: 'SINGLES', p_visibility: 'PUBLIC', p_timezone: 'Asia/Kolkata', p_planned_entry_count: 8 }));
  const route = `/badminton/competition/${competitionId}`;
  await page.setViewportSize({ width: 390, height: 900 });
  await pause(10000);
  await visit(page, `${origin}/auth?returnTo=${encodeURIComponent(route)}`);
  await page.getByRole('button', { name: 'Back', exact: true }).click({ trial: true });
  await expect(page.getByText('Opening your stage', { exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname === route);
  if (process.env.REVIEW_FOCUS !== 'archive') {
  await page.getByRole('button', { name: 'Manage competition', exact: true }).click();
  await expect(page.getByText('Run a calmer matchday.', { exact: true })).toBeVisible();
  for (const width of report.widths) {
    await page.setViewportSize({ width, height: 900 });
    await pause(5000);
    await visit(page, page.url());
    await page.getByRole('button', { name: 'Back', exact: true }).click({ trial: true });
    await expect(page.getByText('Run a calmer matchday.', { exact: true })).toBeVisible();
    await capture(`workspace-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  for (const section of ['entrants', 'schedule', 'officials', 'resources', 'publish', 'advanced']) {
    await pause(10000);
    await visit(page, `${origin}${route}?section=${section}`);
    await page.getByRole('button', { name: 'Back', exact: true }).click({ trial: true });
    await expect(page.getByText('Opening Badminton competition', { exact: true })).toHaveCount(0);
    await capture(section);
  }
  report.checks.push('Real password sign-in returns to competition; authorised workspace and six task links refresh on hosted backend');
  await pause(10000);
  await visit(page, `${origin}${route}?section=publish`);
  await page.getByRole('button', { name: 'REGISTRATION OPEN', exact: true }).click();
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Confirm state change', exact: true }).click();
  await expect(page.getByText(/Could not change competition status/).filter({ visible: true }).last()).toBeVisible();
  assert.equal((await checked(client.from('sport_competitions').select('lifecycle').eq('id', competitionId).single())).lifecycle, 'DRAFT');
  await page.context().setOffline(false);
  await page.getByRole('button', { name: 'Confirm state change', exact: true }).click();
  await expect.poll(async () => (await checked(client.from('sport_competitions').select('lifecycle').eq('id', competitionId).single())).lifecycle).toBe('REGISTRATION_OPEN');
  report.checks.push('Actual browser offline lifecycle submission keeps the review and draft state; reconnect/retry persists the intended change');
  }
  if (phase === 'coverage1') {
    const key = 'sportstage:racquet-competitions:v1';
    const record = { version: 1, id: 'archive-review', sportId: 'badminton', name: 'Summer Club Series', kind: 'LEAGUE', matchFormat: 'SINGLES', creatorName: 'Archive reviewer', officials: [], pointsRule: { win: 2, loss: 0 }, entrants: [], fixtures: [], createdAt: 1, updatedAt: 1 };
    await page.evaluate(key => localStorage.removeItem(key), key);
    await pause(10000);
    await visit(page, `${origin}/badminton/legacy-competitions`);
    await expect(page.getByText('No archived competitions on this device yet', { exact: true })).toBeVisible();
    await capture('archive-empty');
    await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify([record])), { key, record });
    await pause(10000);
    await visit(page, `${origin}/badminton/legacy-competitions`);
    await expect(page.getByText('Past games still count.', { exact: true })).toBeVisible();
    for (const width of report.widths) { await page.setViewportSize({ width, height: 900 }); await capture(`archive-${width}`); }
    await page.getByRole('button', { name: /Summer Club Series, LEAGUE/ }).click();
    await expect(page.getByText('No fixtures were saved in this archive.', { exact: true })).toBeVisible();
    await expect(page.getByText('No entrants were saved in this archive.', { exact: true })).toBeVisible();
    await capture('archive-detail');
    await expect(page.getByRole('button', { name: /Manage competition|Start match|Create fixture/ })).toHaveCount(0);
    await pause(10000);
    await visit(page, `${origin}/badminton/legacy-competition/missing-review`);
    await expect(page.getByText('Archive not found', { exact: true })).toBeVisible();
    await capture('archive-missing');
    await page.context().addInitScript(() => {
      const read = Storage.prototype.getItem;
      Storage.prototype.getItem = function(key) {
        if (key === 'sportstage:racquet-competitions:v1' && sessionStorage.getItem('archive-read-failure') === 'once') {
          sessionStorage.removeItem('archive-read-failure');
          throw new Error('Controlled archive read failure');
        }
        return read.call(this, key);
      };
    });
    await page.evaluate(() => sessionStorage.setItem('archive-read-failure', 'once'));
    await pause(10000);
    await visit(page, `${origin}/badminton/legacy-competitions`);
    await expect(page.getByText('Your archive is unavailable', { exact: true })).toBeVisible();
    await capture('archive-read-error');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByText('Past games still count.', { exact: true })).toBeVisible();
    await page.route('**/rest/v1/sport_feature_flags*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await pause(10000);
    await visit(page, `${origin}/badminton/competitions`);
    await expect(page.getByText('Competitions are unavailable', { exact: true })).toBeVisible();
    await capture('competition-fallback');
    await page.getByRole('button', { name: 'Open 1 archived competition', exact: true }).click();
    await expect(page.getByText('Past games still count.', { exact: true })).toBeVisible();
    await page.unroute('**/rest/v1/sport_feature_flags*');
    await page.evaluate(key => localStorage.removeItem(key), key);
    report.checks.push('Archive empty, populated, detail and missing record states; three responsive widths; no management actions; controlled disabled-feature fallback opens saved archive');
  }
  const guest = await browser.newPage({ viewport: { width: 390, height: 900 } });
  guest.on('pageerror', error => errors.push(error.message));
  await pause(30000);
  await visit(guest, `${origin}${route}?section=manage`);
  await expect(guest.getByText('Sign in to view competition', { exact: true })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Manage competition', exact: true })).toHaveCount(0);
  report.checks.push('Independent hosted guest receives an explicit sign-in destination and cannot open organiser tools; existing authenticated detail policy is retained');
  assert.deepEqual(errors, []);
  report.status = 'PASS';
} catch (error) {
  await page.screenshot({ path: `${evidence}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  if (competitionId) await checked(stack.admin.from('sport_competitions').delete().eq('id', competitionId).eq('owner_account_id', accountId));
  if (accountId) {
    const { user } = await checked(stack.admin.auth.admin.getUserById(accountId));
    assert.equal(user.user_metadata.web_release_run, run);
    await checked(stack.admin.auth.admin.deleteUser(accountId));
  }
  report.fixtureRemoved = true;
  await writeFile(`${evidence}/review.json`, JSON.stringify(report, null, 2));
}
console.info(JSON.stringify(report));
