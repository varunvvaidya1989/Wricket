import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients();
const [owner, captain] = fixture.accounts;
const viewer = fixture.accounts.at(-1);
await expect.poll(async () => {
  try { return (await fetch('http://127.0.0.1:4173/auth', { signal: AbortSignal.timeout(10000) })).ok; } catch { return false; }
}, { timeout: 120000 }).toBe(true);
const name = 'R1 International Community Cricket Championship Review';
const tournament = await checked(stack.admin.from('tournaments').insert({ created_by: owner.id, source_local_id: randomUUID(), name, format: 'TURF', visibility: 'PUBLIC', start_date: '2026-10-10', planned_team_count: 3, players_per_team: 7, overs_per_match: 10, settings: { status: 'ACTIVE' } }).select('id').single());
let browser; let source;
const clients = [];
const errors = [];
try {
  source = await checked(stack.admin.from('teams').insert({ entity_owner_id: captain.id, name: 'Reusable Community Cricket Collective', short_name: 'RCC', color_hex: '#19AF74' }).select('id').single());
  await checked(stack.admin.from('team_players').insert({ team_id: source.id, player_id: captain.playerId, is_captain: true }));
  const entries = await checked(stack.admin.from('teams').insert([
    { tournament_id: tournament.id, entity_owner_id: captain.id, source_team_id: source.id, name: 'Reusable Community Cricket Collective', short_name: 'RCC', color_hex: '#19AF74' },
    { tournament_id: tournament.id, name: 'Protected Fixtures Cricket Team', short_name: 'PFC', color_hex: '#19AF74' },
    { tournament_id: tournament.id, name: 'Protected Bracket Cricket Team', short_name: 'PBC', color_hex: '#19AF74' },
  ]).select('id,name'));
  const [entry, protectedTeam, bracketTeam] = entries;
  await checked(stack.admin.from('team_players').insert({ team_id: entry.id, player_id: captain.playerId, is_captain: true }));
  await checked(stack.admin.from('team_account_members').insert({ team_id: entry.id, account_id: captain.id, player_id: captain.playerId, role: 'CAPTAIN', status: 'ACTIVE' }));
  const stage = await checked(stack.admin.from('fixture_stages').insert({ tournament_id: tournament.id, stage_order: 1, type: 'GROUP', config: { manual: true } }).select('id').single());
  const group = await checked(stack.admin.from('fixture_groups').insert({ stage_id: stage.id, name: 'Group A', team_ids: entries.map(team => team.id) }).select('id').single());
  await checked(stack.admin.from('fixture_matches').insert({ stage_id: stage.id, group_id: group.id, team_a_id: protectedTeam.id, team_b_id: bracketTeam.id, round: 1, leg: 1 }));
  browser = await chromium.launch({ channel: 'chrome' });
  const newPage = async account => {
    const context = await browser.newContext({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000);
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
    await page.goto('http://127.0.0.1:4173/auth?returnTo=' + encodeURIComponent('/tournament?id=' + tournament.id), { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
    await page.getByPlaceholder('Email', { exact: true }).fill(account.email);
    await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Teams', exact: true })).toBeVisible();
    return page;
  };
  const page = await newPage(owner);
  const directory = async () => {
    await page.goto('http://127.0.0.1:4173/wricket/tournament/' + tournament.id);
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await page.getByRole('button', { name: 'Teams & rosters', exact: true }).click();
  };
  const remove = team => page.getByRole('button', { name: 'Remove ' + team.name + ' from tournament', exact: true });
  try {
    await page.goto('http://127.0.0.1:4173/wricket/my-wricket?section=tournaments');
    await expect(page.getByRole('button', { name: 'Open tournament ' + name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create tournament', exact: true })).toHaveCount(1);
    await expect(page.getByText('ADD TOURNAMENT', { exact: true })).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.getByText('Your competitions.', { exact: true }).evaluate(element => getComputedStyle(element).fontFamily), 'SpaceGrotesk_600SemiBold');
    assert.equal(await page.getByText('Your competitions.', { exact: true }).evaluate(element => getComputedStyle(element).fontSize), '27px');
    assert.equal(await page.getByRole('textbox', { name: 'Search tournaments to follow' }).evaluate(element => getComputedStyle(element).fontFamily), 'Inter_400Regular');
    await page.screenshot({ path: '.e2e/tournament-list-376.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 320, height: 900 });
    const title = page.getByRole('button', { name: 'Open tournament ' + name, exact: true }).getByText(name, { exact: true });
    assert.equal(await title.evaluate(element => getComputedStyle(element).fontSize), '16px');
    assert.equal(await title.evaluate(element => getComputedStyle(element).textOverflow), 'clip');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: '.e2e/tournament-list-320.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 376, height: 900 });
    await directory();
    const cachedCaptainPage = await newPage(captain);
    await cachedCaptainPage.getByRole('tab', { name: 'Teams', exact: true }).click();
    await expect(cachedCaptainPage.getByRole('button', { name: 'Open team ' + entry.name, exact: true })).toBeVisible();
    await remove(entry).click();
    await expect(page.getByText('Remove this team?', { exact: true })).toBeVisible();
    await page.screenshot({ path: '.e2e/tournament-team-removal-confirm.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Keep team', exact: true }).click();
    assert.ok(await checked(stack.admin.from('teams').select('id').eq('id', entry.id).single()));
    await remove(entry).click();
    await page.route('**/rest/v1/rpc/remove_owned_tournament_team', route => route.abort(), { times: 1 });
    await page.getByRole('button', { name: 'Confirm remove team', exact: true }).click();
    await expect(page.getByText('Team could not be removed', { exact: true })).toBeVisible();
    assert.ok(await checked(stack.admin.from('teams').select('id').eq('id', entry.id).single()));
    await page.getByRole('button', { name: 'Confirm remove team', exact: true }).click();
    await expect(page.getByText(entry.name + ' removed from this tournament.', { exact: true })).toBeVisible();
    await expect(remove(entry)).toHaveCount(0);
    await expect(page.getByText('1 place available', { exact: true })).toBeVisible();
    assert.deepEqual(await checked(stack.admin.from('teams').select('id').eq('id', entry.id)), []);
    assert.equal((await checked(stack.admin.from('team_players').select('player_id').eq('team_id', source.id))).length, 1);
    assert.equal((await checked(stack.admin.from('team_players').select('player_id').eq('team_id', entry.id))).length, 0);
    assert.equal((await checked(stack.admin.from('team_account_members').select('account_id').eq('team_id', entry.id))).length, 0);
    assert.deepEqual((await checked(stack.admin.from('fixture_groups').select('team_ids').eq('id', group.id).single())).team_ids, [protectedTeam.id, bracketTeam.id]);
    await cachedCaptainPage.reload();
    await cachedCaptainPage.getByRole('tab', { name: 'Teams', exact: true }).click();
    await expect(cachedCaptainPage.getByRole('button', { name: 'Open team ' + entry.name, exact: true })).toHaveCount(0);
    await page.reload(); await page.getByRole('tab', { name: 'Teams', exact: true }).click();
    await expect(remove(entry)).toHaveCount(0);
    await remove(protectedTeam).click(); await page.getByRole('button', { name: 'Confirm remove team', exact: true }).click();
    await expect(page.getByText(/This team is used in fixtures/)).toBeVisible();
    await page.getByRole('button', { name: 'Keep team', exact: true }).click();
    await checked(stack.admin.from('fixture_matches').delete().eq('stage_id', stage.id));
    await checked(stack.admin.from('knockout_brackets').insert({ stage_id: stage.id, rounds: [{ matches: [{ teamA: bracketTeam.id }] }], seeding_source: 'MANUAL', bracket_size: 2 }));
    await remove(bracketTeam).click(); await page.getByRole('button', { name: 'Confirm remove team', exact: true }).click();
    await expect(page.getByText(/This team is used in fixtures/)).toBeVisible();
    await page.getByRole('button', { name: 'Keep team', exact: true }).click();
    await checked(stack.admin.from('knockout_brackets').delete().eq('stage_id', stage.id));
    await checked(stack.admin.from('matches').insert({ tournament_id: tournament.id, team_a_id: protectedTeam.id, team_b_id: bracketTeam.id, created_by: owner.id, format: 'TURF', status: 'COMPLETED', visibility: 'PUBLIC', rules: { oversPerInnings: 10 } }));
    await remove(protectedTeam).click(); await page.getByRole('button', { name: 'Confirm remove team', exact: true }).click();
    await expect(page.getByText(/Recorded matches must be retained/)).toBeVisible();
    await page.getByRole('button', { name: 'Keep team', exact: true }).click();
    for (const account of [captain, viewer]) {
      const client = stack.client(); clients.push(client);
      await checked(client.auth.signInWithPassword({ email: account.email, password: fixture.password }));
      assert.match((await client.rpc('remove_owned_tournament_team', { p_tournament_id: tournament.id, p_team_id: protectedTeam.id })).error.message, /Only the tournament organiser/);
      const readPage = await newPage(account);
      await readPage.getByRole('tab', { name: 'Teams', exact: true }).click();
      await expect(readPage.getByRole('button', { name: /^Remove .* from tournament$/ })).toHaveCount(0);
      if (account === viewer) {
        await readPage.goto('http://127.0.0.1:4173/wricket/my-wricket?section=tournaments');
        await readPage.getByRole('textbox', { name: 'Search tournaments to follow' }).fill(name);
        await readPage.getByRole('button', { name: 'Follow', exact: true }).click();
        await expect(readPage.getByRole('button', { name: 'Following', exact: true })).toBeVisible();
        await readPage.getByRole('textbox', { name: 'Search tournaments to follow' }).fill('');
        await expect(readPage.getByRole('button', { name: 'Open tournament ' + name, exact: true })).toBeVisible();
        await readPage.getByRole('button', { name: 'Unfollow tournament', exact: true }).click();
        await expect(readPage.getByRole('button', { name: 'Open tournament ' + name, exact: true })).toHaveCount(0);
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: single create action, fonts/320px wrapping, navigation and follow/unfollow; organiser cancel/network failure/retry, scoped entry deletion, source roster retention, capacity/group cleanup, reload persistence, fixture/bracket/history guards and captain/viewer denial.');
  } catch (error) {
    console.error(error.stack ?? error);
    for (const context of browser.contexts()) for (const active of context.pages()) console.error('Browser state: ' + active.url() + '\n' + (await active.locator('body').innerText()).slice(0, 4500));
    await page.screenshot({ path: '.e2e/tournament-removal-failure.png', fullPage: true }).catch(() => undefined);
    throw error;
  }
} finally {
  await browser?.close();
  for (const client of clients) await client.auth.signOut({ scope: 'local' });
  await checked(stack.admin.from('fixture_stages').delete().eq('tournament_id', tournament.id));
  await checked(stack.admin.from('matches').delete().eq('tournament_id', tournament.id));
  await checked(stack.admin.from('tournaments').delete().eq('id', tournament.id).eq('created_by', owner.id));
  if (source) await checked(stack.admin.from('teams').delete().eq('id', source.id).eq('entity_owner_id', captain.id));
}
