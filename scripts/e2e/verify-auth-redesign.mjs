import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

// Mock all authentication writes: no SMS, email, accounts or live sign-in.
const origin = process.argv[2] ?? 'http://127.0.0.1:4173';
assert.match(origin, /^(?:http:\/\/127\.0\.0\.1:4173|https:\/\/sportstageapp(?:--[a-z0-9]+)?\.expo\.app)$/);
const output = `.e2e/auth-redesign/${new URL(origin).hostname}`;
await mkdir(output, { recursive: true });
const report = { origin, checks: [], errors: [], authenticationWrites: 'MOCKED' };
const expect = baseExpect.configure({ timeout: 30000 });
const browser = await chromium.launch({ channel: 'chrome' });
let activePage;
try {
  for (const width of [320, 390, 1280]) {
    const height = width === 320 ? 740 : width === 390 ? 844 : 900;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage(); activePage = page;
    page.on('pageerror', error => report.errors.push(error.message));
    let signIns = 0, links = 0;
    await page.route('**/auth/v1/**', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      if (route.request().url().includes('/token')) {
        signIns++;
        return route.fulfill({ status: 400, headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_credentials', error_code: 'invalid_credentials', message: 'Invalid login credentials' }) });
      }
      if (route.request().url().includes('/otp')) links++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto(`${origin}/auth?returnTo=%2Faccount`, { waitUntil: 'domcontentloaded' });
    const button = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect(button).toBeVisible();
    const bounds = await button.boundingBox();
    assert.ok(bounds.y + bounds.height <= height, 'Primary sign-in action fits without scrolling');
    await expect(page.getByText('After sign-in → Your account', { exact: true })).toHaveCount(0);
    const capture = async name => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const result = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(result.violations.map(item => item.id), []);
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
    };
    await capture('email');
    await button.click();
    await expect(page.getByText('Email is required.', { exact: true })).toBeVisible();
    assert.equal(signIns, 0);
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('review@example.test');
    const password = page.getByPlaceholder('Password', { exact: true });
    await password.fill('Review-only-password');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(password).toHaveJSProperty('type', 'text');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    await expect(password).toHaveJSProperty('type', 'password');
    await password.press('Enter');
    await expect(page.getByText('The email or password is incorrect. Check both fields and try again.', { exact: true })).toBeVisible();
    assert.equal(signIns, 1);
    await page.getByRole('button', { name: 'Use one-time email link', exact: true }).click();
    await expect(password).toHaveCount(0);
    await page.getByRole('button', { name: 'Email me a sign-in link', exact: true }).click();
    await expect(page.getByText('Check your inbox.', { exact: true })).toBeVisible();
    assert.equal(links, 1);
    await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Create a SportStage account', exact: true }).click();
    await expect(page.getByText('Join the game.', { exact: true })).toBeVisible();
    await capture('signup');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByText('Enter at least two characters.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'I already have an account', exact: true }).click();
    await page.getByRole('button', { name: 'Use phone SMS code', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Indian mobile number (+91)', exact: true })).toBeVisible();
    await capture('phone');
    await page.getByRole('button', { name: 'Use email instead', exact: true }).click();
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await expect(page).toHaveURL(/\/forgot-password\?returnTo=%2Faccount/);
    report.checks.push({ width, height, primaryActionAboveFold: true, passwordVisibility: true, keyboardSubmit: true, emailValidation: true, failedLogin: true, emailLink: true, signupValidation: true, phoneSwitching: true, passwordRecoveryReturn: true, axeViolations: 0 });
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = error.message; process.exitCode = 1;
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${output}/failure.png`, fullPage: true });
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
