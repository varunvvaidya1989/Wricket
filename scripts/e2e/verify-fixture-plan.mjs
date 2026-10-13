import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

await expect.poll(async () => {
  try { return (await fetch('http://127.0.0.1:4173/status', { signal: AbortSignal.timeout(5000) })).ok; }
  catch { return false; }
}, { timeout: 180000 }).toBe(true);

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients();
const owner = fixture.accounts[0];
const tournament = await checked(stack.admin.from('tournaments').insert({ created_by: owner.id, source_local_id: randomUUID(), name: 'Phase 7 Fixture Review', format: 'TURF', visibility: 'PRIVATE', start_date: '2026-10-10', planned_team_count: 8, players_per_team: 7, overs_per_match: 10, settings: { status: 'ACTIVE' } }).select('id').single());
let browser;
try {
  const teams = await checked(stack.admin.from('teams').insert(Array.from({ length: 8 }, (_, index) => ({ tournament_id: tournament.id, name: `Plan Team ${index + 1}`, short_name: `P${index + 1}`, color_hex: '#19AF74', entity_owner_id: owner.id }))).select('id,name'));
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000);
  const errors = []; page.on('pageerror', error => errors.push(error.stack ?? error.message));
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(`http://127.0.0.1:4173/auth?returnTo=${encodeURIComponent(`/tournament?id=${tournament.id}`)}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
    await page.getByPlaceholder('Email', { exact: true }).fill(owner.email);
    await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith('/wricket/tournament/'));
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await page.getByRole('button', { name: 'Fixture plan', exact: true }).click();
    await page.getByRole('radio', { name: 'Groups → knockout', exact: true }).click();
    await page.getByRole('textbox', { name: 'Groups', exact: true }).fill('99999999');
    await expect(page.getByRole('button', { name: 'Assign teams to groups', exact: true })).toBeDisabled();
    await page.getByRole('textbox', { name: 'Groups', exact: true }).fill('2');
    await page.getByRole('textbox', { name: 'Advance per group', exact: true }).fill('2');
    await page.screenshot({ path: '.e2e/r6-format.png', fullPage: true });
    await page.getByRole('button', { name: 'Assign teams to groups', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review fixture plan', exact: true })).toBeDisabled();
    for (let index = 0; index < 8; index++) {
      await page.getByRole('button', { name: `Plan Team ${index + 1}`, exact: true }).click();
      if (index === 4) await expect(page.getByRole('button', { name: 'Group A', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: index < 4 ? 'Group A' : 'Group B', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Move Plan Team 1', exact: true }).click();
    await page.getByRole('button', { name: 'Move to unassigned', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review fixture plan', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Plan Team 1', exact: true }).click();
    await page.getByRole('button', { name: 'Group A', exact: true }).click();
    await page.screenshot({ path: '.e2e/r6-groups.png', fullPage: true });
    await page.getByRole('button', { name: 'Review fixture plan', exact: true }).click();
    await expect(page.getByText('12 group matches', { exact: true })).toBeVisible();
    await page.screenshot({ path: '.e2e/r6-plan-review.png', fullPage: true });
    await page.getByRole('button', { name: 'Edit plan', exact: true }).click();
    await page.getByRole('button', { name: 'Back to format', exact: true }).click();
    await page.getByRole('radio', { name: 'Double round robin', exact: true }).click();
    await page.getByRole('button', { name: 'Assign teams to groups', exact: true }).click();
    await page.getByRole('button', { name: 'Review fixture plan', exact: true }).click();
    await expect(page.getByText('24 group matches', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit plan', exact: true }).click();
    await page.getByRole('button', { name: 'Back to format', exact: true }).click();
    await page.getByRole('radio', { name: 'Round robin', exact: true }).click();
    await page.getByRole('button', { name: 'Assign teams to groups', exact: true }).click();
    await page.getByRole('button', { name: 'Review fixture plan', exact: true }).click();
    await page.setViewportSize({ width: 320, height: 740 });
    await expect(page.getByText('12 group matches', { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: '.e2e/r6-plan-320.png', fullPage: true });
    await page.getByRole('button', { name: 'Generate group fixtures', exact: true }).click();
    await expect(page.getByText('Fixtures ready', { exact: true })).toBeVisible();
    const stages = await checked(stack.admin.from('fixture_stages').select('id').eq('tournament_id', tournament.id));
    assert.equal(stages.length, 1);
    const groups = await checked(stack.admin.from('fixture_groups').select('id,team_ids').eq('stage_id', stages[0].id));
    const matches = await checked(stack.admin.from('fixture_matches').select('group_id,team_a_id,team_b_id').eq('stage_id', stages[0].id));
    assert.equal(matches.length, 12);
    assert.equal(groups.length, 2);
    assert.ok(matches.every(match => groups.some(group => group.id === match.group_id && group.team_ids.includes(match.team_a_id) && group.team_ids.includes(match.team_b_id))));
    assert.deepEqual(new Set(groups.flatMap(group => group.team_ids)), new Set(teams.map(team => team.id)));
    await page.getByRole('button', { name: 'Undo group fixtures and change format', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Knockout only', exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Knockout only', exact: true }).click();
    await page.getByRole('button', { name: 'Review opening bracket', exact: true }).click();
    await expect(page.getByText('8-team knockout', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Generate opening bracket', exact: true }).click();
    await expect(page.getByText('Fixtures ready', { exact: true })).toBeVisible();
    const knockout = await checked(stack.admin.from('fixture_stages').select('id,type').eq('tournament_id', tournament.id));
    assert.equal(knockout.length, 1); assert.equal(knockout[0].type, 'KNOCKOUT');
    const opening = await checked(stack.admin.from('fixture_matches').select('team_a_id,team_b_id').eq('stage_id', knockout[0].id));
    assert.equal(opening.length, 4);
    assert.deepEqual(errors, []);
    console.log('PASS: eight-team group assignment, capacity/move guards, 12/24-match previews, 320px review, persisted pairings, reset and knockout-only generation.');
  } catch (error) {
    console.error(error.stack ?? error);
    console.error((await page.locator('body').innerText()).slice(0, 4500));
    await page.screenshot({ path: '.e2e/r6-plan-failure.png', fullPage: true, timeout: 10000 }).catch(() => undefined);
    throw error;
  }
} finally {
  await browser?.close();
  await checked(stack.admin.from('fixture_stages').delete().eq('tournament_id', tournament.id));
  await checked(stack.admin.from('matches').delete().eq('tournament_id', tournament.id));
  await checked(stack.admin.from('tournaments').delete().eq('id', tournament.id).eq('created_by', owner.id));
}
