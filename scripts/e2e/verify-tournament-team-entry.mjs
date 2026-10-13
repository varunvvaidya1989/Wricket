import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients();
const owner = fixture.accounts[0]; const reservedCaptain = fixture.accounts[1]; const clubCaptain = fixture.accounts[3];
const runName = 'Team Entry Review ' + randomUUID().slice(0, 8);
const tournamentIds = []; const clubIds = []; const clients = []; const pageErrors = [];
let browser;
const visible = locator => locator.filter({ visible: true });
async function clientFor(account) { const client = stack.client(); clients.push(client); await checked(client.auth.signInWithPassword({ email: account.email, password: fixture.password })); return client; }
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', error => pageErrors.push(error.message)); return page;
}
async function signIn(page, account, returnTo = '/wricket') {
  await page.goto('http://127.0.0.1:4173/auth?returnTo=' + encodeURIComponent(returnTo), { waitUntil: 'domcontentloaded' });
  await finishSignIn(page, account);
}
async function finishSignIn(page, account) {
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill(account.email);
  await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith('/wricket'));
}
const tokenFromLink = link => new URL(link).searchParams.get('token');
async function configure(client, id, open = true) {
  return checked(client.rpc('configure_tournament_registration', { p_tournament_id: id, p_entry_mode: 'EXISTING_TEAMS', p_published: true, p_open: open, p_fee_required: true, p_fee_label: '₹2000 per team', p_payment_instructions: 'Arrange payment outside Wricket.' }));
}
await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:4173/auth', { signal: AbortSignal.timeout(10000) })).ok; } catch { return false; } }, { timeout: 120000 }).toBe(true);
try {
  browser = await chromium.launch({ channel: 'chrome' });
  const ownerClient = await clientFor(owner); const captainClient = await clientFor(reservedCaptain); const applicantClient = await clientFor(clubCaptain);
  const otherClient = await clientFor(fixture.accounts[2]); const viewerClient = await clientFor(fixture.accounts.at(-1));
  const organiserPage = await newPage(); await signIn(organiserPage, owner);
  await organiserPage.goto('http://127.0.0.1:4173/wricket/tournament/new');
  // A full navigation first renders under the auth/brand launch overlay.
  // Click checks event reception, preventing fills in unhydrated SSR inputs.
  await organiserPage.getByRole('textbox', { name: 'Tournament name', exact: true }).click();
  await organiserPage.getByRole('textbox', { name: 'Tournament name', exact: true }).fill(runName);
  await organiserPage.getByRole('textbox', { name: 'Planned teams', exact: true }).fill('2');
  await organiserPage.getByRole('textbox', { name: 'Organiser phone number', exact: true }).fill('+919000000000');
  await organiserPage.getByRole('button', { name: 'Create tournament', exact: true }).click();
  await organiserPage.waitForURL(url => url.pathname.startsWith('/wricket/tournament/') && !url.pathname.endsWith('/new'));
  const tournament = await checked(stack.admin.from('tournaments').select('id,visibility').eq('name', runName).eq('created_by', owner.id).single());
  tournamentIds.push(tournament.id); const route = 'http://127.0.0.1:4173/wricket/tournament/' + tournament.id;
  assert.equal(tournament.visibility, 'PRIVATE');
  await visible(organiserPage.getByRole('tab', { name: 'Teams', exact: true })).click();
  await visible(organiserPage.getByRole('button', { name: 'Add tournament team', exact: true })).click();
  await visible(organiserPage.getByRole('textbox', { name: 'Team name', exact: true })).fill('Reserved Stars');
  await visible(organiserPage.getByRole('textbox', { name: 'Team short name', exact: true })).fill('RS');
  await visible(organiserPage.getByRole('button', { name: 'Create team', exact: true })).click();
  await visible(organiserPage.getByRole('button', { name: 'Invite captain for Reserved Stars', exact: true })).click();
  await visible(organiserPage.getByRole('textbox', { name: 'Reserve for a captain (optional)', exact: true })).fill(reservedCaptain.name);
  await visible(organiserPage.getByRole('button', { name: 'Reserve for ' + reservedCaptain.name, exact: true })).click();
  await visible(organiserPage.getByRole('button', { name: 'Create captain claim link', exact: true })).click();
  const captainLink = await visible(organiserPage.getByTestId('tournament-entry-invitation-link')).innerText();
  const claimToken = tokenFromLink(captainLink); assert.match(claimToken, /^[a-f0-9]{48}$/);
  await organiserPage.evaluate(() => document.fonts.ready);
  await organiserPage.setViewportSize({ width: 320, height: 820 });
  assert.equal(await organiserPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await organiserPage.screenshot({ path: '.e2e/team-entry-captain-invite-320.png', fullPage: true });
  await visible(organiserPage.getByRole('button', { name: 'Close captain invitation', exact: true })).click();
  const placeholder = await checked(stack.admin.from('teams').select('id,entity_owner_id').eq('tournament_id', tournament.id).eq('name', 'Reserved Stars').single());
  assert.ok((await otherClient.rpc('preview_tournament_entry_invitation', { p_token: claimToken })).error);
  assert.ok((await otherClient.rpc('claim_tournament_placeholder', { p_token: claimToken })).error);
  const captainPage = await newPage(); await captainPage.goto(captainLink);
  await expect(captainPage.getByRole('button', { name: 'Sign in for tournament invitation', exact: true })).toBeVisible();
  await captainPage.getByRole('button', { name: 'Sign in for tournament invitation', exact: true }).click();
  await finishSignIn(captainPage, reservedCaptain);
  await expect(captainPage.getByRole('button', { name: 'Claim captain role', exact: true })).toBeVisible();
  await captainPage.evaluate(() => document.fonts.ready);
  await captainPage.screenshot({ path: '.e2e/team-entry-claim-376.png', fullPage: true });
  await captainPage.setViewportSize({ width: 320, height: 820 });
  assert.equal(await captainPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await captainPage.screenshot({ path: '.e2e/team-entry-claim-320.png', fullPage: true });
  await captainPage.getByRole('button', { name: 'Claim captain role', exact: true }).click();
  await captainPage.waitForURL(url => url.pathname === '/wricket/team/' + placeholder.id);
  await expect(visible(captainPage.getByRole('button', { name: 'Manage roster', exact: true }))).toBeVisible();
  await visible(captainPage.getByRole('button', { name: 'Manage roster', exact: true })).click();
  await visible(captainPage.getByRole('textbox', { name: 'Search player name', exact: true })).fill(fixture.accounts[2].name);
  await visible(captainPage.getByRole('button', { name: `Add ${fixture.accounts[2].name} as player`, exact: true })).click();
  await expect(visible(captainPage.getByText(`${fixture.accounts[2].name} added as player.`, { exact: true }))).toBeVisible();
  const member = await checked(stack.admin.from('team_account_members').select('role,status').eq('team_id', placeholder.id).eq('account_id', reservedCaptain.id).single());
  assert.deepEqual(member, { role: 'CAPTAIN', status: 'ACTIVE' });
  assert.equal((await checked(stack.admin.from('teams').select('id,entity_owner_id').eq('tournament_id', tournament.id))).length, 1);
  assert.equal((await checked(stack.admin.from('teams').select('entity_owner_id').eq('id', placeholder.id).single())).entity_owner_id, owner.id);
  assert.ok((await viewerClient.rpc('assign_registered_player', { p_team_id: placeholder.id, p_player_id: fixture.accounts[4].playerId, p_role: 'PLAYER' })).error);
  console.info('PASS private placeholder, account-reserved captain link, sign-in continuation, same entry, ownership and actual roster permissions');

  await organiserPage.setViewportSize({ width: 376, height: 900 });
  await organiserPage.goto(route + '?tab=settings');
  await visible(organiserPage.getByRole('button', { name: 'Registrations', exact: true })).click();
  await visible(organiserPage.getByRole('switch', { name: 'Publish tournament', exact: true })).click();
  await visible(organiserPage.getByRole('switch', { name: 'Accept team applications', exact: true })).click();
  await visible(organiserPage.getByRole('switch', { name: 'Registration fee required', exact: true })).click();
  await visible(organiserPage.getByRole('textbox', { name: 'Registration fee details', exact: true })).fill('₹2000 per team');
  await visible(organiserPage.getByRole('textbox', { name: 'External payment instructions', exact: true })).fill('Arrange payment outside Wricket.');
  await visible(organiserPage.getByRole('button', { name: 'Save registration settings', exact: true })).click();
  await expect(visible(organiserPage.getByText('Registration settings saved.', { exact: true }))).toBeVisible();
  await visible(organiserPage.getByRole('button', { name: 'Create team entry link', exact: true })).click();
  const teamLink = await visible(organiserPage.getByTestId('tournament-entry-invitation-link')).innerText(); const teamToken = tokenFromLink(teamLink);
  const applicantPage = await newPage(); await applicantPage.goto(teamLink);
  await applicantPage.getByRole('button', { name: 'Sign in for tournament invitation', exact: true }).click(); await finishSignIn(applicantPage, clubCaptain);
  await applicantPage.getByRole('radio', { name: 'Apply with ' + fixture.teams[1].name, exact: true }).click();
  await applicantPage.getByRole('textbox', { name: 'Team registration contact number', exact: true }).fill('123');
  await applicantPage.getByRole('button', { name: 'Submit team application', exact: true }).click();
  await expect(applicantPage.getByText('Enter a valid contact number', { exact: true })).toBeVisible();
  await applicantPage.getByRole('textbox', { name: 'Team registration contact number', exact: true }).fill('+919000000123');
  await applicantPage.getByRole('textbox', { name: 'Team application note (optional)', exact: true }).fill('PRIVATE captain application note');
  await expect(applicantPage.getByText('Enter a valid contact number', { exact: true })).toHaveCount(0);
  await applicantPage.evaluate(() => document.fonts.ready);
  await visible(applicantPage.getByTestId('tournament-invitation-scroll')).evaluate(element => { element.scrollTop = 0; });
  await applicantPage.screenshot({ path: '.e2e/team-entry-application-376.png', fullPage: true });
  await applicantPage.setViewportSize({ width: 320, height: 820 });
  assert.equal(await applicantPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await applicantPage.screenshot({ path: '.e2e/team-entry-application-320.png', fullPage: true });
  await visible(applicantPage.getByRole('button', { name: 'Submit team application', exact: true })).scrollIntoViewIfNeeded();
  await applicantPage.screenshot({ path: '.e2e/team-entry-application-fields-320.png', fullPage: true });
  await applicantPage.route('**/rest/v1/rpc/submit_tournament_team_form', route => route.abort(), { times: 1 });
  await applicantPage.getByRole('button', { name: 'Submit team application', exact: true }).click();
  await expect(applicantPage.getByText('Team application needs attention', { exact: true })).toBeVisible();
  await expect(applicantPage.getByRole('textbox', { name: 'Team registration contact number', exact: true })).toHaveValue('+919000000123');
  await applicantPage.getByRole('button', { name: 'Submit team application', exact: true }).click();
  await expect(applicantPage.getByText('Pending review', { exact: true })).toBeVisible();
  const application = await checked(applicantClient.from('tournament_team_applications').select('*').eq('tournament_id', tournament.id).single());
  assert.equal(application.entry_team_id, null); assert.equal(application.payment_status, 'PENDING');
  assert.deepEqual(await checked(viewerClient.from('tournament_team_applications').select('*').eq('tournament_id', tournament.id)), []);
  assert.deepEqual(await checked(viewerClient.from('tournament_entry_invitations').select('id').eq('tournament_id', tournament.id)), []);
  assert.ok((await applicantClient.rpc('review_tournament_team_application', { p_application_id: application.id, p_status: 'APPROVED', p_payment_status: 'DONE' })).error);
  console.info('PASS team-link sign-in, eligible captain club, application validation, failed-write retry, pending status, privacy and denied self-approval');

  await organiserPage.goto(route + '?tab=settings'); await visible(organiserPage.getByRole('button', { name: 'Registrations', exact: true })).click();
  await visible(organiserPage.getByRole('button', { name: 'Reject team ' + fixture.teams[1].name, exact: true })).click();
  await visible(organiserPage.getByRole('button', { name: 'All team applications', exact: true })).click();
  await expect(visible(organiserPage.getByText('Rejected', { exact: true }))).toBeVisible();
  await visible(organiserPage.getByRole('button', { name: 'Approve team ' + fixture.teams[1].name, exact: true })).click();
  await visible(organiserPage.getByRole('button', { name: 'All team applications', exact: true })).click();
  await expect(visible(organiserPage.getByText('Approved', { exact: true }))).toBeVisible();
  await expect(visible(organiserPage.getByText('Payment: Pending', { exact: true }))).toBeVisible();
  await visible(organiserPage.getByRole('button', { name: 'Mark team payment done', exact: true })).click();
  await expect(visible(organiserPage.getByText('Payment: Done', { exact: true }))).toBeVisible();
  const approved = await checked(applicantClient.from('tournament_team_applications').select('entry_team_id,payment_status').eq('id', application.id).single());
  const repeatedApproval = await checked(ownerClient.rpc('review_tournament_team_application', { p_application_id: application.id, p_status: 'APPROVED', p_payment_status: null }));
  assert.equal(repeatedApproval, approved.entry_team_id);
  const sourceRoster = await checked(stack.admin.from('team_players').select('player_id,is_captain,is_keeper').eq('team_id', fixture.teams[1].id).order('player_id'));
  const entryRoster = await checked(stack.admin.from('team_players').select('player_id,is_captain,is_keeper').eq('team_id', approved.entry_team_id).order('player_id'));
  assert.deepEqual(entryRoster, sourceRoster); assert.equal(entryRoster.length, 3);
  assert.equal((await checked(stack.admin.from('teams').select('id').eq('tournament_id', tournament.id))).length, 2);
  await organiserPage.setViewportSize({ width: 320, height: 820 });
  assert.equal(await organiserPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await visible(organiserPage.getByText('TEAM APPLICATIONS · 1', { exact: true })).scrollIntoViewIfNeeded();
  await organiserPage.screenshot({ path: '.e2e/team-entry-review-320.png', fullPage: true });
  const viewerPage = await newPage(); await signIn(viewerPage, fixture.accounts.at(-1));
  await viewerPage.goto('http://127.0.0.1:4173/wricket/search');
  await viewerPage.getByRole('textbox', { name: 'Search cricket', exact: true }).fill(runName);
  await viewerPage.getByRole('button', { name: runName, exact: true }).click();
  await visible(viewerPage.getByRole('tab', { name: 'Teams', exact: true })).click();
  await expect(visible(viewerPage.getByText(fixture.teams[1].name, { exact: true }))).toBeVisible();
  await expect(visible(viewerPage.getByText('All tournament team places are filled.', { exact: true }))).toBeVisible();
  await expect(visible(viewerPage.getByRole('button', { name: 'Request team entry', exact: true }))).toHaveCount(0);
  await visible(viewerPage.getByRole('tab', { name: 'Players', exact: true })).click();
  await expect(visible(viewerPage.getByText('5 ROSTER PLAYERS', { exact: true }))).toBeVisible();
  await expect(visible(viewerPage.getByRole('button', { name: 'View ' + clubCaptain.name, exact: true }))).toBeVisible();
  await expect(viewerPage.getByText('PRIVATE captain application note', { exact: true })).toHaveCount(0);
  await expect(viewerPage.getByText('+919000000123', { exact: true })).toHaveCount(0);
  await viewerPage.getByRole('textbox', { name: 'Search registered players', exact: true }).fill(clubCaptain.name);
  await expect(viewerPage.getByRole('button', { name: 'View ' + clubCaptain.name, exact: true })).toBeVisible();
  await viewerPage.getByRole('textbox', { name: 'Search registered players', exact: true }).fill('');
  await viewerPage.evaluate(() => document.fonts.ready); await viewerPage.setViewportSize({ width: 320, height: 820 });
  assert.equal(await viewerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await viewerPage.screenshot({ path: '.e2e/team-entry-players-320.png', fullPage: true });
  console.info('PASS approval with payment pending, roster/access copy, independent payment audit, idempotent approval, public Explore and roster directory');

  await organiserPage.goto(route + '?tab=settings'); await visible(organiserPage.getByRole('button', { name: 'Registrations', exact: true })).click();
  const inviteRow = await checked(stack.admin.from('tournament_entry_invitations').select('id').eq('tournament_id', tournament.id).eq('kind', 'TEAM_APPLICATION').single());
  await visible(organiserPage.getByRole('button', { name: 'Revoke entry invitation ' + inviteRow.id, exact: true })).click();
  await expect(visible(organiserPage.getByText(/^Revoked · expires/))).toBeVisible();
  assert.ok((await applicantClient.rpc('preview_tournament_entry_invitation', { p_token: teamToken })).error);
  await visible(organiserPage.getByRole('switch', { name: 'Accept team applications', exact: true })).click();
  await visible(organiserPage.getByRole('button', { name: 'Save registration settings', exact: true })).click();
  await expect(visible(organiserPage.getByText('Registration settings saved.', { exact: true }))).toBeVisible();
  assert.ok((await ownerClient.rpc('submit_tournament_team_application', { p_tournament_id: tournament.id, p_source_team_id: fixture.teams[0].id, p_phone: '+919000000000', p_note: '', p_token: null })).error);
  console.info('PASS link revocation and closed team applications');

  const raceTournament = await checked(stack.admin.from('tournaments').insert({ name: runName + ' Race', created_by: owner.id, format: 'T10', start_date: '2026-11-10', planned_team_count: 2, players_per_team: 3, overs_per_match: 10 }).select('id').single());
  tournamentIds.push(raceTournament.id); await configure(ownerClient, raceTournament.id);
  const racePlaceholder = await checked(stack.admin.from('teams').insert({ tournament_id: raceTournament.id, name: 'Race reserved', short_name: 'RR', color_hex: '#19AF74', entity_owner_id: owner.id }).select('id').single());
  const raceInvite = await checked(ownerClient.rpc('create_tournament_entry_invitation', { p_tournament_id: raceTournament.id, p_placeholder_team_id: racePlaceholder.id, p_target_account_id: null, p_expires_hours: 168 }));
  const claims = await Promise.all([captainClient.rpc('claim_tournament_placeholder', { p_token: raceInvite.token }), otherClient.rpc('claim_tournament_placeholder', { p_token: raceInvite.token })]);
  assert.equal(claims.filter(result => result.error === null).length, 1);
  assert.equal((await checked(stack.admin.from('team_account_members').select('account_id').eq('team_id', racePlaceholder.id).eq('role', 'CAPTAIN').eq('status', 'ACTIVE'))).length, 1);
  const raceApplications = [];
  for (const account of fixture.accounts.slice(4, 6)) {
    const club = await checked(stack.admin.from('teams').insert({ name: runName + account.name, short_name: 'RX', color_hex: '#19AF74', entity_owner_id: account.id }).select('id').single()); clubIds.push(club.id);
    await checked(stack.admin.from('team_players').insert({ team_id: club.id, player_id: account.playerId, is_captain: true }));
    await checked(stack.admin.from('team_account_members').insert({ team_id: club.id, account_id: account.id, player_id: account.playerId, role: 'CAPTAIN', status: 'ACTIVE' }));
    const client = await clientFor(account);
    raceApplications.push(await checked(client.rpc('submit_tournament_team_application', { p_tournament_id: raceTournament.id, p_source_team_id: club.id, p_phone: '+919000000000', p_note: '', p_token: null })));
  }
  const approvals = await Promise.all(raceApplications.map(id => ownerClient.rpc('review_tournament_team_application', { p_application_id: id, p_status: 'APPROVED', p_payment_status: null })));
  assert.equal(approvals.filter(result => result.error === null).length, 1);
  assert.equal((await checked(stack.admin.from('teams').select('id').eq('tournament_id', raceTournament.id))).length, 2);
  const pendingIndex = approvals.findIndex(result => result.error !== null);
  const pendingPage = await newPage(); await signIn(pendingPage, fixture.accounts[4 + pendingIndex]);
  await pendingPage.goto('http://127.0.0.1:4173/wricket/tournament/' + raceTournament.id + '?tab=teams');
  await visible(pendingPage.getByRole('button', { name: 'Withdraw team application', exact: true })).click();
  await visible(pendingPage.getByRole('button', { name: 'Keep team application', exact: true })).click();
  await visible(pendingPage.getByRole('button', { name: 'Withdraw team application', exact: true })).click();
  await visible(pendingPage.getByRole('button', { name: 'Confirm team withdrawal', exact: true })).click();
  await expect(visible(pendingPage.getByText('Withdrawn', { exact: true }))).toBeVisible();
  assert.equal((await checked(stack.admin.from('teams').select('id').eq('tournament_id', raceTournament.id))).length, 2);
  const expired = await checked(ownerClient.rpc('create_tournament_entry_invitation', { p_tournament_id: raceTournament.id, p_placeholder_team_id: null, p_target_account_id: null, p_expires_hours: 1 }));
  await checked(stack.admin.from('tournament_entry_invitations').update({ expires_at: '2020-01-01T00:00:00Z' }).eq('id', expired.invitation_id));
  assert.ok((await applicantClient.rpc('preview_tournament_entry_invitation', { p_token: expired.token })).error);
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  console.info('PASS actual PostgreSQL concurrent captain claims, competing approvals for final place, browser withdrawal, expired link and zero browser page errors');
} catch (error) {
  for (const context of browser?.contexts() ?? []) {
    for (const page of context.pages()) {
      await page.screenshot({ path: '.e2e/team-entry-final-failure-' + browser.contexts().indexOf(context) + '.png', fullPage: true }).catch(() => undefined);
      console.info('Failed team-entry route: ' + new URL(page.url()).pathname);
    }
  }
  throw error;
} finally {
  await browser?.close();
  for (const client of clients) await client.auth.signOut({ scope: 'local' });
  for (const id of tournamentIds) await checked(stack.admin.from('tournaments').delete().eq('id', id).eq('created_by', owner.id));
  await checked(stack.admin.from('tournaments').delete().eq('name', runName).eq('created_by', owner.id));
  for (const id of clubIds) await checked(stack.admin.from('teams').delete().eq('id', id));
}
