import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { signedClients, checked } from './signed-release-fixture.mjs';
import { reviewAccessibility } from './accessibility-review.mjs';

const origin = process.argv[2];
assert.match(origin ?? '', /^(?:http:\/\/127\.0\.0\.1:4191|https:\/\/sportstageapp(?:--[a-z0-9]+)?\.expo\.app)$/);
const label = origin.startsWith('http:') ? 'local' : origin.includes('--') ? 'preview' : 'production';
const evidence = `.e2e/android-release-support-${label}`;
await mkdir(evidence, { recursive: true });
const report = { origin, checks: [], pageErrors: [], mailboxDelivery: 'DEFERRED_BY_USER' };
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.on('pageerror', error => report.pageErrors.push(error.message));
const expect = baseExpect.configure({ timeout: 30000 });
const stack = await signedClients(), run = randomUUID();
let accountId;
async function visit(path) {
  if (label !== 'local') await new Promise(resolve => setTimeout(resolve, 10000));
  const response = await page.goto(origin + path, { timeout: 120000 });
  assert.equal(response.status(), 200);
  await expect(page.getByText('Opening your stage', { exact: true })).toHaveCount(0);
}
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await reviewAccessibility(page, name, report);
  await page.screenshot({ path: `${evidence}/${name}.png`, animations: 'disabled' });
  console.info(`Reviewed ${name}`);
}
function checkDraft(url) {
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'mailto:');
  assert.equal(parsed.pathname, 'admin@sportstageapp.com');
  assert.equal(parsed.searchParams.get('subject'), 'SportStage account deletion request');
  assert.match(parsed.searchParams.get('body'), /data retained and why/);
}
try {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await visit('/support');
    await expect(page.getByText('A person can help.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read the privacy policy' })).toHaveAttribute('href', 'https://www.sportstageapp.com/privacy');
    checkDraft(await page.getByRole('link', { name: 'Request account deletion' }).getAttribute('href'));
    await capture(`guest-support-${width}`);
    await visit('/support?topic=account-deletion');
    await expect(page.getByText('Ask for account deletion.', { exact: true })).toBeVisible();
    checkDraft(await page.getByRole('link', { name: 'Compose account deletion request' }).getAttribute('href'));
    await capture(`guest-deletion-${width}`);
  }
  const script = await page.locator('script[src]').evaluateAll(elements => elements.map(x => new URL(x.src).pathname).find(x => /\/_expo\/static\/js\/web\/(?:index|entry)-[a-f0-9]+\.js$/.test(x)));
  const served = Buffer.from(await (await fetch(origin + script)).arrayBuffer());
  assert.deepEqual(served, await readFile(`${process.env.REVIEW_EXPORT_DIR ?? 'dist'}/client${script}`));
  report.bundleSHA256 = createHash('sha256').update(served).digest('hex');
  await page.setViewportSize({ width: 320, height: 900 });
  await visit('/support?topic=mailto%3Aoutsider%40example.test');
  await expect(page.getByText('A person can help.', { exact: true })).toBeVisible();
  await capture('unsupported-topic');
  report.checks.push('Public support/deletion pages at 320/390/1280 with fixed email draft and privacy links; no messages sent; unknown topics cannot alter recipients');
  await visit('/auth');
  await page.getByRole('button', { name: 'Privacy & support', exact: true }).click();
  await expect(page.getByText('A person can help.', { exact: true })).toBeVisible();
  await capture('sign-in-support-handoff');
  const email = `wricket-support-${run}@example.test`, password = `Support!${randomBytes(16).toString('hex')}`;
  const { user } = await checked(stack.admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { release_support_run: run } }));
  accountId = user.id;
  const client = stack.client();
  await checked(client.auth.signInWithPassword({ email, password }));
  await checked(client.rpc('save_my_sports', { p_display_name: 'Support review', p_sport_codes: ['CRICKET'], p_primary_sport_code: 'CRICKET' }));
  await visit('/auth?returnTo=%2Faccount');
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/account');
  await visit('/account?section=data');
  await page.getByRole('button', { name: 'Review account deletion', exact: true }).click();
  await capture('account-deletion-review-320');
  await page.getByRole('button', { name: 'Ask support to delete my account', exact: true }).click();
  await expect(page.getByText('Ask for account deletion.', { exact: true })).toBeVisible();
  await capture('signed-in-deletion-handoff');
  assert.ok((await checked(stack.admin.auth.admin.getUserById(accountId))).user);
  report.checks.push('Real signed-in account deletion review reaches public support without deleting account or sending email');
  assert.deepEqual(report.pageErrors, []);
  report.status = 'PASS';
} finally {
  await browser.close();
  if (accountId) {
    const { user } = await checked(stack.admin.auth.admin.getUserById(accountId));
    assert.equal(user.user_metadata.release_support_run, run);
    await checked(stack.admin.auth.admin.deleteUser(accountId));
  }
  report.fixtureRemoved = true;
  await writeFile(`${evidence}/review.json`, JSON.stringify(report, null, 2));
}
console.info(JSON.stringify({ status: report.status, scans: report.accessibility?.length, pageErrors: report.pageErrors, fixtureRemoved: report.fixtureRemoved }));
