import assert from 'node:assert/strict';
import { localClients, checked } from './backend-fixture.mjs';
import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
await expect.poll(async () => {
  try { return (await fetch('http://127.0.0.1:4173/status', { signal: AbortSignal.timeout(10000) })).ok; }
  catch { return false; }
}, { timeout: 180000, intervals: [1000, 3000, 5000] }).toBe(true);
const f = JSON.parse(await readFile('.e2e/fixture.json','utf8'));
const stack = await localClients();
const matchIds = async () => (await checked(stack.admin.from('matches').select('id').eq('created_by', f.accounts[0].id).order('id'))).map(row => row.id);
const before = await matchIds();
const browser = await chromium.launch({channel:'chrome'});
const page = await browser.newPage({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
page.setDefaultTimeout(60000);
page.on('pageerror', error => console.log('PAGE ERROR',error.message));
page.on('dialog', dialog => { console.log('DIALOG',dialog.message()); void dialog.dismiss(); });
await page.goto('http://127.0.0.1:4173/auth?returnTo=%2Fwricket%2Fmatch%2Fnew',{waitUntil:'domcontentloaded',timeout:120000});
await page.getByRole('button',{name:'Sign in with password',exact:true}).click();
await page.getByPlaceholder('Email',{exact:true}).fill(f.accounts[0].email);
await page.getByPlaceholder('Password',{exact:true}).fill(f.password);
await page.getByRole('button',{name:'Sign in',exact:true}).click();
await page.waitForURL('**/live',{timeout:30000});
await page.goto('http://127.0.0.1:4173/wricket/match/new',{waitUntil:'domcontentloaded'});
await page.getByRole('button',{name:`TEAM A: ${f.teams[0].name}`,exact:true}).click();
await page.getByRole('button',{name:`TEAM B: ${f.teams[1].name}`,exact:true}).click();
await page.getByRole('textbox',{name:'Overs',exact:true}).fill('2');
await page.getByRole('textbox',{name:'Players per side',exact:true}).fill('3');
await page.getByRole('button',{name:'Choose players',exact:true}).click();
await page.getByRole('button',{name:'Continue to toss',exact:true}).click();
await expect(page.getByText('Make the call.', { exact: true })).toBeVisible();
await page.getByRole('button', { name: 'Virtual coin', exact: true }).click();
await expect(page.getByRole('button', { name: 'Flip the coin', exact: true })).toBeDisabled();
await page.getByRole('button', { name: f.teams[0].name, exact: true }).click();
await page.getByRole('button', { name: 'Heads', exact: true }).click();
await page.getByRole('button', { name: 'Flip the coin', exact: true }).click();
await expect(page.getByText('Result locked', { exact: true })).toBeVisible();
await expect(page.getByRole('button', { name: 'Flip the coin', exact: true })).toHaveCount(0);
await expect(page.getByRole('button', { name: 'On-field toss', exact: true })).toHaveCount(0);
const receipt = await page.getByText(/won the toss[.]$/).innerText();
await page.getByRole('button', { name: 'Bat first', exact: true }).click();
await page.waitForTimeout(500);
await page.reload({ waitUntil: 'domcontentloaded' });
await expect(page.getByText('Result locked', { exact: true })).toBeVisible();
assert.equal(await page.getByText(/won the toss[.]$/).innerText(), receipt);
await expect(page.getByRole('button', { name: 'Bat first', exact: true })).toHaveAttribute('aria-selected', 'true');
await page.screenshot({ path: '.e2e/r2-toss-locked.png', fullPage: true });
await page.getByRole('button', { name: 'Review match', exact: true }).click();
await expect(page.getByRole('button', { name: 'Start scoring', exact: true })).toBeVisible();
await page.getByRole('button', { name: 'Back', exact: true }).click();
await expect(page.getByText('Result locked', { exact: true })).toBeVisible();
assert.equal(await page.getByText(/won the toss[.]$/).innerText(), receipt);
await expect(page.getByRole('button', { name: 'Flip the coin', exact: true })).toHaveCount(0);
await page.getByRole('button', { name: 'Review match', exact: true }).click();
await expect(page.getByRole('button', { name: 'Start scoring', exact: true })).toBeVisible();
assert.deepEqual(await matchIds(), before, 'Reviewing a toss must not create a match');
assert.deepEqual(errors, []);
console.log('PASS: real rosters, explicit toss call, locked result across review/back, no match created.');
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 5000));
  await page.screenshot({ path: '.e2e/r2-failure.png', fullPage: true });
  throw error;
} finally { await browser.close(); }
