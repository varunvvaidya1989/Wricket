import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

// Local disposable accounts only. Never loads hosted credentials or clears app data.
const stack = await localClients();
const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(fixture.cleaned, false);
const run = randomUUID();
const email = `ux2-${run}@example.test`;
const password = `Ux2!${randomBytes(16).toString('hex')}`;
const nextPassword = `Ux2!${randomBytes(16).toString('hex')}`;
const base = 'http://127.0.0.1:4173';
const evidence = '.e2e/rest-of-app-ux2';
const errors = [];
const report = { date: '2026-10-12', target: 'isolated local Supabase', checks: [], visuals: [], pageErrors: errors };
await mkdir(evidence, { recursive: true });
await expect.poll(async () => {
  try { return (await fetch(`${base}/auth`, { signal: AbortSignal.timeout(10000) })).ok; }
  catch { return false; }
}, { timeout: 120000 }).toBe(true);
const browser = await chromium.launch({ channel: 'chrome' });
let userId;
let teamId;
const notificationIds = [];
const client = stack.client();
const owner = stack.client();
async function pageFor(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));
  return page;
}
async function ready(page) {
  await page.getByRole('button', { name: 'Back', exact: true }).click({ trial: true });
  await expect(page.getByText('Opening your stage', { exact: true }).filter({ visible: true })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}
async function capture(page, name) {
  await ready(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
  await page.screenshot({ path: `${evidence}/${name}.png`, animations: 'disabled', maskColor: '#111b13', mask: [page.locator('input[value*="@"]')] });
}
async function login(page, accountEmail = email, accountPassword = password) {
  await ready(page);
  await page.getByPlaceholder('Email', { exact: true }).fill(accountEmail);
  await page.getByPlaceholder('Password', { exact: true }).fill(accountPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
try {
  for (const width of [320, 390, 1280]) {
    const page = await pageFor(width);
    await page.goto(`${base}/auth?returnTo=%2Fbadminton%2Fmatch%2Fnew`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    await expect(page.getByText('After sign-in → Your match setup', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('tab').filter({ visible: true })).toHaveCount(0);
    const title = await page.getByText('Welcome back.', { exact: true }).filter({ visible: true }).evaluate(element => ({ font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize }));
    assert.match(title.font, /SpaceGrotesk_600SemiBold/); assert.equal(title.size, '29px');
    const field = await page.getByRole('textbox', { name: 'Email address' }).evaluate(element => ({ font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize, height: element.getBoundingClientRect().height }));
    assert.match(field.font, /Inter_400Regular/); assert.equal(field.size, '13px'); assert.ok(field.height >= 48);
    await capture(page, `signin-${width}`);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Email is required.', { exact: true }).filter({ visible: true })).toBeVisible();
    await capture(page, `signin-invalid-${width}`);
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await expect(page).toHaveURL(/forgot-password\?returnTo=/);
    await expect(page.getByText('After recovery → Your match setup', { exact: true }).filter({ visible: true })).toBeVisible();
    await capture(page, `forgot-password-${width}`);
    await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    await expect(page).toHaveURL(/auth\?returnTo=/);
    await page.getByRole('button', { name: 'Create a SportStage account', exact: true }).click();
    await expect(page.getByText('Let’s get you in.', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(6);
    await capture(page, `signup-${width}`);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByText('Check the highlighted fields and try again.', { exact: true }).filter({ visible: true })).toBeVisible();
    await page.context().close();
    report.visuals.push({ width, title, field, noOverflow: true });
  }
  report.checks.push('Sign-in, signup validation, recovery task retention and typography at 320/390/1280');

  const page = await pageFor(390);
  await page.goto(`${base}/auth?returnTo=%2Fprofile`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.getByRole('button', { name: 'Create a SportStage account', exact: true }).click();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('UX review player');
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
  await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('9876543210');
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByPlaceholder('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  // Confirmation is disabled in the isolated fixture; hosted verification is a release check.
  await page.waitForURL(url => ['/onboarding', '/profile'].includes(url.pathname));
  const created = await checked(client.auth.signInWithPassword({ email, password }));
  userId = created.user.id;
  await checked(stack.admin.auth.admin.updateUserById(userId, { user_metadata: { e2e_run_id: run } }));
  if (new URL(page.url()).pathname === '/onboarding') {
    await expect(page.getByText('What do you play?', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(6);
    await capture(page, 'onboarding-390');
    await page.getByRole('button', { name: 'Save & continue', exact: true }).click();
  }
  await page.waitForURL(url => url.pathname === '/profile');
  await expect(page.getByText('UX review player', { exact: true }).filter({ visible: true })).toBeVisible();
  report.checks.push('Actual signup, sports onboarding and requested profile return');
  const profileBefore = await checked(client.from('profiles').select('display_name').eq('id', userId).single());
  assert.equal(profileBefore.display_name, 'UX review player');

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/profile`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('UX review player', { exact: true }).filter({ visible: true })).toBeVisible();
    await capture(page, `profile-${width}`);
    await page.getByRole('button', { name: 'View public profile', exact: true }).click();
    await expect(page.getByText('How players see you.', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(email, { exact: true }).filter({ visible: true })).toHaveCount(0);
    await capture(page, `public-profile-preview-${width}`);
    await page.goto(`${base}/account`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('You’re in control.', { exact: true }).filter({ visible: true })).toBeVisible();
    await capture(page, `account-${width}`);
    await page.getByRole('button', { name: /Edit identity/ }).click();
    await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toHaveValue('UX review player');
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await capture(page, `edit-identity-${width}`);
    await page.goto(`${base}/account?section=sports`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('checkbox')).toHaveCount(6);
    await capture(page, `connected-sports-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${base}/account?section=identity`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('UX updated player');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  try {
    await expect.poll(async () => (await checked(client.from('profiles').select('display_name').eq('id', userId).single())).display_name, { timeout: 15000 }).toBe('UX updated player');
  } catch (cause) {
    await capture(page, 'identity-save-failure');
    console.error((await page.locator('body').innerText()).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, '[test email]'));
    throw cause;
  }
  report.checks.push('Profile and private identity separation, actual identity save, connected sports and account layout at all widths');

  await page.goto(`${base}/change-password`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await capture(page, 'change-password-390');
  await page.getByPlaceholder('Current password', { exact: true }).fill(password);
  await page.getByPlaceholder('New password', { exact: true }).fill(nextPassword);
  await page.getByPlaceholder('Confirm new password', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page.getByText('Enter the same new password twice.', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByPlaceholder('Confirm new password', { exact: true }).fill(nextPassword);
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page.getByText('Password updated.', { exact: true }).filter({ visible: true })).toBeVisible();
  await checked(client.auth.signInWithPassword({ email, password: nextPassword }));
  assert.ok((await stack.client().auth.signInWithPassword({ email, password })).error, 'Old password must fail');
  report.checks.push('Actual password change validates confirmation, accepts the new password and rejects the old one');

  await page.goto(`${base}/account?section=data`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Delete my account', exact: true })).toBeDisabled();
  await capture(page, 'account-data-390');
  // Deliberately does not trigger clear-device-data or delete-account on any existing app.
  const notifications = await checked(stack.admin.from('sport_notifications').insert([
    { account_id: userId, kind: 'INVITATION', title: 'Join your next team', body: 'Review the team invitation.', deep_link: '/wricket' },
    { account_id: userId, kind: 'SCHEDULE_CHANGE', title: 'Match time updated', body: 'Check your updated schedule.', deep_link: '/wricket', read_at: new Date().toISOString() },
    { account_id: userId, kind: 'SYSTEM', title: 'Invalid destination review', body: 'This link cannot be opened.', deep_link: '//example.test' },
  ]).select('id'));
  notificationIds.push(...notifications.map(item => item.id));
  await checked(owner.auth.signInWithPassword({ email: fixture.accounts[0].email, password: fixture.password }));
  assert.deepEqual(await checked(owner.from('sport_notifications').select('id').in('id', notificationIds)), [], 'RLS hides another account’s notifications');
  await owner.rpc('mark_sport_notification_read', { p_notification_id: notificationIds[0] });
  assert.equal((await checked(stack.admin.from('sport_notifications').select('read_at').eq('id', notificationIds[0]).single())).read_at, null);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/notifications`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('NEEDS YOUR ATTENTION', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText('MATCHDAY', { exact: true }).filter({ visible: true })).toBeVisible();
    await capture(page, `notifications-${width}`);
  }
  await page.getByRole('button', { name: /Invalid destination review/ }).click();
  await expect(page.getByText('This notification link is unavailable. Open the sport to review the update.', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page).toHaveURL(/\/notifications$/);
  await page.getByRole('button', { name: /Join your next team/ }).click();
  await page.waitForURL(url => ['/wricket', '/wricket/live'].includes(url.pathname));
  assert.ok((await checked(stack.admin.from('sport_notifications').select('read_at').eq('id', notificationIds[0]).single())).read_at);
  report.checks.push('Real notifications grouped, acknowledged and opened; cross-account RLS and unsafe link rejection');

  const temporaryTeam = await checked(stack.admin.from('teams').insert({ name: 'UX invitation review team', short_name: 'UXR', color_hex: '#a6f477', entity_owner_id: fixture.accounts[0].id }).select('id').single());
  teamId = temporaryTeam.id;
  const invite = await checked(owner.rpc('create_team_invitation', { p_team_id: teamId, p_role: 'CAPTAIN', p_invited_email: email, p_max_uses: 1, p_expires_in_hours: 1 }));
  const guest = await pageFor(390);
  await guest.goto(`${base}/wricket/team/join?token=${invite.token}`, { waitUntil: 'domcontentloaded' });
  await expect(guest.getByText('Take your place.', { exact: true }).filter({ visible: true })).toBeVisible();
  await capture(guest, 'invitation-guest-390');
  await guest.getByRole('button', { name: 'Sign in to join', exact: true }).click();
  await expect(guest.getByText('After sign-in → Your team invitation', { exact: true }).filter({ visible: true })).toBeVisible();
  await login(guest, email, nextPassword);
  await guest.waitForURL(url => url.pathname === '/wricket/team/join');
  await expect(guest.getByText('UX invitation review team', { exact: true }).filter({ visible: true })).toBeVisible();
  await capture(guest, 'invitation-ready-390');
  await guest.getByRole('button', { name: 'Join UXR', exact: true }).click();
  await guest.waitForURL(url => url.pathname === `/wricket/team/${teamId}`);
  const membership = await checked(client.from('team_account_members').select('status,role').eq('team_id', teamId).eq('account_id', userId).single());
  assert.equal(membership.status, 'ACTIVE'); assert.equal(membership.role, 'CAPTAIN');
  report.checks.push('Actual captain invitation survives guest sign-in and creates the invited captain membership');
  await guest.context().close();

  await page.route('**/rest/v1/sport_notifications*', route => route.fulfill({ status: 403, json: { code: '42501', message: 'Review fixture: notification access unavailable.' } }));
  await page.goto(`${base}/notifications`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Nothing waiting on you.', { exact: true }).filter({ visible: true })).toHaveCount(0);
  await capture(page, 'notifications-error-390');
  await page.unroute('**/rest/v1/sport_notifications*');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Match time updated', { exact: true }).filter({ visible: true })).toBeVisible();
  await checked(stack.admin.from('sport_notifications').delete().in('id', notificationIds));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Nothing waiting on you.', { exact: true }).filter({ visible: true })).toBeVisible();
  await capture(page, 'notifications-empty-390');
  report.checks.push('Failed notification load is distinct from empty; actual retry restores rows');
  await page.goto(`${base}/account`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/live');
  await page.goto(`${base}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.pathname === '/live');
  await expect(page.getByText('UX updated player', { exact: true }).filter({ visible: true })).toHaveCount(0);
  report.checks.push('Local sign-out removes private profile access without clearing app data');
  await page.context().close();

  const recovery = await pageFor(390);
  await recovery.goto(`${base}/forgot-password?returnTo=%2Fprofile`, { waitUntil: 'domcontentloaded' });
  await ready(recovery);
  await recovery.getByRole('textbox', { name: 'Email address' }).fill(email);
  const request = recovery.waitForRequest(req => req.url().includes('/auth/v1/recover'));
  await recovery.getByRole('button', { name: 'Send reset link', exact: true }).click();
  const requestUrl = new URL((await request).url());
  const resetRedirect = requestUrl.searchParams.get('redirect_to');
  assert.ok(resetRedirect, 'Recovery request includes the callback URL');
  assert.equal(decodeURIComponent(new URL(resetRedirect).searchParams.get('returnTo')), '/profile');
  await expect(recovery.getByText('Check your inbox.', { exact: true }).filter({ visible: true })).toBeVisible();
  await capture(recovery, 'recovery-sent-390');
  await recovery.getByRole('button', { name: 'Back to sign in', exact: true }).click();
  await expect(recovery).toHaveURL(/auth\?returnTo=%2Fprofile/);
  const generated = await checked(stack.admin.auth.admin.generateLink({ type: 'recovery', email }));
  const verified = await checked(stack.client().auth.verifyOtp({ type: 'recovery', token_hash: generated.properties.hashed_token }));
  // Verify a real local recovery token; callback host is the local web harness.
  // The fixture's email redirect allowlist uses :3000 rather than Expo's :4173.
  const recoveryQuery = new URL(resetRedirect).search;
  await recovery.goto(`${base}/reset-password${recoveryQuery}#access_token=${verified.session.access_token}&refresh_token=${verified.session.refresh_token}&type=recovery`, { waitUntil: 'domcontentloaded' });
  await expect(recovery.getByRole('button', { name: 'Save password', exact: true })).toBeEnabled();
  await capture(recovery, 'reset-password-390');
  await recovery.getByPlaceholder('New password', { exact: true }).fill(password);
  await recovery.getByPlaceholder('Confirm new password', { exact: true }).fill(password);
  await recovery.getByRole('button', { name: 'Save password', exact: true }).click();
  try { await recovery.waitForURL(url => url.pathname === '/profile', { timeout: 30000 }); }
  catch (cause) {
    console.error(JSON.stringify({ recoveryPath: new URL(recovery.url()).pathname, screen: (await recovery.locator('body').innerText()).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, '[test email]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[token]') }));
    throw cause;
  }
  await checked(client.auth.signInWithPassword({ email, password }));
  report.checks.push('Actual recovery request retains task; real local recovery token changes password and returns to profile');
  await recovery.context().close();

  const expired = await pageFor(390);
  await expired.goto(`${base}/auth?returnTo=%2Fprofile#error_code=otp_expired&error_description=Link%20expired`, { waitUntil: 'domcontentloaded' });
  await expired.waitForURL(url => url.pathname === '/auth-link-error');
  await expect(expired.getByText('LINK EXPIRED', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(expired.getByText('After sign-in → Your account', { exact: true }).filter({ visible: true })).toBeVisible();
  await capture(expired, 'auth-link-expired-390');
  await expired.getByRole('button', { name: 'Back to sign in', exact: true }).click();
  await expect(expired).toHaveURL(/auth\?returnTo=%2Fprofile/);
  report.checks.push('Expired authentication link preserves the requested task');
  await expired.context().close();
  assert.deepEqual(errors, []);
  report.result = 'PASS';
  await writeFile(`${evidence}/review.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, checks: report.checks, pageErrors: errors.length, evidence }));
} catch (cause) {
  console.error(String(cause.stack ?? cause).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, '[test email]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[token]'));
  throw new Error('Account UX verification failed; see the sanitized failure above.');
} finally {
  await browser.close();
  if (teamId) await checked(stack.admin.from('teams').delete().eq('id', teamId));
  if (userId) {
    const { user } = await checked(stack.admin.auth.admin.getUserById(userId));
    assert.equal(user.email, email); assert.equal(user.user_metadata.e2e_run_id, run);
    await checked(stack.admin.from('sport_notifications').delete().eq('account_id', userId));
    await checked(stack.admin.from('players').delete().eq('profile_id', userId));
    const deleted = await stack.admin.auth.admin.deleteUser(userId);
    if (deleted.error) {
      // New local Storage versions guard even an empty FK-cascade delete.
      // This fallback is ONLY for this verified disposable local account with no media.
      assert.match(userId, /^[a-f0-9-]{36}$/); assert.match(run, /^[a-f0-9-]{36}$/);
      const execute = promisify(execFile);
      const empty = await execute('docker', ['exec', 'supabase_db_wricket-e2e', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', `SELECT count(*) FROM storage.objects WHERE owner_id = '${userId}';`]);
      assert.equal(empty.stdout.trim(), '0', 'Do not bypass Storage protection for an account with media');
      await execute('docker', ['exec', 'supabase_db_wricket-e2e', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `BEGIN; SET LOCAL storage.allow_delete_query = 'true'; DELETE FROM auth.users WHERE id = '${userId}' AND raw_user_meta_data->>'e2e_run_id' = '${run}'; COMMIT;`]);
    }
  }
  await client.auth.signOut({ scope: 'local' });
  await owner.auth.signOut({ scope: 'local' });
}
