import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';
import { verifyCricketControls } from './verify-cricket-controls.mjs';
import { verifyCricketSpectator } from './verify-cricket-spectator.mjs';

await expect.poll(async () => {
  try { return (await fetch('http://127.0.0.1:4173/status', { signal: AbortSignal.timeout(10000) })).ok; }
  catch { return false; }
}, { timeout: 180000, intervals: [1000, 3000, 5000] }).toBe(true);

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients();
const owner = fixture.accounts[0];
const before = new Set((await checked(stack.admin.from('matches').select('id').eq('created_by', owner.id))).map(row => row.id));
const browser = await chromium.launch({ channel: process.env.WRICKET_E2E_CHROME_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(180000);
const errors = [];
page.on('pageerror', error => errors.push(error.stack ?? error.message));
let createdId;
try {
  await page.goto('http://127.0.0.1:4173/auth?returnTo=%2Fwricket%2Fmatch%2Fnew', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill(owner.email);
  await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/live');
  await page.goto('http://127.0.0.1:4173/wricket/match/new', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/Less setup[.]\s*More cricket[.]/)).toBeVisible();
  await page.getByRole('button', { name: `TEAM A: ${fixture.teams[0].name}`, exact: true }).click();
  await page.getByRole('button', { name: `TEAM B: ${fixture.teams[1].name}`, exact: true }).click();
  await page.getByRole('textbox', { name: 'Overs', exact: true }).fill('2');
  await page.getByRole('textbox', { name: 'Players per side', exact: true }).fill('3');
  await page.screenshot({ path: '.e2e/r2-readiness.png', fullPage: true });
  await page.getByRole('button', { name: 'Choose players', exact: true }).click();
  await expect(page.getByText('The playing 3.', { exact: true })).toBeVisible();
  await expect(page.getByText('3/3 selected', { exact: true })).toHaveCount(2);
  await expect(page.getByText('CAPTAIN', { exact: true })).toHaveCount(2);
  await page.screenshot({ path: '.e2e/r2-playing-sides.png', fullPage: true });
  await page.getByRole('button', { name: 'Continue to toss', exact: true }).click();
  await page.getByRole('button', { name: 'On-field toss', exact: true }).click();
  await page.getByRole('button', { name: fixture.teams[0].name, exact: true }).click();
  await page.getByRole('button', { name: 'Bat first', exact: true }).click();
  await page.getByRole('button', { name: 'Review match', exact: true }).click();
  await page.getByRole('button', { name: 'Start scoring', exact: true }).click();
  await page.waitForURL('**/score');
  createdId = page.url().match(/match\/([^/]+)\/score/)?.[1];
  assert.ok(createdId && !before.has(createdId), 'Setup must open one newly created canonical match');
  await expect(page.getByText('Select openers', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select R0 A1', exact: true }).click();
  await page.getByRole('button', { name: 'Select R0 A2', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Select bowler', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select R0 B1', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByLabel('Score 0 for 0', { exact: true })).toBeVisible();

  if (process.env.WRICKET_E2E_SCORING === '1') {
    page.on('dialog', dialog => dialog.accept());
    await expect(page.getByRole('radio', { name: 'Numbers', exact: true })).toBeChecked();
    const numericStyle = await page.getByRole('button', { name: 'Record 4 runs', exact: true }).evaluate(element => ({
      height: getComputedStyle(element).height,
      color: getComputedStyle(element).backgroundColor,
      font: getComputedStyle(element.firstElementChild).fontFamily,
      size: getComputedStyle(element.firstElementChild).fontSize,
    }));
    assert.equal(numericStyle.height, '52px');
    assert.equal(numericStyle.color, 'rgb(41, 62, 35)');
    assert.match(numericStyle.font, /SpaceGrotesk/);
    assert.equal(numericStyle.size, '28px');
    assert.equal(await page.getByLabel('Score 0 for 0', { exact: true }).evaluate(element => getComputedStyle(element.firstElementChild).fontSize), '43px');
    await page.getByRole('button', { name: 'Record 0 runs', exact: true }).click();
    await expect(page.getByText('Recorded · 0 runs', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo last ball', exact: true }).click();
    await expect(page.getByText('Last delivery undone', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record 1 runs', exact: true })).toBeEnabled();
    for (const [runs, total] of [[1, 1], [4, 5], [4, 9]]) {
      await page.getByRole('button', { name: `Record ${runs} runs`, exact: true }).click();
      await expect(page.getByText(`Recorded · ${runs} ${runs === 1 ? 'run' : 'runs'}`, { exact: true })).toBeVisible();
      await expect(page.getByLabel(`Score ${total} for 0`, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Record 0 runs', exact: true })).toBeEnabled();
    }
    await page.getByRole('button', { name: 'Undo last ball', exact: true }).click();
    await expect(page.getByText('Last delivery undone', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Score 5 for 0', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Extras', exact: true }).click();
    await expect(page.getByText('Record an extra.', { exact: true })).toBeVisible();
    await expect.poll(async () => (await page.getByRole('button', { name: 'Close extras', exact: true }).boundingBox())?.y ?? 999).toBeLessThan(80);
    await expect(page.getByRole('button', { name: 'Record delivery', exact: true })).toBeInViewport();
    assert.equal(await page.getByText('Record an extra.', { exact: true }).evaluate(element => getComputedStyle(element).fontSize), '27px');
    await page.screenshot({ path: '.e2e/r3-extras.png', fullPage: true });
    for (const label of ['No ball', 'Bye', 'Leg bye', 'Wide']) {
      await page.getByRole('radio', { name: label, exact: true }).click();
      await expect(page.getByText(label === 'Wide' || label === 'No ball' ? 'The legal ball count stays at 0.2.' : 'This delivery advances the over to 0.3.', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Record delivery', exact: true }).click();
    await expect(page.getByText('Recorded · wide · 0 additional runs', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Score 6 for 0', { exact: true })).toBeVisible();
    await expect(page.getByText(/0\.2 overs/)).toBeVisible();
    await page.getByRole('button', { name: 'Wicket', exact: true }).click();
    await expect(page.getByText('What a moment.', { exact: true })).toBeVisible();
    await expect.poll(async () => (await page.getByRole('button', { name: 'Close wicket', exact: true }).boundingBox())?.y ?? 999).toBeLessThan(80);
    await expect(page.getByRole('button', { name: 'Confirm wicket', exact: true })).toBeInViewport();
    await page.screenshot({ path: '.e2e/r3-wicket.png', fullPage: true });
    await page.getByRole('button', { name: 'Close wicket', exact: true }).click();
    await expect.poll(async () => {
      const rows = await checked(stack.admin.from('match_snapshots').select('scoreboard').eq('match_id', createdId));
      return rows.map(row => [row.scoreboard.total_runs, row.scoreboard.legal_balls]);
    }, { timeout: 30000 }).toEqual([[6, 2]]);
    await page.getByRole('radio', { name: 'Gestures', exact: true }).click();
    await page.screenshot({ path: '.e2e/r3-gesture-layout.png', fullPage: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('radio', { name: 'Gestures', exact: true })).toBeChecked();
    await expect(page.getByLabel('Score 6 for 0', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Numbers', exact: true }).click();
    await page.screenshot({ path: '.e2e/r3-numeric-scoring.png', fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await expect(page.getByRole('button', { name: 'Record 6 runs', exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Scoring must fit a narrow viewport');
    await page.screenshot({ path: '.e2e/r3-numeric-scoring-320.png', fullPage: true });
    await page.getByRole('button', { name: 'Undo last ball', exact: true }).click();
    await expect(page.getByLabel('Score 5 for 0', { exact: true })).toBeVisible();
    await expect.poll(async () => {
      const rows = await checked(stack.admin.from('match_snapshots').select('scoreboard').eq('match_id', createdId));
      return rows.map(row => [row.scoreboard.total_runs, row.scoreboard.legal_balls]);
    }, { timeout: 30000 }).toEqual([[5, 2]]);
    await page.getByRole('button', { name: 'Wicket', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm wicket', exact: true }).click();
    await expect(page.getByText('Next batter', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Select R0 A3', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByLabel('Score 5 for 1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo last ball', exact: true }).click();
    await expect(page.getByLabel('Score 5 for 0', { exact: true })).toBeVisible();
    await expect.poll(async () => {
      const rows = await checked(stack.admin.from('match_snapshots').select('scoreboard').eq('match_id', createdId));
      return rows.map(row => [row.scoreboard.total_runs, row.scoreboard.total_wickets, row.scoreboard.legal_balls]);
    }, { timeout: 30000 }).toEqual([[5, 0, 2]]);
    console.log('PASS: numeric deliveries, consecutive boundaries, Undo, extras previews and wide legality, wicket cancellation/confirmation/replacement/Undo, restored input preference and score, design tokens and narrow layout.');
  }

  const [matches, xis, innings] = await Promise.all([
    checked(stack.admin.from('matches').select('id,status,toss_winner_team_id,toss_choice,rules').eq('id', createdId)),
    checked(stack.admin.from('match_xis').select('team_id,player_id,is_captain').eq('match_id', createdId)),
    checked(stack.admin.from('match_innings').select('sequence,status,batting_team_id,bowling_team_id').eq('match_id', createdId)),
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].status, 'IN_PROGRESS');
  assert.equal(matches[0].toss_choice, 'BAT');
  assert.equal(matches[0].rules.oversPerInnings, 2);
  assert.equal(matches[0].rules.playersPerSide, 3);
  assert.equal(xis.length, 6);
  assert.equal(xis.filter(row => row.is_captain).length, 2);
  assert.deepEqual(innings.map(row => row.sequence), [1]);
  assert.deepEqual(errors, []);
  console.log('PASS: readiness, eligible XIs, toss, one canonical match, opening roles and 0.0 entry.');
  if (process.env.WRICKET_E2E_SPECTATOR === '1') {
    await verifyCricketSpectator({ page, stack, matchId: createdId, fixture });
    assert.deepEqual(errors, []);
  }
  if (process.env.WRICKET_E2E_CONTROLS === '1') {
    await verifyCricketControls({ page, stack, matchId: createdId, fixture });
    assert.deepEqual(errors, []);
  }
} catch (error) {
  console.error(error.stack ?? error);
  console.error((await page.locator('body').innerText()).slice(0, 5000));
  await page.screenshot({ path: '.e2e/r2-start-failure.png', fullPage: true, timeout: 10000 }).catch(() => undefined);
  throw error;
} finally {
  await context.close();
  await browser.close();
  if (createdId) await checked(stack.admin.from('matches').delete().eq('id', createdId).eq('created_by', owner.id));
}
