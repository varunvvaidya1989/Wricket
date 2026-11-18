import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';

// Explicitly scoped disposable hosted accounts. Never sends verification messages.
if (!process.argv.includes('--hosted')) throw new Error('Pass --hosted for scoped hosted onboarding acceptance.');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(url, 'https://lzgnuqwvsioinwwrsdvn.supabase.co');
const secret = process.env.SPORTSTAGE_HOSTED_E2E_KEY;
if (!secret) throw new Error('A server-side fixture credential is required.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, options);
const client = () => createClient(url, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const run = randomUUID();
const origin = process.env.SPORTSTAGE_E2E_ORIGIN ?? 'http://127.0.0.1:4173';
assert.match(origin, /^(?:http:\/\/127\.0\.0\.1:4173|https:\/\/sportstageapp(?:--[a-z0-9]+)?\.expo\.app)$/);
const output = `.e2e/onboarding-details/${new URL(origin).hostname}`;
await mkdir(output, { recursive: true });
const report = { recordedAt: new Date().toISOString(), origin, run, cases: [], errors: [], cleanup: [] };
const browser = await chromium.launch({ channel: 'chrome' });
const accounts = [];
let activePage;
try {
  for (const width of [320, 390, 1280]) {
    const email = `onboarding-${run}-${width}@example.test`;
    const password = `Onboard!${randomBytes(20).toString('hex')}`;
    const { user } = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { acceptance_run: run } }));
    accounts.push({ id: user.id, email, password, width });
  }
  for (const account of accounts) {
    const c = client(); checked(await c.auth.signInWithPassword({ email: account.email, password: account.password }));
    const invalid = await c.rpc('complete_my_account_details', { p_display_name: 'Test', p_contact_email: '', p_contact_phone: '+919876543210', p_sport_codes: ['CRICKET'], p_primary_sport_code: 'CRICKET' });
    assert.ok(invalid.error, 'Server rejects missing mandatory email');
    const context = await browser.newContext({ viewport: { width: account.width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); activePage = page;
    page.setDefaultTimeout(45000);
    page.on('pageerror', error => report.errors.push({ message: error.message, url: page.url() }));
    await page.goto(`${origin}/auth?returnTo=%2Fwricket%2Fmatch%2Fnew`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(account.email);
    await page.getByPlaceholder('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole('button', { name: 'Save & start playing', exact: true })).toBeEnabled();
    await page.getByRole('textbox', { name: 'Contact email', exact: true }).fill('');
    await page.getByRole('button', { name: 'Save & start playing', exact: true }).click();
    await expect(page.getByText('Enter a valid email address.', { exact: true })).toBeVisible();
    assert.equal(checked(await admin.from('account_details').select('account_id').eq('account_id', account.id)).length, 0);
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(`Test Player ${account.width}`);
    await page.getByRole('textbox', { name: 'Contact phone', exact: true }).fill('+91 98765 43210');
    await page.getByRole('textbox', { name: 'Contact email', exact: true }).fill(account.email);
    const choose = async (field, value) => {
      await page.getByRole('button', { name: new RegExp(`^${field}:`) }).click();
      await page.getByRole('textbox', { name: `Search ${field.toLowerCase()}`, exact: true }).fill(value);
      await page.getByRole('button', { name: value, exact: true }).click();
      await expect(page.getByRole('button', { name: 'Close location picker', exact: true })).toHaveCount(0);
    };
    await choose('Country', 'India');
    await choose('State', 'Maharashtra');
    await expect(page.getByRole('button', { name: /^City:/ })).toBeEnabled();
    await choose('City', 'Mumbai');
    await choose('Country', 'United States');
    await expect(page.getByRole('button', { name: 'State: Not selected', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'City: Not selected', exact: true })).toBeDisabled();
    if (account.width === 320) {
      await page.getByRole('button', { name: /^Country:/ }).click();
      await page.getByRole('button', { name: 'Clear country', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Close location picker', exact: true })).toHaveCount(0);
    } else {
      await choose('Country', 'India'); await choose('State', 'Maharashtra');
      await expect(page.getByRole('button', { name: /^City:/ })).toBeEnabled();
      await choose('City', 'Mumbai');
      await page.getByRole('textbox', { name: 'Age', exact: true }).fill('9');
    }
    let primary = 'CRICKET';
    if (account.width === 1280) {
      await page.getByRole('button', { name: 'Tennis', exact: true }).click();
      await page.getByRole('button', { name: 'Tennis primary sport', exact: true }).click(); primary = 'TENNIS';
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Choose profile photo', exact: true }).click();
      await (await chooser).setFiles({ name: 'test-avatar.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a26kAAAAASUVORK5CYII=', 'base64') });
      await expect(page.getByRole('button', { name: 'Change profile photo', exact: true })).toBeVisible();
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const scan = await new AxeBuilder({ page }).analyze();
    if (scan.violations.length) await writeFile(`${output}/accessibility-failure.json`, JSON.stringify(scan.violations, null, 2));
    assert.deepEqual(scan.violations.map(item => item.id), []);
    await page.screenshot({ path: `${output}/profile-${account.width}.png`, fullPage: true });
    if (account.width === 390) {
      let failOnce = true;
      await page.route('**/rest/v1/rpc/complete_my_account_details', async route => {
        if (failOnce) { failOnce = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Acceptance simulated outage' }) }); }
        else await route.continue();
      });
      await page.getByRole('button', { name: 'Save & start playing', exact: true }).click();
      await expect(page.getByText('Could not save your profile. Your details are still here; check your connection and try again.', { exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(`Test Player ${account.width}`);
      await expect(page).toHaveURL(/\/onboarding/);
    }
    await page.getByRole('button', { name: 'Save & start playing', exact: true }).click();
    await expect(page).toHaveURL(primary === 'TENNIS' ? /\/tennis\/?$/ : /\/wricket\/live\/?$/);
    const details = checked(await c.from('account_details').select('*').eq('account_id', account.id)).at(0);
    assert.ok(details.completed_at); assert.equal(details.contact_email, account.email);
    assert.equal(details.contact_phone, '+919876543210');
    assert.equal(details.age, account.width === 320 ? null : 9);
    assert.equal(details.city, account.width === 320 ? null : 'Mumbai');
    const profile = checked(await admin.from('profiles').select('id,primary_sport_id,avatar_url').eq('id', account.id)).at(0);
    const sport = checked(await admin.from('sports').select('code').eq('id', profile.primary_sport_id)).at(0);
    assert.equal(sport.code, primary);
    assert.equal(checked(await admin.from('players').select('id').eq('profile_id', account.id)).length, 1);
    if (account.width === 1280) assert.ok(profile.avatar_url);
    const viewer = client(); const other = accounts.find(item => item.id !== account.id);
    checked(await viewer.auth.signInWithPassword({ email: other.email, password: other.password }));
    assert.deepEqual(checked(await viewer.from('account_details').select('*').eq('account_id', account.id)), []);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/\/onboarding/);
    await page.goto(`${origin}/profile-details`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('textbox', { name: 'Contact email', exact: true })).toHaveValue(account.email);
    report.cases.push({ width: account.width, primary, requiredOnly: account.width === 320, linkedLocations: true, optionalPhoto: account.width === 1280, retryAfterFailure: account.width === 390, privateReadDenied: true, completionSurvivesRefresh: true, primarySportLanding: true, axeViolations: 0 });
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = error.message; process.exitCode = 1;
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${output}/failure.png`, fullPage: true });
} finally {
  await browser.close();
  for (const account of accounts) {
    try {
      const { user } = checked(await admin.auth.admin.getUserById(account.id));
      assert.equal(user.user_metadata.acceptance_run, run);
      const c = client(); checked(await c.auth.signInWithPassword({ email: account.email, password: account.password }));
      const folder = `${account.id}/avatar`;
      const files = checked(await c.storage.from('profile-media').list(folder));
      if (files.length) checked(await c.storage.from('profile-media').remove(files.map(file => `${folder}/${file.name}`)));
      checked(await admin.from('players').delete().eq('profile_id', account.id).eq('created_by', account.id));
      checked(await admin.auth.admin.deleteUser(account.id));
      report.cleanup.push({ account: account.width, removed: true });
    } catch { report.cleanup.push({ account: account.width, removed: false }); process.exitCode = 1; }
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
