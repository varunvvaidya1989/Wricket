import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

// Production export, mocked Auth POSTs. Never sends SMS or creates an account.
const browser = await chromium.launch({ channel: 'chrome' });
const evidence = '.e2e/twofactor/browser';
await mkdir(evidence, { recursive: true });
const report = { checkedAt: new Date().toISOString(), scope: 'Local exported UI with mocked SMS/verify responses; no SMS sends or real sessions.', cases: [], pageErrors: [] };
let activePage;
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    let sends = 0; let verifies = 0;
    await page.route('**/auth/v1/otp', async route => {
      sends++;
      const request = route.request().postDataJSON();
      assert.equal(request.phone, '+919876543210');
      assert.equal(request.channel, 'sms');
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('**/auth/v1/verify', async route => {
      verifies++;
      const request = route.request().postDataJSON();
      assert.equal(request.phone, '+919876543210');
      assert.equal(request.token, '123456');
      assert.equal(request.type, 'sms');
      await route.fulfill({ status: 403, headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, contentType: 'application/json', body: JSON.stringify({ code: 'otp_expired', error_code: 'otp_expired', message: 'Token has expired or is invalid' }) });
    });
    await page.goto('http://127.0.0.1:4173/auth?returnTo=%2Fwricket%2Fmatch%2Fnew', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Use phone SMS code', exact: true }).click();
    await expect(page.getByText('Sign in or join with your mobile number.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Send SMS code', exact: true }).click();
    await expect(page.getByText('Enter a valid 10-digit Indian mobile number.', { exact: true })).toBeVisible();
    assert.equal(sends, 0);
    await page.getByRole('textbox', { name: 'Indian mobile number (+91)', exact: true }).fill('9876543210');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const numberScan = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(numberScan.violations.map(row => row.id), []);
    await page.screenshot({ path: `${evidence}/phone-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Send SMS code', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'SMS code', exact: true })).toBeVisible();
    assert.equal(sends, 1);
    await expect(page.getByRole('button', { name: /^Resend code in/ })).toBeDisabled();
    await page.getByRole('textbox', { name: 'SMS code', exact: true }).fill('12');
    await page.getByRole('button', { name: 'Verify & continue', exact: true }).click();
    await expect(page.getByText('Enter the six-digit SMS code.', { exact: true })).toBeVisible();
    assert.equal(verifies, 0);
    await page.getByRole('textbox', { name: 'SMS code', exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Verify & continue', exact: true }).click();
    await expect(page.getByText('This verification code or link has expired or was already used. Request a new one.', { exact: true })).toBeVisible();
    assert.equal(verifies, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const codeScan = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(codeScan.violations.map(row => row.id), []);
    await page.screenshot({ path: `${evidence}/code-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Use a different phone number', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'SMS code', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Use email instead', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible();
    assert.ok(page.url().includes('returnTo='));
    report.cases.push({ width, numberValidation: true, smsRequest: true, resendCooldown: true, codeValidation: true, expiredCode: true, emailFallback: true, returnToRetained: true, axeViolations: 0 });
    await context.close();
  }
  assert.deepEqual(report.pageErrors, []);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = error.message; process.exitCode = 1;
  if (activePage && !activePage.isClosed()) {
    report.visibleText = await activePage.locator('body').innerText();
    await activePage.screenshot({ path: `${evidence}/failure.png`, fullPage: true });
  }
} finally {
  await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
