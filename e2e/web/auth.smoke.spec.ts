import { expect, test } from '@playwright/test';

// Offline UI smoke only. This does not claim real authentication or cricket E2E.
test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
    return route.abort('blockedbyclient');
  });
});

test('auth mode and invalid submission preserve the real form @smoke', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.goto('/auth');
  await expect(page.getByText('Welcome back', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill('not-an-email');
  await page.getByPlaceholder('Password', { exact: true }).fill('invalid');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Email', { exact: true })).toHaveValue('not-an-email');
  await page.getByRole('button', { name: 'Use one-time email link', exact: true }).click();
  await expect(page.getByPlaceholder('Password', { exact: true })).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test('account creation has a recoverable validation state at narrow widths @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Create a SportStage account', exact: true }).click();
  await expect(page.getByLabel('Display name', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Check the highlighted fields and try again.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'I already have an account', exact: true }).click();
  await expect(page.getByText('Welcome back', { exact: true })).toBeVisible();
});
