import { defineConfig, devices } from '@playwright/test';
import { testEnvironment } from './scripts/e2e/environment.mjs';

const config = testEnvironment(process.env);

export default defineConfig({
  testDir: './e2e/web',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/results.xml' }]],
  use: {
    baseURL: config.baseURL,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.WRICKET_E2E_CHROME_CHANNEL || undefined } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], channel: process.env.WRICKET_E2E_CHROME_CHANNEL || undefined } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'node scripts/e2e/serve.mjs',
    url: config.baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
