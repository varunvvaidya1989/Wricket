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
const tournament = await checked(stack.admin.from('tournaments').insert({ created_by: owner.id, source_local_id: randomUUID(), name: 'Phase 7 Manual and Bracket Review', format: 'TURF', visibility: 'PRIVATE', start_date: '2026-10-10', planned_team_count: 8, players_per_team: 7, overs_per_match: 10, settings: { status: 'ACTIVE' } }).select('id').single());
let browser;
try {
  const teams = await checked(stack.admin.from('teams').insert(Array.from({ length: 8 }, (_, index) => ({ tournament_id: tournament.id, name: `Bracket Team ${index + 1}`, short_name: `B${index + 1}`, color_hex: '#19AF74', entity_owner_id: owner.id }))).select('id,name'));
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000);
  const errors = []; page.on('pageerror', error => errors.push(error.stack ?? error.message));
  page.on('dialog', dialog => dialog.accept());
  const pair = async (a, b, round) => {
    await page.getByRole('textbox', { name: 'Round order', exact: true }).fill(String(round));
    await page.getByRole('radio', { name: `Team A Bracket Team ${a}`, exact: true }).click();
    await expect(page.getByRole('radio', { name: `Team B Bracket Team ${a}`, exact: true })).toBeDisabled();
    await page.getByRole('radio', { name: `Team B Bracket Team ${b}`, exact: true }).click();
  };
  try {
    await page.goto(`http://127.0.0.1:4173/auth?returnTo=${encodeURIComponent(`/tournament?id=${tournament.id}`)}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
    await page.getByPlaceholder('Email', { exact: true }).fill(owner.email);
    await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith('/wricket/tournament/'));
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await page.getByRole('button', { name: 'Fixture plan', exact: true }).click();
    await page.waitForURL(url => url.pathname.endsWith('/fixtures') && !url.pathname.includes('[id]'));
    await expect(page.getByText('A plan for every game.', { exact: true })).toBeVisible();
    const route = new URL(page.url());
    await page.getByRole('radio', { name: 'Manual', exact: true }).click();
    await page.getByRole('button', { name: 'Add group stage', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Group stage added', exact: true })).toBeVisible();
    for (const [groupName, first] of [['Group A', 1], ['Group B', 5]]) {
      await page.getByRole('textbox', { name: 'Group name', exact: true }).fill(groupName);
      for (let index = first; index < first + 4; index++) await page.getByRole('checkbox', { name: `Group team Bracket Team ${index}`, exact: true }).click();
      await page.getByRole('button', { name: 'Add group', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: `Group team Bracket Team ${first}`, exact: true })).toBeDisabled();
    }
    await page.getByRole('radio', { name: 'Group A', exact: true }).click();
    await pair(1, 4, 1);
    await page.getByRole('button', { name: 'Add fixture', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit fixture 1', exact: true })).toBeVisible();
    const firstCanonical = await checked(stack.admin.from('matches').select('id,fixture_match_id').eq('tournament_id', tournament.id).single());
    await page.getByRole('button', { name: 'Edit fixture 1', exact: true }).click();
    await pair(3, 4, 4);
    await page.getByRole('button', { name: 'Save fixture', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save fixture', exact: true })).toHaveCount(0);
    const edited = await checked(stack.admin.from('matches').select('id,team_a_id').eq('fixture_match_id', firstCanonical.fixture_match_id).single());
    assert.equal(edited.id, firstCanonical.id); assert.equal(edited.team_a_id, teams.find(team => team.name === 'Bracket Team 3').id);
    await page.getByRole('button', { name: 'Edit fixture 1', exact: true }).click();
    await pair(1, 4, 1);
    await page.getByRole('button', { name: 'Save fixture', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save fixture', exact: true })).toHaveCount(0);
    await pair(1, 2, 1);
    await expect(page.getByRole('button', { name: 'Add fixture', exact: true })).toBeDisabled();
    await expect(page.getByText('A selected team already has a fixture in this round.', { exact: true })).toBeVisible();
    // Reset the form through a group switch; create exactly the remaining eleven pairings.
    await page.getByRole('radio', { name: 'Group B', exact: true }).click();
    let fixtureCount = 1;
    for (const [groupName, offset] of [['Group A', 0], ['Group B', 4]]) {
      await page.getByRole('radio', { name: groupName, exact: true }).click();
      for (const [a, b, round] of [[1, 4, 1], [2, 3, 1], [3, 1, 2], [4, 2, 2], [1, 2, 3], [3, 4, 3]]) {
        if (offset === 0 && a === 1 && b === 4) continue;
        await pair(a + offset, b + offset, round);
        await page.getByRole('button', { name: 'Add fixture', exact: true }).click();
        fixtureCount += 1;
        await expect.poll(async () => (await checked(stack.admin.from('matches').select('id').eq('tournament_id', tournament.id))).length).toBe(fixtureCount);
        await expect(page.getByRole('textbox', { name: 'Group name', exact: true })).toBeEditable();
        await expect(page.getByRole('radio', { name: `Team A Bracket Team ${a + offset}`, exact: true })).not.toHaveAttribute('aria-checked', 'true');
      }
    }
    await page.getByText('Build stage by stage.', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.e2e/r6-manual.png', fullPage: true });
    let stages = await checked(stack.admin.from('fixture_stages').select('id,type').eq('tournament_id', tournament.id));
    const groupId = stages.find(stage => stage.type === 'GROUP').id;
    const groupFixtures = await checked(stack.admin.from('fixture_matches').select('id,team_a_id,team_b_id').eq('stage_id', groupId));
    assert.equal(groupFixtures.length, 12);
    console.log('PASS: manual groups, twelve explicit fixtures, self/round conflict guards and canonical edit identity.');
    for (const match of groupFixtures) {
      const a = Number(teams.find(team => team.id === match.team_a_id).name.split(' ').at(-1));
      const b = Number(teams.find(team => team.id === match.team_b_id).name.split(' ').at(-1));
      await checked(stack.admin.from('matches').update({ status: 'COMPLETED', result: { kind: 'WIN', winnerTeamId: a < b ? match.team_a_id : match.team_b_id } }).eq('fixture_match_id', match.id));
    }
    route.searchParams.set('focus', 'knockout');
    console.log(`Opening winning bracket at ${route.pathname}.`);
    await page.goto(route.toString(), { waitUntil: 'domcontentloaded' });
    await page.getByRole('radio', { name: 'Custom qualifiers', exact: true }).click();
    await expect(page.getByText('Build stage by stage.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit fixture 1', exact: true })).toHaveCount(0);
    for (const number of [1, 5, 2, 6]) await page.getByRole('checkbox', { name: `Qualifier Bracket Team ${number}`, exact: true }).click();
    await page.getByRole('button', { name: 'Move Bracket Team 5 down', exact: true }).click();
    await page.screenshot({ path: '.e2e/r6-seeding.png', fullPage: true });
    await page.getByRole('button', { name: 'Confirm and generate knockout', exact: true }).click();
    await expect(page.getByText('The road to the title.', { exact: true })).toBeVisible();
    stages = await checked(stack.admin.from('fixture_stages').select('id,type').eq('tournament_id', tournament.id));
    const knockoutId = stages.find(stage => stage.type === 'KNOCKOUT').id;
    const semis = await checked(stack.admin.from('fixture_matches').select('id,team_a_id,team_b_id').eq('stage_id', knockoutId).eq('round', 1));
    const id = number => teams.find(team => team.name === `Bracket Team ${number}`).id;
    assert.deepEqual(new Set(semis.map(match => [match.team_a_id, match.team_b_id].join('|'))), new Set([[id(1), id(2)], [id(5), id(6)]].map(pair => pair.join('|'))));
    await page.getByRole('button', { name: 'Reset knockout fixtures', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Custom qualifiers', exact: true })).toBeVisible();
    assert.equal((await checked(stack.admin.from('fixture_matches').select('id').eq('stage_id', groupId))).length, 12);
    await page.getByRole('radio', { name: 'Top 4 · SF → Final', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm and generate knockout', exact: true }).click();
    await expect(page.getByText('The road to the title.', { exact: true })).toBeVisible();
    const stage = await checked(stack.admin.from('fixture_stages').select('id').eq('tournament_id', tournament.id).eq('type', 'KNOCKOUT').single());
    const opening = await checked(stack.admin.from('fixture_matches').select('id,team_a_id,team_b_id').eq('stage_id', stage.id).eq('round', 1));
    const first = opening[0];
    await checked(stack.admin.from('matches').update({ status: 'COMPLETED', result: { kind: 'NO_RESULT' } }).eq('fixture_match_id', first.id));
    await checked(stack.admin.from('matches').update({ status: 'COMPLETED', result: { kind: 'WIN', winnerTeamId: opening[1].team_b_id } }).eq('fixture_match_id', opening[1].id));
    await page.getByRole('button', { name: 'Refresh bracket', exact: true }).click();
    await expect(page.getByText('Result needs resolution', { exact: true })).toBeVisible();
    assert.equal((await checked(stack.admin.from('fixture_matches').select('id').eq('stage_id', stage.id).eq('round', 2))).length, 0);
    await expect(page.getByRole('button', { name: 'Reset knockout fixtures', exact: true })).toHaveCount(0);
    await checked(stack.admin.from('matches').update({ result: { kind: 'WIN', winnerTeamId: first.team_b_id } }).eq('fixture_match_id', first.id));
    await page.getByRole('button', { name: 'Refresh bracket', exact: true }).click();
    await expect.poll(async () => (await checked(stack.admin.from('fixture_matches').select('id').eq('stage_id', stage.id).eq('round', 2))).length).toBe(1);
    const final = await checked(stack.admin.from('fixture_matches').select('id,team_a_id,team_b_id').eq('stage_id', stage.id).eq('round', 2).single());
    assert.deepEqual(new Set([final.team_a_id, final.team_b_id]), new Set(opening.map(match => match.team_b_id)));
    await page.getByRole('button', { name: 'Refresh bracket', exact: true }).click();
    assert.equal((await checked(stack.admin.from('fixture_matches').select('id').eq('stage_id', stage.id))).length, 3);
    await page.getByText('The road to the title.', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.e2e/r6-bracket-progress.png', fullPage: true });
    await checked(stack.admin.from('matches').update({ status: 'COMPLETED', result: { kind: 'WIN', winnerTeamId: final.team_a_id } }).eq('fixture_match_id', final.id));
    await page.getByRole('button', { name: 'Refresh bracket', exact: true }).click();
    await expect(page.getByText('CHAMPION', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 740 });
    await page.getByText('CHAMPION', { exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: '.e2e/r6-champion-320.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: reordered custom pairing persistence, reset retaining group results, unresolved-result block, recorded semifinal winners, one final and champion.');
  } catch (error) {
    console.error(error.stack ?? error); console.error((await page.locator('body').innerText()).slice(0, 6000));
    await page.screenshot({ path: '.e2e/r6-operations-failure.png', fullPage: true, timeout: 10000 }).catch(() => undefined);
    throw error;
  }
} finally {
  await browser?.close();
  await checked(stack.admin.from('fixture_stages').delete().eq('tournament_id', tournament.id));
  await checked(stack.admin.from('matches').delete().eq('tournament_id', tournament.id));
  await checked(stack.admin.from('tournaments').delete().eq('id', tournament.id).eq('created_by', owner.id));
}
