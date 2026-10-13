import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients(); const owner = fixture.accounts[0]; const applicant = fixture.accounts[2]; const viewer = fixture.accounts.at(-1);
const name = 'Participation Review ' + randomUUID().slice(0, 8); const errors = []; const clients = [];
let browser; let tournamentId;
const visible = locator => locator.filter({ visible: true });
async function clientFor(account) { const client = stack.client(); clients.push(client); await checked(client.auth.signInWithPassword({ email: account.email, password: fixture.password })); return client; }
async function pageFor(account) {
  const context = await browser.newContext({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' }); const page = await context.newPage();
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000); page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/auth?returnTo=' + encodeURIComponent('/wricket'));
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill(account.email); await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL(url => url.pathname.startsWith('/wricket')); return page;
}
try {
  await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:4173/status', { signal: AbortSignal.timeout(10000) })).ok; } catch { return false; } }, { timeout: 180000 }).toBe(true);
  browser = await chromium.launch({ channel: 'chrome' });
  const ownerClient = await clientFor(owner); const playerClient = await clientFor(applicant); const viewerClient = await clientFor(viewer);
  const organiser = await pageFor(owner);
  await organiser.goto('http://127.0.0.1:4173/wricket/tournament/new');
  await organiser.getByRole('radio', { name: 'Player pool & auction', exact: true }).click();
  await organiser.getByRole('textbox', { name: 'Tournament name', exact: true }).fill(name);
  await organiser.getByRole('textbox', { name: 'Planned teams', exact: true }).fill('2');
  await organiser.getByRole('textbox', { name: 'Squad size', exact: true }).fill('3');
  await organiser.getByRole('textbox', { name: 'Organiser phone number', exact: true }).fill('+919000000000');
  await organiser.getByRole('button', { name: 'Create tournament', exact: true }).click();
  await organiser.waitForURL(url => url.pathname.startsWith('/wricket/tournament/') && !url.pathname.endsWith('/new'));
  const tournament = await checked(stack.admin.from('tournaments').select('id').eq('name', name).eq('created_by', owner.id).single()); tournamentId = tournament.id;
  const route = 'http://127.0.0.1:4173/wricket/tournament/' + tournamentId;
  await visible(organiser.getByRole('tab', { name: 'Teams', exact: true })).click();
  for (const teamName of ['Pool Stars', 'Pool Royals']) {
    await visible(organiser.getByRole('button', { name: 'Add tournament team', exact: true })).click();
    await visible(organiser.getByRole('textbox', { name: 'Team name', exact: true })).fill(teamName);
    await visible(organiser.getByRole('textbox', { name: 'Team short name', exact: true })).fill(teamName === 'Pool Stars' ? 'PS' : 'PR');
    await visible(organiser.getByRole('button', { name: 'Create team', exact: true })).click();
    await expect(visible(organiser.getByRole('button', { name: 'Open team ' + teamName, exact: true }))).toBeVisible();
  }
  assert.equal(await visible(organiser.getByRole('button', { name: /Invite captain for/ })).count(), 0);
  await organiser.goto(route + '?tab=settings');
  await visible(organiser.getByRole('button', { name: 'Registrations', exact: true })).click();
  await visible(organiser.getByRole('button', { name: 'Add form question', exact: true })).click();
  await visible(organiser.getByRole('textbox', { name: 'Question 1 label', exact: true })).fill('Available dates');
  await visible(organiser.getByRole('button', { name: 'Optional question', exact: true })).click();
  await visible(organiser.getByRole('button', { name: 'Add form question', exact: true })).click();
  await visible(organiser.getByRole('textbox', { name: 'Question 2 label', exact: true })).fill('Preferred slot');
  await visible(organiser.getByRole('button', { name: 'Choice answer', exact: true })).last().click();
  await visible(organiser.getByRole('textbox', { name: 'Question 2 options, one per line', exact: true })).fill('Morning\nEvening');
  await visible(organiser.getByRole('button', { name: 'Optional question', exact: true })).click();
  await visible(organiser.getByRole('button', { name: 'Save form questions', exact: true })).click();
  await expect(visible(organiser.getByText('Form questions saved.', { exact: true }))).toBeVisible();
  await visible(organiser.getByRole('switch', { name: 'Publish tournament', exact: true })).click();
  await visible(organiser.getByRole('switch', { name: 'Accept player applications', exact: true })).click();
  await visible(organiser.getByRole('button', { name: 'Save registration settings', exact: true })).click();
  await expect(visible(organiser.getByText('Registration settings saved.', { exact: true }))).toBeVisible();
  const player = await pageFor(applicant); await player.goto('http://127.0.0.1:4173/wricket/search');
  await player.getByRole('textbox', { name: 'Search cricket', exact: true }).fill(name);
  await expect(player.getByText(/Player registration open/)).toBeVisible(); await player.getByRole('button', { name, exact: true }).click();
  await visible(player.getByRole('tab', { name: 'Players', exact: true })).click(); await visible(player.getByRole('button', { name: 'Request to join', exact: true })).click();
  await visible(player.getByRole('textbox', { name: 'Registration contact number', exact: true })).fill('+919000000000');
  await visible(player.getByRole('button', { name: 'Submit application', exact: true })).click(); await expect(visible(player.getByText('Answer: Available dates', { exact: true }))).toBeVisible();
  await visible(player.getByRole('textbox', { name: 'Available dates', exact: true })).fill('PRIVATE Saturday availability');
  await visible(player.getByRole('button', { name: 'Submit application', exact: true })).click(); await expect(visible(player.getByText('Answer: Preferred slot', { exact: true }))).toBeVisible();
  await visible(player.getByRole('radio', { name: 'Preferred slot: Morning', exact: true })).click();
  await player.route('**/rest/v1/rpc/submit_tournament_player_form', intercepted => intercepted.abort(), { times: 1 });
  await visible(player.getByRole('button', { name: 'Submit application', exact: true })).click();
  await expect(visible(player.getByRole('textbox', { name: 'Available dates', exact: true }))).toHaveValue('PRIVATE Saturday availability');
  await visible(player.getByRole('button', { name: 'Submit application', exact: true })).click(); await expect(visible(player.getByText('Pending review', { exact: true }))).toBeVisible();
  const application = await checked(playerClient.from('tournament_player_registrations').select('id,player_id,custom_answers').eq('tournament_id', tournamentId).single());
  assert.deepEqual(await checked(viewerClient.from('tournament_player_registrations').select('custom_answers').eq('tournament_id', tournamentId)), []);
  console.info('PASS custom question configuration, required answers, failed-write retention, private answers and discovery registration indicator');

  await organiser.goto(route + '?tab=settings'); await visible(organiser.getByRole('button', { name: 'Registrations', exact: true })).click();
  await expect(visible(organiser.getByText('Available dates: PRIVATE Saturday availability', { exact: true }))).toBeVisible();
  await expect(visible(organiser.getByText('Form questions are locked.', { exact: true }))).toBeVisible();
  await visible(organiser.getByRole('button', { name: `Approve ${applicant.name}`, exact: true })).click();
  await visible(organiser.getByRole('button', { name: `Allocate ${applicant.name}`, exact: true })).click();
  await visible(organiser.getByRole('button', { name: 'Allocate to Pool Stars', exact: true })).click();
  await visible(organiser.getByRole('button', { name: 'Captain label off', exact: true })).click(); await visible(organiser.getByRole('button', { name: 'Icon label off', exact: true })).click();
  await organiser.setViewportSize({ width: 320, height: 820 }); await organiser.evaluate(() => document.fonts.ready);
  await visible(organiser.getByRole('button', { name: `Save allocation for ${applicant.name}`, exact: true })).scrollIntoViewIfNeeded(); await organiser.screenshot({ path: '.e2e/participation-allocation-320.png', fullPage: true });
  await visible(organiser.getByRole('button', { name: `Save allocation for ${applicant.name}`, exact: true })).click();
  await expect(visible(organiser.getByText('Pool Stars · Captain · Icon', { exact: true }))).toBeVisible();
  let allocation = await checked(playerClient.from('tournament_player_allocations').select('*').eq('registration_id', application.id).single());
  const membership = await checked(stack.admin.from('team_account_members').select('role').eq('team_id', allocation.team_id).eq('account_id', applicant.id).single()); assert.equal(membership.role, 'PLAYER');
  assert.equal((await playerClient.rpc('assign_registered_player', { p_team_id: allocation.team_id, p_player_id: application.player_id, p_role: 'PLAYER' })).error !== null, true);
  assert.ok((await playerClient.rpc('withdraw_tournament_player_registration', { p_registration_id: application.id })).error);
  await player.goto(route + '?tab=players'); await expect(visible(player.getByText(/Assigned to Pool Stars/))).toBeVisible(); assert.equal(await visible(player.getByRole('button', { name: 'Withdraw application', exact: true })).count(), 0);
  const publicPage = await pageFor(viewer); await publicPage.goto(route + '?tab=players'); await expect(visible(publicPage.getByText('Pool Stars · Captain · Icon', { exact: true }))).toBeVisible(); assert.equal((await publicPage.locator('body').innerText()).includes('PRIVATE Saturday availability'), false);
  await publicPage.setViewportSize({ width: 320, height: 820 }); await publicPage.screenshot({ path: '.e2e/participation-directory-320.png', fullPage: true });
  console.info('PASS approved-player allocation, informational Captain/Icon labels, no captain permissions, allocated withdrawal guard and safe public labels');

  await player.goto('http://127.0.0.1:4173/wricket/my-wricket?section=applications'); await expect(visible(player.getByText(name, { exact: true }))).toBeVisible(); await expect(visible(player.getByText('Approved', { exact: true }))).toBeVisible();
  await player.setViewportSize({ width: 320, height: 820 }); await player.screenshot({ path: '.e2e/participation-my-applications-320.png', fullPage: true });
  await visible(player.getByRole('button', { name: `View application for ${name}`, exact: true })).click(); await expect(visible(player.getByText(/Assigned to Pool Stars/))).toBeVisible();
  await visible(organiser.getByRole('button', { name: `Allocate ${applicant.name}`, exact: true })).click(); await visible(organiser.getByRole('button', { name: 'Allocate to Pool Royals', exact: true })).click(); await visible(organiser.getByRole('button', { name: `Save allocation for ${applicant.name}`, exact: true })).click();
  await expect(visible(organiser.getByText('Pool Royals · Captain · Icon', { exact: true }))).toBeVisible();
  const previousTeam = allocation.team_id; allocation = await checked(playerClient.from('tournament_player_allocations').select('*').eq('registration_id', application.id).single()); assert.notEqual(allocation.team_id, previousTeam);
  assert.deepEqual(await checked(stack.admin.from('team_players').select('player_id').eq('team_id', previousTeam)), []);
  await visible(organiser.getByRole('button', { name: `Unassign ${applicant.name}`, exact: true })).click(); await expect(visible(organiser.getByText('Unassigned', { exact: true }))).toBeVisible();
  await player.goto(route + '?tab=players'); await visible(player.getByRole('button', { name: 'Withdraw application', exact: true })).click(); await visible(player.getByRole('button', { name: 'Confirm withdrawal', exact: true })).click(); await expect(visible(player.getByText('Withdrawn', { exact: true }))).toBeVisible();
  await player.goto('http://127.0.0.1:4173/wricket/my-wricket?section=applications'); await expect(visible(player.getByText('Withdrawn', { exact: true }))).toBeVisible();
  assert.equal(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.deepEqual(errors, []);
  console.info('PASS My applications tracking/navigation/reload, atomic team reassignment, unassignment then withdrawal, narrow layouts and zero browser page errors');
  const stars = await checked(ownerClient.from('teams').select('id').eq('tournament_id', tournamentId).eq('name', 'Pool Stars').single());
  await checked(stack.admin.from('tournaments').update({ players_per_team: 2 }).eq('id', tournamentId));
  const questions = await checked(ownerClient.from('tournament_registration_forms').select('questions').eq('tournament_id', tournamentId).single());
  const raceAnswers = Object.fromEntries(questions.questions.map(q => [q.id, q.type === 'CHOICE' ? q.options[0] : 'Saturday']));
  const racers = [];
  for (const account of [fixture.accounts[5], fixture.accounts[1], fixture.accounts[4]]) {
    const client = await clientFor(account);
    const registrationId = await checked(client.rpc('submit_tournament_player_form', { p_tournament_id: tournamentId, p_role: 'AR', p_phone: '+919000000000', p_note: '', p_answers: raceAnswers }));
    await checked(ownerClient.rpc('review_tournament_player_registration', { p_registration_id: registrationId, p_status: 'APPROVED', p_payment_status: null })); racers.push(registrationId);
  }
  await checked(ownerClient.rpc('allocate_tournament_player', { p_registration_id: racers.shift(), p_team_id: stars.id, p_captain_label: false, p_icon_label: false }));
  const competing = await Promise.all(racers.map(id => ownerClient.rpc('allocate_tournament_player', { p_registration_id: id, p_team_id: stars.id, p_captain_label: false, p_icon_label: false })));
  assert.equal(competing.filter(result => !result.error).length, 1); assert.equal((await checked(ownerClient.from('team_players').select('player_id').eq('team_id', stars.id))).length, 2);
  assert.equal((await checked(ownerClient.from('tournament_player_allocations').select('registration_id').eq('tournament_id', tournamentId))).length, 2);
  console.info('PASS actual PostgreSQL competing allocations for the final roster place commit exactly one player');
} finally {
  if (tournamentId) await checked(stack.admin.from('tournaments').delete().eq('id', tournamentId).eq('created_by', owner.id));
  for (const client of clients) await client.auth.signOut({ scope: 'local' }); await browser?.close();
}
