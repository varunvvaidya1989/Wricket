import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { checked } from './backend-fixture.mjs';

export async function verifyCricketSpectator({ page, stack, matchId, fixture }) {
  const context = await page.context().browser().newContext({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
  const spectator = await context.newPage();
  spectator.setDefaultTimeout(60000);
  spectator.setDefaultNavigationTimeout(180000);
  const errors = [];
  spectator.on('pageerror', error => errors.push(error.message));
  try {
    await spectator.goto('http://127.0.0.1:4173/auth', { waitUntil: 'domcontentloaded' });
    await spectator.getByRole('button', { name: 'Sign in with password', exact: true }).click();
    await spectator.getByPlaceholder('Email', { exact: true }).fill(fixture.accounts.at(-1).email);
    await spectator.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
    await spectator.getByRole('button', { name: 'Sign in', exact: true }).click();
    await spectator.waitForURL('**/live');
    await spectator.goto(`http://127.0.0.1:4173/wricket/match/${matchId}/live`, { waitUntil: 'domcontentloaded' });
    await expect(spectator.getByLabel('Match score 0 for 0', { exact: true })).toBeVisible({ timeout: 60000 });
    await page.bringToFront();
    await page.getByRole('radio', { name: 'Numbers', exact: true }).click();
    page.on('dialog', dialog => dialog.accept());
    for (const [runs, total] of [[1, 1], [4, 5]]) {
      await page.getByRole('button', { name: `Record ${runs} runs`, exact: true }).click();
      await expect(page.getByLabel(`Score ${total} for 0`, { exact: true })).toBeVisible();
      await expect(spectator.getByLabel(`Match score ${total} for 0`, { exact: true })).toBeVisible({ timeout: 30000 });
    }
    await page.getByRole('button', { name: 'Undo last ball', exact: true }).click();
    await expect(spectator.getByLabel('Match score 1 for 0', { exact: true })).toBeVisible({ timeout: 30000 });
    const scoreStyle = await spectator.getByLabel('Match score 1 for 0', { exact: true }).evaluate(element => ({ size: getComputedStyle(element.firstElementChild).fontSize, font: getComputedStyle(element.firstElementChild).fontFamily }));
    assert.equal(scoreStyle.size, '43px');
    assert.match(scoreStyle.font, /SpaceGrotesk/);
    await expect(spectator.getByText('WIN PROBABILITY', { exact: true })).toHaveCount(0);
    await spectator.screenshot({ path: '.e2e/r5-overview.png', fullPage: true });
    await spectator.getByRole('tab', { name: 'Ball by ball', exact: true }).click();
    await expect(spectator.getByText('Previous delivery corrected.', { exact: true })).toBeVisible();
    await expect(spectator.getByText(/FOUR/)).toHaveCount(0);
    await spectator.screenshot({ path: '.e2e/r5-commentary.png', fullPage: true });
    await spectator.getByRole('tab', { name: 'Scorecard', exact: true }).click();
    await expect(spectator.getByText('BATTING', { exact: true }).first()).toBeVisible();
    await expect(spectator.getByRole('tab', { name: `Innings 1: ${fixture.teams[0].name}`, exact: true })).toContainText('1/0');
    await spectator.screenshot({ path: '.e2e/r5-scorecard.png', fullPage: true });
    await expect(spectator.getByText('R0 A2 *', { exact: true })).toBeVisible();
    await spectator.getByRole('tab', { name: 'Overview', exact: true }).click();
    await spectator.getByRole('button', { name: 'Match info', exact: true }).click();
    await expect(spectator.getByText(`${fixture.teams[0].name} chose to bat.`, { exact: true })).toBeVisible();
    await expect.poll(async () => (await spectator.getByRole('button', { name: 'Go back', exact: true }).last().boundingBox())?.y ?? 999).toBeLessThan(12);
    await spectator.screenshot({ path: '.e2e/r5-match-info.png', fullPage: true });
    await spectator.getByRole('button', { name: fixture.teams[0].name, exact: true }).click();
    await expect(spectator.getByText('R0 A1 · C', { exact: true })).toBeVisible();
    await spectator.getByRole('button', { name: 'Go back', exact: true }).last().click();
    await spectator.setViewportSize({ width: 320, height: 740 });
    assert.equal(await spectator.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await spectator.screenshot({ path: '.e2e/r5-match-info-320.png', fullPage: true });
    await spectator.getByRole('button', { name: 'Go back', exact: true }).last().click();
    await spectator.setViewportSize({ width: 376, height: 900 });
    await spectator.getByRole('button', { name: 'Share match', exact: true }).click();
    await expect(spectator.getByText('Send the game.', { exact: true })).toBeVisible();
    await expect.poll(async () => (await spectator.getByRole('button', { name: 'Go back', exact: true }).last().boundingBox())?.y ?? 999).toBeLessThan(12);
    await spectator.getByRole('button', { name: 'Copy match link', exact: true }).click();
    await expect(spectator.getByText('Match link copied.', { exact: true })).toBeVisible();
    const sharedUrl = await spectator.evaluate(() => navigator.clipboard.readText());
    assert.equal(sharedUrl, `http://127.0.0.1:4173/match?id=${matchId}`);
    await spectator.screenshot({ path: '.e2e/r5-share-live.png', fullPage: true });
    const downloadPromise = spectator.waitForEvent('download');
    await spectator.getByRole('button', { name: 'Export match image', exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs('.e2e/r5-share-export.png');
    const png = await readFile('.e2e/r5-share-export.png');
    assert.equal(png.readUInt32BE(16), 1080);
    assert.ok(png.readUInt32BE(20) > 700);
    console.log('PASS: live sharing, copied canonical link and 1080px PNG export.');
    await spectator.getByRole('button', { name: 'Go back', exact: true }).last().click();

    // A new signed-out recipient must return to this match after authentication.
    const recipientContext = await page.context().browser().newContext();
    try {
      const recipient = await recipientContext.newPage();
      recipient.setDefaultTimeout(60000);
      recipient.setDefaultNavigationTimeout(180000);
      await recipient.goto(sharedUrl, { waitUntil: 'domcontentloaded' });
      await recipient.getByRole('button', { name: 'Sign in to view match', exact: true }).click();
      await recipient.getByRole('button', { name: 'Sign in with password', exact: true }).click();
      await recipient.getByPlaceholder('Email', { exact: true }).fill(fixture.accounts.at(-1).email);
      await recipient.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
      await recipient.getByRole('button', { name: 'Sign in', exact: true }).click();
      await recipient.waitForURL(url => url.pathname === `/wricket/match/${matchId}/live`);
      await expect(recipient.getByLabel('Match score 1 for 0', { exact: true })).toBeVisible();
    } finally { await recipientContext.close(); }
    console.log('PASS: shared match recipient sign-in returns to the same match.');
    await page.bringToFront();
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Record 0 runs', exact: true }).click();
      await expect(page.getByText(`0.${i + 2} overs`, { exact: false }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Record 0 runs', exact: true })).toBeEnabled();
    }
    await spectator.getByRole('tab', { name: 'Ball by ball', exact: true }).click();
    await expect(spectator.getByText('0.4', { exact: true })).toBeVisible({ timeout: 30000 });
    await spectator.setViewportSize({ width: 376, height: 520 });
    const history = spectator.getByTestId('spectator-history');
    await history.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => history.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
    await page.bringToFront();
    await page.getByRole('button', { name: 'Record 0 runs', exact: true }).click();
    await expect(spectator.getByRole('button', { name: 'New updates', exact: true })).toBeVisible({ timeout: 30000 });
    await expect(spectator.getByText('0.5', { exact: true })).toHaveCount(0);
    await spectator.getByRole('button', { name: 'New updates', exact: true }).click();
    await expect(spectator.getByText('0.5', { exact: true })).toBeVisible();
    await context.setOffline(true);
    await page.bringToFront();
    await page.getByRole('button', { name: 'Undo last ball', exact: true }).click();
    await expect.poll(async () => (await checked(stack.admin.from('match_snapshots').select('scoreboard').eq('match_id', matchId).single())).scoreboard.legal_balls, { timeout: 30000 }).toBe(4);
    await context.setOffline(false);
    await expect(spectator.getByText('0.5', { exact: true })).toHaveCount(0, { timeout: 45000 });
    console.log('PASS: history remains stable until New updates; undo reconciles after reconnect.');
    await spectator.setViewportSize({ width: 376, height: 900 });
    await spectator.getByRole('tab', { name: 'Overview', exact: true }).click();
    await spectator.reload({ waitUntil: 'domcontentloaded' });
    await expect(spectator.getByLabel('Match score 1 for 0', { exact: true })).toBeVisible();
    await page.bringToFront();
    await page.getByRole('button', { name: 'Wicket', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm wicket', exact: true }).click();
    await page.getByRole('button', { name: 'Select R0 A3', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(spectator.getByLabel('Match score 1 for 1', { exact: true })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await page.getByRole('button', { name: 'End innings early', exact: true }).click();
    await page.getByRole('button', { name: 'End innings', exact: true }).click();
    await expect(page.getByText('Select openers', { exact: true })).toBeVisible();
    for (const name of ['R0 B1', 'R0 B2']) await page.getByRole('button', { name: `Select ${name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByRole('button', { name: 'Select R0 A1', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(spectator.getByText('Need 2 from 12 balls', { exact: true })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Record 2 runs', exact: true }).click();
    await page.waitForURL('**/scorecard');
    await expect(spectator.getByText(/won by .* wickets/).first()).toBeVisible({ timeout: 30000 });
    await spectator.screenshot({ path: '.e2e/r5-result.png', fullPage: true });
    await spectator.getByRole('tab', { name: 'Scorecard', exact: true }).click();
    await spectator.getByRole('tab', { name: `Innings 1: ${fixture.teams[0].name}`, exact: true }).click();
    await expect(spectator.getByText('R0 A1', { exact: true })).toBeVisible();
    await spectator.getByRole('tab', { name: `Innings 2: ${fixture.teams[1].name}`, exact: true }).click();
    await expect(spectator.getByText('R0 B1', { exact: true })).toBeVisible();
    await spectator.getByRole('button', { name: 'Share match', exact: true }).click();
    await expect(spectator.getByText(/won by .* wickets/).last()).toBeVisible();
    await expect.poll(async () => (await spectator.getByRole('button', { name: 'Go back', exact: true }).last().boundingBox())?.y ?? 999).toBeLessThan(12);
    await spectator.screenshot({ path: '.e2e/r5-share-result.png', fullPage: true });
    await spectator.getByRole('button', { name: 'Go back', exact: true }).last().click();
    for (const [kind, expected] of [['NO_RESULT', 'No result'], ['CANCELLED', 'Match cancelled'], ['WALKOVER', `${fixture.teams[0].name} won by walkover`]]) {
      await checked(stack.admin.from('matches').update({ status: 'ABANDONED', result: { kind, ...(kind === 'WALKOVER' ? { winnerTeamId: fixture.teams[0].id } : {}) } }).eq('id', matchId));
      await expect(spectator.getByText(expected, { exact: true }).first()).toBeVisible({ timeout: 30000 });
      await spectator.getByRole('button', { name: 'Share match', exact: true }).click();
      await expect(spectator.getByText(expected, { exact: true }).last()).toBeVisible();
      await spectator.getByRole('button', { name: 'Go back', exact: true }).last().click();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: independent spectator, undo, scorecard roles, info, live/result sharing, PNG export, recipient auth return, history hold/latest, reconnect, innings transition and completed result.');
  } catch (error) {
    console.error(error.stack ?? error);
    console.error((await spectator.locator('body').innerText()).slice(0, 6000));
    await spectator.screenshot({ path: '.e2e/r5-failure.png', fullPage: true, timeout: 10000 }).catch(() => undefined);
    throw error;
  } finally { await context.close(); }
}
