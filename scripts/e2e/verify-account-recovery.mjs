import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { signedClients, checked } from './signed-release-fixture.mjs';
import { reviewAccessibility } from './accessibility-review.mjs';

const origin = process.argv[2];
assert.match(origin ?? '', /^(?:http:\/\/127\.0\.0\.1:4181|https:\/\/sportstageapp(?:--[a-z0-9]+)?\.expo\.app)$/);
const expect = baseExpect.configure({ timeout: 30000 });
const label = origin.startsWith('http:') ? 'local-export' : origin.includes('--') ? 'preview' : 'production';
const exportDir = process.env.REVIEW_EXPORT_DIR ?? 'dist';
const evidence = `.e2e/web-release/coverage4-${label}`;
await mkdir(evidence, { recursive: true });
const stack = await signedClients();
const run = randomUUID();
const email = `wricket-recovery-${run}@example.test`;
const initialPassword = `Recovery!${randomBytes(16).toString('hex')}`;
const changedPassword = `Changed!${randomBytes(16).toString('hex')}`;
const resetPassword = `Reset!${randomBytes(16).toString('hex')}`;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
let page = await context.newPage();
let accountId, accountDeleted = false;
const report = { origin, label, checks: [], pageErrors: [], emailDelivery: 'DEFERRED_BY_USER' };
const errors = error => report.pageErrors.push(error.message);
page.on('pageerror', errors);
page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function visit(path) {
  if (label !== 'local-export') await pause(10000);
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try { response = await page.goto(origin + path); }
    catch (error) {
      if (attempt >= 2 || !/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_RESET|ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED/.test(String(error))) throw error;
      await pause(15000); continue;
    }
    if (response.status() === 429) { await pause(30000); continue; }
    assert.equal(response.status(), 200); return;
  }
  throw new Error('Hosting unavailable after bounded retries');
}
async function capture(name) {
  await page.getByRole('main').waitFor();
  await page.getByRole('main').getByRole('button').first().click({ trial: true });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await reviewAccessibility(page, name, report);
  await page.screenshot({ path: `${evidence}/${name}.png`, animations: 'disabled' });
  console.info(`Reviewed ${name}`);
}
async function doubleClick(button) {
  await button.evaluate(element => { element.click(); element.click(); });
}
try {
  await visit('/forgot-password?returnTo=%2Fbadminton%2Fmatch%2Fnew');
  const script = await page.locator('script[src]').evaluateAll(elements => elements.map(x => new URL(x.src).pathname).find(x => /\/_expo\/static\/js\/web\/(?:entry|index)-[a-f0-9]+\.js$/.test(x)));
  const remote = Buffer.from(await (await fetch(origin + script)).arrayBuffer());
  assert.deepEqual(remote, await readFile(`${exportDir}/client${script}`));
  report.bundleSHA256 = createHash('sha256').update(remote).digest('hex');
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toHaveAttribute('aria-invalid', 'true');
  await capture('recovery-email-error');
  let recoveryRequests = 0, releaseRecovery;
  const pendingRecovery = new Promise(resolve => { releaseRecovery = resolve; });
  await page.route('**/auth/v1/recover*', async route => { recoveryRequests++; await pendingRecovery; await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
  await doubleClick(page.getByRole('button', { name: 'Send reset link', exact: true }));
  await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).not.toBeEditable();
  releaseRecovery();
  await expect(page.getByText('Check your inbox.', { exact: true })).toBeVisible();
  assert.equal(recoveryRequests, 1);
  await capture('recovery-requested');
  await page.unroute('**/auth/v1/recover*');
  report.checks.push('Controlled email request sends one command under rapid activation, locks its email while pending, associates validation errors and retains the selected match destination; no email delivery claimed');

  const { user } = await checked(stack.admin.auth.admin.createUser({ email, password: initialPassword, email_confirm: true, user_metadata: { account_recovery_run: run } }));
  accountId = user.id;
  const client = stack.client();
  await checked(client.auth.signInWithPassword({ email, password: initialPassword }));
  await checked(client.rpc('save_my_sports', { p_display_name: 'Recovery reviewer', p_sport_codes: ['CRICKET', 'BADMINTON'], p_primary_sport_code: 'BADMINTON' }));

  await visit('/auth?returnTo=%2Fprofile');
  await page.getByRole('button', { name: 'Create a SportStage account', exact: true }).click();
  const badmintonChoice = page.getByRole('button', { name: 'Badminton', exact: true });
  await expect(badmintonChoice).toHaveAttribute('aria-pressed', 'false');
  await badmintonChoice.focus(); await page.keyboard.press('Space');
  await expect(badmintonChoice).toHaveAttribute('aria-pressed', 'true');
  const badmintonPrimary = page.getByRole('button', { name: 'Badminton primary sport', exact: true });
  await badmintonPrimary.focus(); await page.keyboard.press('Space');
  await expect(badmintonPrimary).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Cricket primary sport', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await capture('sport-preferences-keyboard');
  await page.getByRole('button', { name: 'I already have an account', exact: true }).click();
  report.checks.push('Signup sport and primary-sport toggle buttons expose selected state and activate with keyboard Space; only one primary sport is selected');
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(initialPassword);
  let signInRequests = 0;
  const unconfirmed = async route => { signInRequests++; await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error_code: 'email_not_confirmed', msg: 'Email not confirmed' }) }); };
  await page.route('**/auth/v1/token*', unconfirmed);
  await doubleClick(page.getByRole('button', { name: 'Sign in', exact: true }));
  await expect(page.getByText('Confirm your email.', { exact: true })).toBeVisible();
  assert.equal(signInRequests, 1);
  await page.unroute('**/auth/v1/token*', unconfirmed);
  let resendRequests = 0;
  await page.route('**/auth/v1/resend*', async route => { resendRequests++; await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await doubleClick(page.getByRole('button', { name: 'Resend verification email', exact: true }));
  await expect(page.getByText('A new verification link was sent. Check your inbox and spam folder.', { exact: true })).toBeVisible();
  assert.equal(resendRequests, 1);
  await capture('unconfirmed-email-recovery');
  await page.unroute('**/auth/v1/resend*');
  await page.getByRole('button', { name: 'Use a different email', exact: true }).click();
  await expect(page.getByPlaceholder('Password', { exact: true })).toHaveValue('');
  await page.getByPlaceholder('Password', { exact: true }).fill(initialPassword);
  report.checks.push('Controlled unconfirmed sign-in opens a usable verification/resend handoff; rapid sign-in and resend activation each send one command, password is cleared and return destination retained. No email was sent');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/profile');
  await visit('/change-password');
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page.getByLabel('Current password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await capture('password-field-errors');
  await page.getByLabel('Current password', { exact: true }).fill(initialPassword);
  await page.getByLabel('New password', { exact: true }).fill(changedPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page.getByLabel('Confirm new password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Confirm new password', { exact: true }).fill(changedPassword);
  let updates = 0;
  const failedUpdate = async route => { if (route.request().method() !== 'PUT') return route.continue(); updates++; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unexpected_failure', msg: 'Controlled password-update outage' }) }); };
  await page.route('**/auth/v1/user*', failedUpdate);
  await doubleClick(page.getByRole('button', { name: 'Save password', exact: true }));
  await expect(page.getByText('SportStage sign-in is temporarily unavailable. Please try again shortly.', { exact: true })).toBeVisible();
  assert.equal(updates, 1);
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue(changedPassword);
  await capture('password-retry');
  await page.unroute('**/auth/v1/user*', failedUpdate);
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page.getByText('Password updated.', { exact: true })).toBeVisible();
  await capture('password-saved');
  await checked(client.auth.signInWithPassword({ email, password: changedPassword }));
  assert.ok((await stack.client().auth.signInWithPassword({ email, password: initialPassword })).error);
  report.checks.push('Actual password change, field-specific errors, one failed command under rapid activation, retained input/retry and saved receipt; old password no longer signs in');

  const link = await checked(stack.admin.auth.admin.generateLink({ type: 'recovery', email }));
  const recovered = await checked(stack.client().auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'recovery' }));
  const recoveryContext = await browser.newContext({ viewport: { width: 320, height: 900 }, reducedMotion: 'reduce' });
  page = await recoveryContext.newPage(); page.on('pageerror', errors); page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
  await visit(`/reset-password?returnTo=%2Fbadminton%2Fmatch%2Fnew#access_token=${encodeURIComponent(recovered.session.access_token)}&refresh_token=${encodeURIComponent(recovered.session.refresh_token)}&type=recovery`);
  await expect(page.getByText(/After recovery.*Your match setup/)).toBeVisible();
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await capture('reset-password-error-320');
  await page.getByLabel('New password', { exact: true }).fill(resetPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(resetPassword);
  await doubleClick(page.getByRole('button', { name: 'Save password', exact: true }));
  await page.waitForURL(url => url.pathname === '/badminton/match/new');
  await expect(page.getByText('Ready when you are.', { exact: true })).toBeVisible();
  await checked(client.auth.signInWithPassword({ email, password: resetPassword }));
  report.checks.push('Real hosted recovery token restored in a fresh browser; 320px field errors and successful password reset resume the intended Badminton setup. Token was generated administratively; inbox delivery remains deferred');

  const avatarPath = `${accountId}/recovery-review.png`;
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9kAAAAASUVORK5CYII=', 'base64');
  await checked(client.storage.from('profile-media').upload(avatarPath, image, { contentType: 'image/png' }));
  await visit('/account?section=data');
  await page.getByRole('button', { name: 'Review account deletion', exact: true }).click();
  await page.getByLabel('Type DELETE to confirm', { exact: true }).fill('DELETE');
  const failedRemoval = async route => { if (route.request().method() !== 'DELETE') return route.continue(); await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Controlled Storage removal outage' }) }); };
  await page.route('**/storage/v1/object/profile-media', failedRemoval);
  await doubleClick(page.getByRole('button', { name: 'Permanently delete account', exact: true }));
  await expect(page.getByText('Some account files could not be removed. Your account is still available. Check your connection and try again.', { exact: true })).toBeVisible();
  await checked(client.storage.from('profile-media').download(avatarPath));
  assert.ok((await checked(stack.admin.auth.admin.getUserById(accountId))).user);
  await capture('account-deletion-retry-320');
  await page.unroute('**/storage/v1/object/profile-media', failedRemoval);
  await page.getByRole('button', { name: 'Permanently delete account', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/auth');
  assert.equal((await stack.admin.auth.admin.getUserById(accountId)).error?.status, 404);
  accountDeleted = true;
  assert.equal((await checked(stack.admin.storage.from('profile-media').list(accountId))).length, 0);
  report.checks.push('Actual web account deletion with an avatar: Storage failure preserves account and retry; successful retry removes file and login and returns to sign-in');
  assert.deepEqual(report.pageErrors, []); report.status = 'PASS';
} catch (cause) {
  console.info('Failure path:', new URL(page.url()).pathname);
  console.info('Visible notices:', await page.locator('[aria-live]').allTextContents());
  throw cause;
} finally {
  await browser.close();
  if (accountId && !accountDeleted) {
    const result = await stack.admin.auth.admin.getUserById(accountId);
    if (result.error?.status !== 404) {
      const { user } = await checked(result);
      assert.equal(user.user_metadata.account_recovery_run, run);
      await checked(stack.admin.storage.from('profile-media').remove([`${accountId}/recovery-review.png`]));
      await checked(stack.admin.auth.admin.deleteUser(accountId));
    }
  }
  report.fixtureRemoved = true;
  await writeFile(`${evidence}/review.json`, JSON.stringify(report, null, 2));
}
console.info(JSON.stringify({ status: report.status, checks: report.checks, pageErrors: report.pageErrors, bundleSHA256: report.bundleSHA256, fixtureRemoved: report.fixtureRemoved, emailDelivery: report.emailDelivery }));
