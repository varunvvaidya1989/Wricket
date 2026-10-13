import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect as playwrightExpect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';
const expect = playwrightExpect.configure({ timeout: 30000 });

// Only the isolated local fixture is used; preserve its original sport preferences.
const stack = await localClients();
const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(fixture.cleaned, false);
const sports = [{ path: 'badminton', code: 'BADMINTON', name: 'Badminton' }, { path: 'tennis', code: 'TENNIS', name: 'Tennis' }, { path: 'padel', code: 'PADEL', name: 'Padel', doubles: true }, { path: 'table-tennis', code: 'TABLE_TENNIS', name: 'Table Tennis' }, { path: 'pickleball', code: 'PICKLEBALL', name: 'Pickleball', doubles: true }];
const actors = fixture.accounts.slice(0, 4);
const clients = actors.map(() => stack.client());
const catalog = await checked(stack.admin.from('sports').select('id,code'));
const originals = [];
const matches = [];
const clubs = [];
const errors = [];
const run = randomUUID();
const base = 'http://127.0.0.1:4173';
const evidence = '.e2e/rest-of-app-ux3';
const report = { date: '2026-10-12', target: 'isolated local Supabase', checks: [], visuals: [], pageErrors: errors };
await mkdir(evidence, { recursive: true });
await expect.poll(async () => { try { return (await fetch(`${base}/live`, { signal: AbortSignal.timeout(10000) })).ok; } catch { return false; } }, { timeout: 120000 }).toBe(true);
const browser = await chromium.launch({ channel: 'chrome' });
const visible = locator => locator.filter({ visible: true });
async function pageFor(account) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/auth?returnTo=%2Fbadminton`);
  await page.getByRole('button', { name: 'Back', exact: true }).click({ trial: true });
  await expect(page.getByText('Opening your stage', { exact: true }).filter({ visible: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(account.email);
  await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/badminton', { timeout: 30000 }).catch(async error => {
    await page.screenshot({ path: `${evidence}/sign-in-failure.png` });
    console.info(`Sign-in stopped at ${new URL(page.url()).pathname}`);
    console.info((await page.locator('body').innerText()).replace(/[\w.+-]+@[\w.-]+/g, '[email]'));
    throw error;
  });
  return page;
}
async function capture(page, name, focused = false) {
  await page.getByRole('button', { name: name === 'share-preview-390' ? 'Back to match' : focused ? 'Back' : 'Switch sport', exact: true }).click({ trial: true });
  await expect(page.getByText('Opening your stage', { exact: true })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No overflow: ${name}`);
  await page.screenshot({ path: `${evidence}/${name}.png`, animations: 'disabled' });
}
async function sequence(id) { return (await checked(stack.admin.from('sport_scoring_matches').select('current_sequence,status').eq('id', id).single())).current_sequence; }
async function events(id) { return checked(stack.admin.from('sport_scoring_events').select('sequence,client_event_id,kind,payload').eq('scoring_match_id', id).order('sequence')); }
try {
  for (const [index, account] of actors.entries()) {
    await checked(clients[index].auth.signInWithPassword({ email: account.email, password: fixture.password }));
    const existing = await checked(clients[index].from('account_sports').select('sport_id,is_primary,access_status').eq('account_id', account.id));
    assert.ok(existing.every(row => row.access_status === 'ACTIVE'));
    const codes = existing.map(row => catalog.find(sport => sport.id === row.sport_id).code);
    const primary = catalog.find(sport => sport.id === existing.find(row => row.is_primary).sport_id).code;
    originals.push({ codes, primary, account });
    await checked(clients[index].rpc('save_my_sports', { p_display_name: account.name, p_sport_codes: [...new Set([...codes, ...sports.map(sport => sport.code)])], p_primary_sport_code: primary }));
  }
  const scorer = await pageFor(actors[0]);
  console.info('Reviewing racket roots and design widths');
  for (const sport of sports) {
    console.info(`Reviewing ${sport.code} setup and scoring`);
    for (const width of sport.path === 'badminton' ? [320, 390, 1280] : [390]) {
      await scorer.setViewportSize({ width, height: 900 });
      await scorer.goto(`${base}/${sport.path}`);
      await expect(visible(scorer.getByText('See you on court.', { exact: true }))).toBeVisible();
      await scorer.getByRole('button', { name: 'Switch sport', exact: true }).click({ trial: true });
      assert.deepEqual(await visible(scorer.getByRole('button', { name: /^(Now|My game|Explore)(, current page)?$/ })).allTextContents(), ['Now', 'My game', 'Explore']);
      const title = await visible(scorer.getByText('See you on court.', { exact: true })).evaluate(element => ({ font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize }));
      assert.match(title.font, /SpaceGrotesk_600SemiBold/); assert.equal(title.size, '29px');
      await capture(scorer, `${sport.path}-home-${width}`);
      await scorer.getByRole('button', { name: 'My game', exact: true }).click();
      await expect(visible(scorer.getByText('Your side of the game.', { exact: true }))).toBeVisible();
      await capture(scorer, `${sport.path}-my-game-${width}`);
      await scorer.getByRole('button', { name: 'Explore', exact: true }).click();
      await expect(visible(scorer.getByText('More ways to play.', { exact: true }))).toBeVisible();
      await capture(scorer, `${sport.path}-explore-${width}`);
      report.visuals.push({ sport: sport.code, width, ...title, noOverflow: true, topTabs: true });
    }
  }
  report.checks.push('Five racket contexts use Now/My game/Explore; design fonts, mobile/desktop widths and no horizontal overflow');
  await scorer.setViewportSize({ width: 390, height: 900 });
  for (const visibility of ['PUBLIC', 'PRIVATE']) {
    const id = await checked(clients[0].rpc('create_sport_club', { p_sport_code: 'BADMINTON', p_name: `UX3 ${visibility} ${run}`, p_short_name: 'UX3', p_visibility: visibility }));
    clubs.push(id);
  }
  await scorer.goto(`${base}/badminton/search?category=Clubs&q=UX3`);
  await expect(scorer.getByRole('button', { name: new RegExp(`UX3 PUBLIC ${run}`) })).toBeVisible();
  await expect(scorer.getByRole('button', { name: new RegExp(`UX3 PRIVATE ${run}`) })).toHaveCount(0);
  await capture(scorer, 'club-discovery-390');
  await scorer.getByRole('button', { name: new RegExp(`UX3 PUBLIC ${run}`) }).click();
  await scorer.waitForURL(url => url.pathname === `/badminton/club/${clubs[0]}`);
  await scorer.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(scorer).toHaveURL(/search\?category=Clubs&q=UX3/);
  await scorer.reload();
  await expect(scorer.getByRole('textbox', { name: 'Search Badminton clubs' })).toHaveValue('UX3');
  report.checks.push('Actual public-club discovery excludes private clubs and preserves scoped query after detail/Back/direct refresh');
  await scorer.goto(`${base}/badminton/clubs`);
  await expect(scorer.getByRole('button', { name: new RegExp(`UX3 PRIVATE ${run}`) })).toBeVisible();
  await capture(scorer, 'my-clubs-390', true);
  await scorer.route('**/rest/v1/sport_scoring_match_players*', route => new URL(route.request().url()).searchParams.has('account_id') ? route.fulfill({ status: 503, json: { message: 'Review fixture: activity unavailable' } }) : route.continue());
  await scorer.goto(`${base}/badminton/my-sport`);
  await expect(visible(scorer.getByText('Your matches couldn’t be loaded. Please try again.', { exact: true }))).toBeVisible();
  await expect(scorer.getByRole('button', { name: /My matches, Results unavailable/ })).toBeVisible();
  await capture(scorer, 'activity-load-failure-390');
  await scorer.unroute('**/rest/v1/sport_scoring_match_players*');
  await scorer.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(visible(scorer.getByText('Your matches couldn’t be loaded. Please try again.', { exact: true }))).toHaveCount(0);
  report.checks.push('Actual owned private clubs stay available in My clubs; controlled activity failure reports unavailable results and retries without a false empty count');

  for (const sport of sports) {
    await scorer.goto(`${base}/${sport.path}/match/new`);
    console.info(`Reviewing ${sport.code} readiness, setup and scoring`);
    await expect(visible(scorer.getByText('Ready when you are.', { exact: true }))).toBeVisible();
    await expect(visible(scorer.getByRole('tab'))).toHaveCount(0);
    await expect(scorer.getByRole('button', { name: 'Review match', exact: true })).toBeDisabled();
    await capture(scorer, `${sport.path}-setup-empty-390`, true);
    await scorer.getByRole('button', { name: /^Players/ }).click();
    if (sport.doubles) await scorer.getByRole('radio', { name: 'Doubles', exact: true }).click();
    const slots = sport.doubles ? [{ side: 'A', slot: 1, actor: 0 }, { side: 'A', slot: 2, actor: 1 }, { side: 'B', slot: 1, actor: 2 }, { side: 'B', slot: 2, actor: 3 }] : [{ side: 'A', slot: 1, actor: 0 }, { side: 'B', slot: 1, actor: 1 }];
    for (const slot of slots) {
      await scorer.getByRole('button', { name: new RegExp(`^Side ${slot.side} · Player ${slot.slot}:`) }).click();
      await scorer.getByRole('button', { name: `Select ${actors[slot.actor].name}`, exact: true }).click();
    }
    await expect(scorer.getByRole('button', { name: 'Use these players', exact: true })).toBeDisabled();
    await scorer.getByRole('radio', { name: actors[0].name, exact: true }).click();
    await capture(scorer, `${sport.path}-players-390`, true);
    await scorer.getByRole('button', { name: 'Use these players', exact: true }).click();
    await scorer.getByRole('textbox', { name: 'Venue (optional)', exact: true }).fill('UX review · Court 2');
    await scorer.getByRole('button', { name: /^Match rules/ }).click();
    await capture(scorer, `${sport.path}-rules-390`, true);
    if (sport.path === 'table-tennis') {
      await scorer.getByRole('button', { name: 'Customize match rules', exact: true }).click();
      await scorer.getByRole('radio', { name: 'Best of 1', exact: true }).click();
    }
    await scorer.getByRole('button', { name: 'Use these rules', exact: true }).click();
    await scorer.getByRole('button', { name: 'Review match', exact: true }).click();
    await capture(scorer, `${sport.path}-review-390`, true);
    if (sport.path === 'badminton') {
      for (const width of [320, 1280]) {
        await scorer.setViewportSize({ width, height: 900 });
        await capture(scorer, `badminton-review-${width}`, true);
      }
      await scorer.setViewportSize({ width: 390, height: 900 });
    }
    if (sport.path === 'badminton') {
      await scorer.route('**/rest/v1/rpc/create_standalone_sport_scoring_match', route => route.fulfill({ status: 503, json: { message: 'Review fixture: start unavailable' } }));
      await scorer.getByRole('button', { name: 'Start match', exact: true }).click();
      await expect(visible(scorer.getByText(/Your setup is retained/))).toBeVisible();
      await expect(scorer.getByRole('button', { name: 'Start match', exact: true })).toBeEnabled();
      await capture(scorer, 'setup-save-failure-390', true);
      await scorer.unroute('**/rest/v1/rpc/create_standalone_sport_scoring_match');
    }
    const created = scorer.waitForResponse(response => response.url().includes('/rpc/create_standalone_sport_scoring_match'));
    await scorer.getByRole('button', { name: 'Start match', exact: true }).click();
    const response = await created; assert.equal(response.ok(), true);
    const id = await response.json(); assert.match(id, /^[0-9a-f-]{36}$/); matches.push({ id, sport, sideA: slots.filter(slot => slot.side === 'A').map(slot => actors[slot.actor].name).join(' / '), sideB: slots.filter(slot => slot.side === 'B').map(slot => actors[slot.actor].name).join(' / ') });
    const current = matches.at(-1);
    await scorer.waitForURL(url => url.pathname === `/${sport.path}/match/${id}/score`);
    const winner = sport.path === 'pickleball' ? current.sideB : current.sideA;
    await expect(scorer.getByRole('button', { name: `Rally won by ${winner}`, exact: true })).toBeEnabled();
    await capture(scorer, `${sport.path}-score-empty-390`, true);
    if (sport.path === 'badminton') await scorer.getByRole('button', { name: `Rally won by ${winner}`, exact: true }).dblclick();
    else await scorer.getByRole('button', { name: `Rally won by ${winner}`, exact: true }).click();
    await expect.poll(() => sequence(id)).toBe(1);
    await expect(visible(scorer.getByText(/^Rally 1:/))).toBeVisible();
    const first = (await events(id))[0];
    assert.equal(first.kind, 'POINT'); assert.equal(first.payload.winner, sport.path === 'pickleball' ? 1 : 0);
    if (sport.path === 'pickleball') {
      assert.equal(first.payload.headline_score, '0-0 · 0-0');
      await expect(visible(scorer.getByText(/Score unchanged/))).toBeVisible();
    } else assert.equal(first.payload.headline_score, sport.path === 'tennis' || sport.path === 'padel' ? '0-0 · 15-Love' : '0-0 · 1-0');
    await capture(scorer, `${sport.path}-scoring-390`, true);
    const cardBoxes = await scorer.getByRole('button', { name: /^Rally won by/ }).evaluateAll(elements => elements.map(element => { const bounds = element.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom, width: bounds.width, left: bounds.left }; }));
    assert.equal(cardBoxes.length, 2); assert.ok(cardBoxes[1].top > cardBoxes[0].bottom); assert.equal(cardBoxes[0].left, cardBoxes[1].left); assert.equal(cardBoxes[0].width, cardBoxes[1].width);
    const scoreType = await scorer.getByLabel(`${winner} score ${sport.path === 'tennis' || sport.path === 'padel' ? '15' : sport.path === 'pickleball' ? '0' : '1'}`, { exact: true }).evaluate(element => ({ size: getComputedStyle(element).fontSize, font: getComputedStyle(element).fontFamily }));
    assert.equal(scoreType.size, '96px'); assert.match(scoreType.font, /Inter_700Bold/);
    if (sport.path === 'pickleball') assert.equal(await scorer.getByRole('button', { name: /^Rally won by/ }).first().getAttribute('aria-label'), `Rally won by ${current.sideB}`);
    await scorer.getByRole('button', { name: `${sport.path === 'tennis' || sport.path === 'padel' ? 'set' : 'game'} 1, live`, exact: true }).click();
    assert.equal(await sequence(id), 1);
    await scorer.getByRole('button', { name: 'Back to scoring', exact: true }).click();
    if (sport.path === 'badminton' || sport.path === 'padel') {
      for (const width of [320, 1280]) {
        await scorer.setViewportSize({ width, height: 900 });
        await capture(scorer, `${sport.path}-scoring-${width}`, true);
      }
      await scorer.setViewportSize({ width: 390, height: 900 });
    }
    await scorer.getByRole('button', { name: 'Undo last rally', exact: true }).click();
    await expect.poll(() => sequence(id)).toBe(2);
    const undone = await events(id); assert.equal(undone[1].kind, 'UNDO'); assert.equal(undone[1].payload.headline_score, sport.path === 'tennis' || sport.path === 'padel' ? '0-0 · Love-Love' : '0-0 · 0-0');
    const stored = await checked(stack.admin.from('sport_scoring_matches').select('rules_snapshot').eq('id', id).single());
    assert.equal(stored.rules_snapshot.venue, 'UX review · Court 2');
  }
  report.checks.push('All five sports: real eligible player selection, explicit server, readiness/review, persisted venue/rules, create, correct first-rally notation and Undo; doubles grouped; pickleball side-out leaves score unchanged');
  const badminton = matches[0];
  await scorer.goto(`${base}/badminton/match/${badminton.id}/score`);
  await expect(scorer.getByRole('button', { name: `Rally won by ${badminton.sideA}`, exact: true })).toBeEnabled();
  const viewer = await pageFor(actors[1]);
  await viewer.goto(`${base}/badminton/match/${badminton.id}/feed`);
  await expect(visible(viewer.getByText(/Live updates connected/))).toBeVisible();
  await expect(viewer.getByRole('button', { name: /^Rally won by/ })).toHaveCount(0);
  await scorer.getByRole('button', { name: 'Point details', exact: true }).click();
  await scorer.getByRole('switch', { name: 'Add details to each point', exact: true }).click();
  await scorer.getByRole('button', { name: 'Back to scoring', exact: true }).click();
  await scorer.getByRole('button', { name: `Rally won by ${badminton.sideA}`, exact: true }).click();
  await expect(visible(scorer.getByText('A little more context.', { exact: true }))).toBeVisible();
  await expect.poll(() => sequence(badminton.id)).toBe(2);
  await scorer.getByRole('button', { name: `Smash winner by ${badminton.sideA}`, exact: true }).click();
  await expect.poll(() => sequence(badminton.id)).toBe(3);
  await expect(viewer.getByLabel(`${badminton.sideA} score 1`, { exact: true })).toBeVisible();
  assert.equal((await events(badminton.id)).at(-1).payload.point_type, 'SMASH_WINNER');
  await capture(viewer, 'spectator-390', true);
  await viewer.getByRole('button', { name: /^Rally history/ }).click();
  await expect(visible(viewer.getByText('Smash winner', { exact: true }))).toBeVisible();
  await capture(viewer, 'rally-history-390', true);
  await viewer.getByRole('button', { name: 'Back', exact: true }).click();
  await viewer.getByRole('button', { name: /^Match information/ }).click();
  await expect(visible(viewer.getByText('UX review · Court 2', { exact: true }))).toBeVisible();
  await capture(viewer, 'match-information-390', true);
  await viewer.getByRole('button', { name: 'Back', exact: true }).click();
  await viewer.getByRole('button', { name: 'Share match', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Share spectator link', exact: true })).toBeVisible();
  await capture(viewer, 'share-preview-390', true);
  await viewer.getByRole('button', { name: 'Back to match', exact: true }).click();
  await viewer.goto(`${base}/badminton/match/${badminton.id}/score`);
  await expect(visible(viewer.getByText(/Only an assigned official/))).toBeVisible();
  await expect(viewer.getByRole('button', { name: /^Rally won by/ })).toHaveCount(0);
  await capture(viewer, 'scoring-access-unavailable-390', true);
  report.checks.push('Actual spectator live delivery, scoped feed history/information and sharing preview; another player cannot gain scoring access');

  await scorer.getByRole('button', { name: 'Point details', exact: true }).click();
  await scorer.getByRole('switch', { name: 'Add details to each point', exact: true }).click();
  await scorer.getByRole('button', { name: 'Back to scoring', exact: true }).click();
  await scorer.context().setOffline(true);
  await scorer.getByRole('button', { name: `Rally won by ${badminton.sideA}`, exact: true }).click();
  await expect(visible(scorer.getByText(/Could not connect to SportStage/))).toBeVisible();
  assert.equal(await sequence(badminton.id), 3);
  await scorer.context().setOffline(false);
  await scorer.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(visible(scorer.getByText(/Could not connect to SportStage/))).toHaveCount(0);
  await scorer.getByRole('button', { name: `Rally won by ${badminton.sideA}`, exact: true }).click();
  await expect.poll(() => sequence(badminton.id)).toBe(4);
  const log = await events(badminton.id); assert.equal(new Set(log.map(event => event.client_event_id)).size, log.length);
  assert.equal(log.filter(event => event.kind === 'POINT').length, 3);
  report.checks.push('Disconnected cloud submission reports failure with no persisted point; reconnect/read/retry records exactly one new rally');
  await checked(stack.admin.from('sport_scoring_leases').update({ expires_at: new Date(Date.now() - 10000).toISOString() }).eq('scoring_match_id', badminton.id));
  await scorer.getByRole('button', { name: `Rally won by ${badminton.sideA}`, exact: true }).click();
  await expect(visible(scorer.getByText(/Scoring lease expired/)).first()).toBeVisible();
  await expect(scorer.getByRole('button', { name: /^Rally won by/ })).toHaveCount(0);
  assert.equal(await sequence(badminton.id), 4);
  await scorer.getByRole('button', { name: 'Check scoring access', exact: true }).click();
  await expect(scorer.getByRole('button', { name: `Rally won by ${badminton.sideA}`, exact: true })).toBeEnabled();
  await expect(visible(scorer.getByText(/Scoring lease expired/))).toHaveCount(0);
  await scorer.getByRole('button', { name: `Rally won by ${badminton.sideA}`, exact: true }).click();
  await expect.poll(() => sequence(badminton.id)).toBe(5);
  report.checks.push('Actual expired scoring lease removes scoring controls, preserves score and restores authorised scoring after reacquiring access');

  const table = matches.find(item => item.sport.path === 'table-tennis');
  await scorer.goto(`${base}/table-tennis/match/${table.id}/score`);
  for (let point = 0; point < 11; point++) {
    await scorer.getByRole('button', { name: `Rally won by ${table.sideA}`, exact: true }).click();
    await expect.poll(() => sequence(table.id)).toBe(point === 10 ? 14 : point + 3);
    if (point < 10) await expect(scorer.getByRole('button', { name: `Rally won by ${table.sideA}`, exact: true })).toBeEnabled();
  }
  await expect(scorer.getByRole('button', { name: 'View result', exact: true })).toBeVisible();
  await scorer.getByRole('button', { name: 'View result', exact: true }).click();
  await expect(visible(scorer.getByText('MATCH WINNER', { exact: true }))).toBeVisible();
  await capture(scorer, 'completed-result-390', true);
  assert.equal((await events(table.id)).at(-1).kind, 'COMPLETED');
  report.checks.push('One-game table tennis reaches actual completion, persists COMPLETED and opens the completed spectator result');
  await scorer.goto(`${base}/table-tennis/stats`);
  await expect(visible(scorer.getByText('WINNERS IN YOUR MATCHES', { exact: true }))).toBeVisible();
  await expect(visible(scorer.getByText(table.sideA, { exact: true }))).toBeVisible();
  await capture(scorer, 'my-performance-390', true);
  await scorer.goto(`${base}/badminton`);
  await scorer.getByRole('button', { name: /^Resume your match/ }).click();
  await scorer.waitForURL(url => url.pathname === `/badminton/match/${badminton.id}/score`);
  await expect(scorer.getByLabel(`${badminton.sideA} score 3`, { exact: true })).toBeVisible();
  await capture(scorer, 'restored-scoring-390', true);
  await scorer.route('**/rest/v1/sport_scoring_matches*', async route => {
    const response = await route.fetch(); const body = await response.json();
    if (body.id === badminton.id) {
      await route.fulfill({ response, json: { ...body, side_a_players: ['Arjun Ramanathan Northstar Cricket and Racket Club'], side_b_players: ['Dev Mehta Community Racket Sports Club'] } });
    } else await route.fulfill({ response });
  });
  await scorer.setViewportSize({ width: 320, height: 720 });
  await scorer.reload();
  await expect(scorer.getByRole('button', { name: /^Rally won by Arjun Ramanathan/ })).toBeVisible();
  await capture(scorer, 'long-names-controlled-320', true);
  await scorer.getByRole('button', { name: 'Match controls', exact: true }).click();
  await expect(scorer.getByRole('button', { name: 'Back to match', exact: true })).toBeVisible();
  await scorer.getByRole('button', { name: 'Back to match', exact: true }).click();
  await scorer.unroute('**/rest/v1/sport_scoring_matches*');
  assert.equal(await sequence(badminton.id), 5);
  report.checks.push('PDF score-card layout, 96px score typography, serving-first side-out, read-only round previews, restored scoring and actual performance; 320px long-name visual uses controlled participant metadata with no scoring writes');
  assert.deepEqual(errors, []);
  report.result = 'PASS'; await writeFile(`${evidence}/review.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, checks: report.checks, pageErrors: errors.length, evidence }));
} catch (cause) {
  const failedPage = browser.contexts()[0]?.pages()[0];
  if (failedPage) {
    await failedPage.screenshot({ path: `${evidence}/review-failure.png` }).catch(() => undefined);
    console.info(`Review stopped at ${new URL(failedPage.url()).pathname}`);
    console.info((await failedPage.locator('body').innerText()).replace(/[\w.+-]+@[\w.-]+/g, '[email]').slice(0, 2000));
  }
  console.error(String(cause.stack ?? cause).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, '[test email]'));
  throw new Error('Racket UX verification failed; see the sanitized failure above.');
} finally {
  await browser.close();
  for (const match of matches) await checked(stack.admin.from('sport_scoring_matches').delete().eq('id', match.id).eq('created_by', actors[0].id));
  for (const id of clubs) await checked(stack.admin.from('sport_clubs').delete().eq('id', id).eq('owner_account_id', actors[0].id));
  for (const [index, original] of originals.entries()) {
    await checked(clients[index].rpc('save_my_sports', { p_display_name: original.account.name, p_sport_codes: original.codes, p_primary_sport_code: original.primary }));
    await clients[index].auth.signOut({ scope: 'local' });
  }
}
