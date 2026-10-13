import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

// Use the isolated local fixture; cleanup is limited to this run's tournaments.
const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients();
const owner = fixture.accounts[0];
const tournaments = [];
const errors = [];
let browser;
let page;
const visible = locator => locator.filter({ visible: true });
const expect = baseExpect.configure({ timeout: 15000 });
try {
  for (const mode of ['PLAYER_POOL', 'EXISTING_TEAMS']) {
    const tournament = await checked(stack.admin.from('tournaments').insert({
      created_by: owner.id, source_local_id: randomUUID(), name: 'Team panel ' + mode,
      format: 'TURF', visibility: 'PUBLIC', start_date: '2026-10-11',
      planned_team_count: 4, players_per_team: 7, overs_per_match: 10, settings: { status: 'ACTIVE' },
    }).select('id').single());
    tournaments.push(tournament.id);
    await checked(stack.admin.from('tournament_registration_settings').update({ entry_mode: mode }).eq('tournament_id', tournament.id));
  }
  await expect.poll(async () => {
    try { return (await fetch('http://127.0.0.1:4173/status', { signal: AbortSignal.timeout(10000) })).ok; }
    catch { return false; }
  }, { timeout: 180000 }).toBe(true);
  browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' });
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/auth?returnTo=' + encodeURIComponent('/wricket'));
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill(owner.email);
  await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith('/wricket'));

  const button = name => visible(page.getByRole('button', { name, exact: true }));
  const field = name => visible(page.getByRole('textbox', { name, exact: true }));
  const go = id => page.goto('http://127.0.0.1:4173/wricket/tournament/' + id + '?tab=teams');
  const capture = async path => {
    // Modal slide animations can expose an action before it reaches the viewport.
    await expect.poll(async () => {
      const box = await visible(page.getByRole('button', { name: /^(Create team|Enter selected team)$/ })).boundingBox();
      return Boolean(box && box.y >= 0 && box.y + box.height <= page.viewportSize().height);
    }).toBe(true);
    await page.screenshot({ path, animations: 'disabled' });
  };
  const openPanel = async () => {
    await button('Add tournament team').click();
    await expect(field('Team name')).toBeVisible();
  };

  await go(tournaments[0]);
  await openPanel();
  await expect(button('Create team')).toBeDisabled();
  assert.equal(await visible(page.getByRole('radio', { name: 'Create new team', exact: true })).count(), 0);
  assert.equal(await visible(page.getByRole('radio', { name: 'Use existing team', exact: true })).count(), 0);
  await expect(visible(page.getByText(/These labels are informational/))).toBeVisible();
  await field('Team name').fill('Pool panel draft');
  await field('Team short name').fill('PPD');
  await button('Close team entry').click();
  await expect(visible(page.getByRole('dialog'))).toHaveCount(0);

  // A failed settings read must be visible in CREATE mode and must block writes.
  await page.route('**/rest/v1/tournament_registration_settings*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Team options temporarily unavailable' }),
  }));
  await button('Add tournament team').click();
  await expect(button('Retry team options')).toBeVisible();
  await expect(button('Create team')).toBeDisabled();
  assert.equal(await field('Team name').count(), 0);
  await page.unroute('**/rest/v1/tournament_registration_settings*');
  await button('Retry team options').click();
  await expect(field('Team name')).toHaveValue('Pool panel draft');
  await expect(field('Team short name')).toHaveValue('PPD');
  await page.evaluate(() => document.fonts.ready);
  assert.match(await field('Team name').evaluate(el => getComputedStyle(el).fontFamily), /Inter_400Regular/);
  await capture('.e2e/team-panel-pool-376.png');

  const swatches = visible(page.getByRole('radio', { name: /^Team colour / }));
  assert.equal(await swatches.count(), 8);
  for (const width of [376, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const boxes = await Promise.all((await swatches.all()).map(swatch => swatch.boundingBox()));
    assert.ok(boxes.every(box => box && box.width >= 44 && box.height >= 44));
    assert.ok(boxes.slice(0, 4).every(box => Math.abs(box.y - boxes[0].y) < 1));
    assert.ok(boxes.slice(4).every(box => Math.abs(box.y - boxes[4].y) < 1));
    assert.ok(boxes[4].y > boxes[0].y + 44);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  const chosen = await swatches.nth(4).getAttribute('aria-label');
  await swatches.nth(4).click();
  await expect(swatches.nth(4)).toBeChecked();
  await expect(swatches.nth(0)).not.toBeChecked();
  await capture('.e2e/team-panel-pool-320.png');
  await page.setViewportSize({ width: 320, height: 500 });
  const action = await button('Create team').boundingBox();
  const close = await button('Close team entry').boundingBox();
  assert.ok(action && action.y + action.height <= 500 && action.y >= 0);
  assert.ok(close && close.y >= 0);
  await capture('.e2e/team-panel-short-320.png');
  await page.route('**/rest/v1/teams*', route => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
  await button('Create team').click();
  await expect(visible(page.getByRole('alert'))).toBeVisible();
  await page.unroute('**/rest/v1/teams*');
  await expect(field('Team name')).toHaveValue('Pool panel draft');
  await expect(swatches.nth(4)).toBeChecked();
  await button('Create team').click();
  await expect(button('Open team Pool panel draft')).toBeVisible();
  const poolTeams = await checked(stack.admin.from('teams').select('id,color_hex').eq('tournament_id', tournaments[0]));
  assert.equal(poolTeams.length, 1);
  assert.equal(poolTeams[0].color_hex, chosen.replace('Team colour ', ''));
  assert.deepEqual(await checked(stack.admin.from('team_players').select('player_id').eq('team_id', poolTeams[0].id)), []);
  assert.equal(await visible(page.getByRole('button', { name: /Invite captain for/ })).count(), 0);
  assert.equal((await page.locator('body').innerText()).includes('Captain needed'), false);
  console.info('PASS player-pool guidance, no captain claim/reuse choices, loading failure blocks creation, retained draft, colour selection, single empty team after failed-write retry');

  await page.setViewportSize({ width: 376, height: 900 });
  await go(tournaments[1]);
  await openPanel();
  await expect(visible(page.getByRole('radio', { name: 'Create new team', exact: true }))).toBeChecked();
  await expect(visible(page.getByText(/Invite a captain from the Teams tab/))).toBeVisible();
  await field('Team name').fill('Captain claim placeholder');
  await field('Team short name').fill('CCP');
  await capture('.e2e/team-panel-existing-376.png');
  await button('Create team').click();
  await expect(button('Open team Captain claim placeholder')).toBeVisible();
  await expect(button('Invite captain for Captain claim placeholder')).toBeVisible();
  await openPanel();
  await visible(page.getByRole('radio', { name: 'Use existing team', exact: true })).click();
  await visible(page.getByRole('radio', { name: 'Enter ' + fixture.teams[0].name, exact: true })).click();
  await capture('.e2e/team-panel-reuse-376.png');
  await button('Enter selected team').click();
  await expect(button('Open team ' + fixture.teams[0].name)).toBeVisible();
  const copied = await checked(stack.admin.from('teams').select('id').eq('tournament_id', tournaments[1]).eq('source_team_id', fixture.teams[0].id).single());
  const roster = id => checked(stack.admin.from('team_players').select('player_id,is_captain,is_keeper').eq('team_id', id).order('player_id'));
  assert.deepEqual(await roster(copied.id), await roster(fixture.teams[0].id));
  assert.deepEqual(errors, []);
  console.info('PASS existing-team placeholder and claim action, reusable club entry preserves captain/keeper/roster, 320px layouts and fixed action in a short viewport, design fonts, zero page errors');

  if (process.env.WRICKET_NATIVE_EXISTING_OWNER_SESSION === '1') {
    const { adb, nativePackage, nodes, tap, tapNode, type, open, waitFor, waitForMetro, screenshot, hideKeyboard } = await import('./native-driver.mjs');
    const originalScale = adb('shell', 'settings', 'get', 'system', 'font_scale').trim();
    try {
      await waitForMetro();
      for (const scale of ['1.0', '1.3']) {
        adb('shell', 'am', 'force-stop', nativePackage);
        adb('shell', 'settings', 'put', 'system', 'font_scale', scale);
        open('/wricket/tournament/' + tournaments[0] + '?tab=teams');
        await tap('Add tournament team');
        await waitFor('Team name');
        const name = 'Native panel ' + scale;
        tapNode(await waitFor('Team name')); type(name); hideKeyboard();
        tapNode(await waitFor('Team short name')); type('NP');
        assert.match(adb('shell', 'dumpsys', 'input_method'), /mInputShown=true|isInputViewShown=true/);
        const create = await waitFor('Create team');
        assert.equal(create.enabled, 'true');
        screenshot('native-team-panel-keyboard-' + scale.replace('.', '') + '.png');
        // Submit while the keyboard is still open; the fixed action must receive the tap.
        tapNode(create);
        await waitFor('Open team ' + name);
        assert.equal(nodes().some(node => node['content-desc'] === 'Invite captain for ' + name), false);
        console.info('PASS Android player-pool panel: reachable fixed action and actual creation with keyboard open at font scale ' + scale);
      }
    } finally {
      adb('shell', 'am', 'force-stop', nativePackage);
      if (/^\d+(?:\.\d+)?$/.test(originalScale)) adb('shell', 'settings', 'put', 'system', 'font_scale', originalScale);
    }
  }
} catch (error) {
  await page?.screenshot({ path: '.e2e/team-panel-failed.png' }).catch(() => undefined);
  throw error;
} finally {
  await browser?.close();
  for (const id of tournaments) await checked(stack.admin.from('tournaments').delete().eq('id', id).eq('created_by', owner.id));
}
