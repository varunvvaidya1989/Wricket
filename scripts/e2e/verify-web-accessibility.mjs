import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { signedClients, checked } from './signed-release-fixture.mjs';
import { reviewAccessibility } from './accessibility-review.mjs';

const expect = baseExpect.configure({ timeout: 30000 });
const origin = process.argv[2];
const exportDir = process.env.REVIEW_EXPORT_DIR ?? 'dist';
assert.match(origin ?? '', /^(?:http:\/\/127\.0\.0\.1:418[01]|https:\/\/sportstageapp(?:--[a-z0-9]+)?\.expo\.app)$/);
const label = origin.startsWith('http:') ? 'local-export' : origin.includes('--') ? 'preview' : 'production';
const evidence = `.e2e/web-release/coverage3-${label}`;
await mkdir(evidence, { recursive: true });
const report = { origin, label, checks: [], pageErrors: [] };
const stack = await signedClients();
const run = randomUUID();
let accountId, opponentId, clubId, teamId, matchId;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
page.on('pageerror', error => report.pageErrors.push(error.message));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function visit(path) {
  if (label !== 'local-export') await pause(10000);
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try { response = await page.goto(origin + path); }
    catch (error) {
      if (attempt >= 2 || !/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NETWORK_CHANGED/.test(String(error))) throw error;
      await pause(15000); continue;
    }
    if (response.status() === 429) { await pause(30000); continue; }
    assert.equal(response.status(), 200);
    await expect(page.getByText('Opening your stage', { exact: true })).toHaveCount(0);
    return;
  }
  throw new Error('Hosting unavailable after bounded retries');
}
async function review(name, ready) {
  if (ready) await expect(page.getByText(ready, { exact: true }).first()).toBeVisible();
  const modalOpen = await page.locator('[aria-modal="true"]').filter({ visible: true }).count();
  const container = modalOpen ? page.getByRole('dialog') : page.getByRole('main');
  await container.waitFor();
  const firstButton = container.getByRole('button').first();
  if (await firstButton.count()) await firstButton.click({ trial: true });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
  await reviewAccessibility(page, name, report);
  await page.screenshot({ path: `${evidence}/${name}.png`, animations: 'disabled' });
  console.info(`Reviewed ${name}`);
}
try {
  await visit('/live');
  await expect(page.getByText('Back to your game.', { exact: true })).toBeVisible();
  const script = await page.locator('script[src]').evaluateAll(es => es.map(e => new URL(e.src).pathname).find(path => path.includes('/_expo/static/js/web/entry-')));
  const remote = Buffer.from(await (await fetch(origin + script)).arrayBuffer());
  assert.deepEqual(remote, await readFile(`${exportDir}/client${script}`));
  report.bundleSHA256 = createHash('sha256').update(remote).digest('hex');
  await review('home', 'Back to your game.');
  const switcher = page.getByRole('button', { name: 'Switch sport', exact: true });
  await switcher.focus(); await expect(switcher).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL(url => url.pathname === '/switch-sport');
  await review('keyboard-switcher');
  report.checks.push('Keyboard Enter activates sport switching; meaningful page titles and landmarks; no horizontal overflow');
  for (const path of ['/explore', '/start-match', '/auth', '/forgot-password', '/auth-link-error', '/badminton', '/tennis', '/padel', '/table-tennis', '/pickleball']) {
    await visit(path);
    await review(path.slice(1));
  }
  await visit('/auth');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const emailInput = page.getByRole('textbox', { name: 'Email address', exact: true });
  await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
  const descriptionId = await emailInput.getAttribute('aria-describedby');
  assert.ok(descriptionId);
  assert.equal(await page.locator(`[id="${descriptionId}"]`).textContent(), 'Email is required.');
  await review('sign-in-validation');
  await page.getByRole('button', { name: 'Create a SportStage account', exact: true }).click();
  await review('signup');
  await page.setViewportSize({ width: 320, height: 900 });
  await review('signup-320');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  await review('signup-zoom200');
  await page.evaluate(() => { document.body.style.zoom = ''; });
  await page.setViewportSize({ width: 390, height: 900 });
  report.checks.push('Invalid email is programmatically associated with its error; signup at 320px and 200 percent zoom');
  const email = `wricket-access-${run}@example.test`;
  const password = `Access!${randomBytes(18).toString('hex')}`;
  const { user } = await checked(stack.admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { web_release_run: run } }));
  accountId = user.id;
  const client = stack.client(); await checked(client.auth.signInWithPassword({ email, password }));
  await checked(client.rpc('save_my_sports', { p_display_name: 'Accessibility reviewer', p_sport_codes: ['BADMINTON'], p_primary_sport_code: 'BADMINTON' }));
  clubId = await checked(client.rpc('create_sport_club', { p_sport_code: 'BADMINTON', p_name: `Accessibility ${run.slice(0, 8)}`, p_short_name: 'AXE', p_visibility: 'PRIVATE' }));
  teamId = await checked(client.rpc('create_sport_team', { p_club_id: clubId, p_name: 'Accessibility team', p_short_name: 'AXE', p_color_hex: '#a6f477' }));
  await visit('/auth?returnTo=%2Fprofile');
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/profile');
  for (const path of ['/profile', '/account?section=security', '/notifications', '/badminton/match/new']) { await visit(path); await review(path.replace(/[/?=]/g, '-')); }
  await visit(`/badminton/club/${clubId}`);
  await page.getByRole('button', { name: 'Invite player', exact: true }).click();
  await review('club-invitation');
  const close = page.getByRole('button', { name: 'Close', exact: true });
  await close.focus(); await expect(close).toBeFocused(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create reusable team', exact: true }).click();
  await review('club-team-creation');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await visit(`/badminton/team/${teamId}`);
  await review('team', 'Accessibility team');
  await page.getByRole('button', { name: 'Edit eligibility for Accessibility reviewer', exact: true }).click();
  await review('team-eligibility');
  const doubles = page.getByRole('button', { name: 'DOUBLES', exact: true });
  await expect(doubles).toHaveAttribute('aria-pressed', 'true'); await doubles.focus(); await page.keyboard.press('Space'); await expect(doubles).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space'); await expect(doubles).toHaveAttribute('aria-pressed', 'true');
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), true, 'Dialog traps keyboard focus');
  }
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  report.checks.push('Signed-in profile/security/notifications/setup; labelled club/team dialogs, eligibility toggle Space, focus trap and Escape cancellation');
  const opponentEmail = `wricket-access-opponent-${run}@example.test`;
  const opponent = await checked(stack.admin.auth.admin.createUser({ email: opponentEmail, password, email_confirm: true, user_metadata: { web_release_run: run } }));
  opponentId = opponent.user.id;
  const opponentClient = stack.client(); await checked(opponentClient.auth.signInWithPassword({ email: opponentEmail, password }));
  await checked(opponentClient.rpc('save_my_sports', { p_display_name: 'Accessibility opponent', p_sport_codes: ['BADMINTON'], p_primary_sport_code: 'BADMINTON' }));
  const sport = await checked(client.from('sports').select('id').eq('code', 'BADMINTON').single());
  const sideA = await checked(client.from('sport_profiles').select('id').eq('account_id', accountId).eq('sport_id', sport.id).single());
  const sideB = await checked(opponentClient.from('sport_profiles').select('id').eq('account_id', opponentId).eq('sport_id', sport.id).single());
  matchId = await checked(client.rpc('create_standalone_sport_scoring_match', { p_sport_code: 'BADMINTON', p_match_format: 'SINGLES', p_side_a_profile_ids: [sideA.id], p_side_b_profile_ids: [sideB.id], p_rules_snapshot: { initial_server: 0, options: { matchUnitsToWin: 2 } } }));
  await visit(`/badminton/match/${matchId}/score`);
  const scoringCard = page.getByRole('button', { name: 'Rally won by Accessibility reviewer', exact: true });
  await expect(scoringCard).toBeEnabled();
  await review('racket-score');
  await scoringCard.focus(); await page.keyboard.press('Enter');
  await expect.poll(async () => (await checked(client.from('sport_scoring_matches').select('current_sequence').eq('id', matchId).single())).current_sequence).toBe(1);
  await review('racket-score-after-point');
  await page.getByRole('button', { name: 'game 1, live', exact: true }).click();
  await review('racket-game-details');
  await page.getByRole('button', { name: 'Back to scoring', exact: true }).click();
  await page.getByRole('button', { name: 'Match controls', exact: true }).click();
  await review('racket-match-controls');
  await page.getByRole('button', { name: 'Back to match', exact: true }).click();
  await page.getByRole('button', { name: 'Point details', exact: true }).click();
  await review('racket-point-settings');
  await page.getByRole('switch', { name: 'Add details to each point', exact: true }).click();
  await page.getByRole('button', { name: 'Back to scoring', exact: true }).click();
  await scoringCard.click();
  await review('racket-point-details');
  await page.getByRole('button', { name: 'Cancel point', exact: true }).click();
  report.checks.push('Representative live racket scorer: keyboard Enter records one point, accessible score and match-control states; cricket gesture verification remains paused');
  assert.deepEqual(report.pageErrors, []);
  report.status = 'PASS';
} finally {
  await browser.close();
  if (accountId) {
    const { user } = await checked(stack.admin.auth.admin.getUserById(accountId));
    assert.equal(user.user_metadata.web_release_run, run);
    if (matchId) await checked(stack.admin.from('sport_scoring_matches').delete().eq('id', matchId).eq('created_by', accountId));
    if (teamId) await checked(stack.admin.from('sport_teams').delete().eq('id', teamId).eq('owner_account_id', accountId));
    if (clubId) await checked(stack.admin.from('sport_clubs').delete().eq('id', clubId).eq('owner_account_id', accountId));
    await checked(stack.admin.auth.admin.deleteUser(accountId));
  }
  if (opponentId) {
    const { user } = await checked(stack.admin.auth.admin.getUserById(opponentId));
    assert.equal(user.user_metadata.web_release_run, run);
    await checked(stack.admin.auth.admin.deleteUser(opponentId));
  }
  report.fixtureRemoved = true;
  await writeFile(`${evidence}/review.json`, JSON.stringify(report, null, 2));
}
console.info(JSON.stringify({ status: report.status, checks: report.checks, pageErrors: report.pageErrors, bundleSHA256: report.bundleSHA256, fixtureRemoved: report.fixtureRemoved }));
