import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';
import { loadMvpAlgorithm, processMvpBatch } from '../cricket-mvp-worker.mjs';

const check = expect.configure({ timeout: 60000 });
const origin = 'http://127.0.0.1:4173';
await check.poll(async () => { try { return (await fetch(origin + '/status')).ok; } catch { return false; } }, { timeout: 180000 }).toBe(true);
const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients();
const owner = fixture.accounts[0], scorer = fixture.accounts[1];
const journalPath = '.e2e/phases789-tournament-journey.json';
let journal;
try { journal = JSON.parse(await readFile(journalPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const reviewOnly = process.argv.includes('--review-only');
if (reviewOnly && !journal?.complete) throw new Error('Review requires an actually completed tournament');
if (journal?.complete && !reviewOnly) journal = undefined;
journal ??= { run: randomUUID().slice(0, 8), clubs: [], players: [], tournamentId: null };
const save = () => writeFile(journalPath, JSON.stringify(journal, null, 2));
const name = `Tournament acceptance ${journal.run}`;
const browser = await chromium.launch({ channel: process.env.WRICKET_E2E_CHROME_CHANNEL ?? 'chrome' });
const contexts = [];
const errors = [];
async function login(account) {
  const context = await browser.newContext({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' }); contexts.push(context);
  await context.addInitScript(device => localStorage.setItem('wricket.scoring-device-id', device), 'journey-' + journal.run + '-' + account.id);
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000);
  const navigate = page.goto.bind(page);
  page.goto = (url, options = {}) => navigate(url, { waitUntil: 'domcontentloaded', ...options });
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) console.info('NAV ' + frame.url()); });
  page.on('response', async response => { if (response.url().includes('/rest/v1/') && response.status() >= 400) console.error('API failure ' + new URL(response.url()).pathname + ' ' + response.status() + ' ' + (await response.text()).slice(0, 600)); });
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto(origin + '/auth?returnTo=%2Fwricket');
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill(account.email);
  await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith('/wricket'));
  return page;
}
const button = (page, label) => page.getByRole('button', { name: label, exact: true });
let organiser, scoring;
try {
  for (let index = journal.clubs.length; index < 8; index++) {
    const club = await checked(stack.admin.from('teams').insert({ name: `Journey Community Cricket Club ${index + 1} ${journal.run}`, short_name: `J${index + 1}`, color_hex: '#a6f477', entity_owner_id: owner.id }).select('id,name').single());
    const roster = [];
    for (let position = 0; position < 3; position++) {
      let player;
      if (index === 0 && position === 0) player = { id: owner.playerId, display_name: owner.name };
      else {
        player = await checked(stack.admin.from('players').insert({ display_name: `Journey ${index + 1} Player ${position + 1}`, created_by: owner.id }).select('id,display_name').single());
        journal.players.push(player.id);
      }
      await checked(stack.admin.from('team_players').insert({ team_id: club.id, player_id: player.id, is_captain: position === 0, is_keeper: position === 1 }));
      roster.push(player);
    }
    journal.clubs.push({ ...club, roster }); await save();
  }
  organiser = await login(owner); scoring = await login(scorer);
  if (!journal.tournamentId) {
    const existing = await checked(stack.admin.from('tournaments').select('id').eq('name', name).eq('created_by', owner.id).maybeSingle());
    if (existing) journal.tournamentId = existing.id;
    else {
      await organiser.goto(origin + '/wricket/tournament/new');
      await check(organiser.getByText('Set the stage.', { exact: true })).toBeVisible();
      await organiser.getByRole('radio', { name: 'Existing teams', exact: true }).click();
      await organiser.getByRole('textbox', { name: 'Tournament name', exact: true }).fill(name);
      await organiser.getByRole('textbox', { name: 'Planned teams', exact: true }).fill('8');
      await organiser.getByRole('textbox', { name: 'Squad size', exact: true }).fill('3');
      await organiser.getByRole('textbox', { name: 'Overs per match', exact: true }).fill('1');
      await organiser.getByRole('textbox', { name: 'Organiser phone number', exact: true }).fill('+91 90000 00000');
      await button(organiser, 'Create tournament').click();
      await organiser.waitForURL(url => url.pathname.startsWith('/wricket/tournament/') && !url.pathname.endsWith('/new'));
      journal.tournamentId = (await checked(stack.admin.from('tournaments').select('id').eq('name', name).eq('created_by', owner.id).single())).id;
    }
    await save();
  }
  const tournamentUrl = origin + '/wricket/tournament/' + journal.tournamentId;
  await organiser.goto(tournamentUrl + '?tab=teams');
  let entered = await checked(stack.admin.from('teams').select('id,name,source_team_id').eq('tournament_id', journal.tournamentId));
  for (const club of journal.clubs) {
    if (entered.some(team => team.source_team_id === club.id)) continue;
    await button(organiser, 'Add tournament team').click();
    await organiser.getByRole('radio', { name: 'Use existing team', exact: true }).click();
    await organiser.getByRole('radio', { name: 'Enter ' + club.name, exact: true }).click();
    await button(organiser, 'Enter selected team').click();
    await check(button(organiser, 'Open team ' + club.name)).toBeVisible();
  }
  entered = await checked(stack.admin.from('teams').select('id,name,source_team_id').eq('tournament_id', journal.tournamentId));
  assert.equal(entered.length, 8);
  const rank = id => journal.clubs.findIndex(club => club.id === entered.find(team => team.id === id)?.source_team_id);
  const clubFor = id => journal.clubs[rank(id)];
  await organiser.goto(tournamentUrl);
  await button(organiser, 'Manage').click(); await button(organiser, 'Scorer access').click();
  await organiser.getByRole('textbox', { name: 'Search tournament scorers', exact: true }).fill(scorer.name);
  const assigned = await checked(stack.admin.from('tournament_members').select('role,status').eq('tournament_id', journal.tournamentId).eq('account_id', scorer.id).maybeSingle());
  if (assigned?.role !== 'SCORER' || assigned.status !== 'ACTIVE') await button(organiser, 'Assign scorer ' + scorer.name).click();
  await check(button(organiser, 'Remove scorer ' + scorer.name)).toBeVisible();
  console.info('PASS organiser created tournament, entered eight complete clubs and assigned scorer through the UI');
  console.info('STEP fixture builder');
  await organiser.goto(tournamentUrl);
  await button(organiser, 'Manage').click(); await button(organiser, 'Fixture plan').click();
  const fixturesUrl = organiser.url();
  let stages = await checked(stack.admin.from('fixture_stages').select('id,type').eq('tournament_id', journal.tournamentId));
  if (!stages.some(stage => stage.type === 'GROUP')) {
    await organiser.getByRole('radio', { name: 'Groups \u2192 knockout', exact: true }).click();
    await organiser.getByRole('textbox', { name: 'Groups', exact: true }).fill('2');
    await organiser.getByRole('textbox', { name: 'Advance per group', exact: true }).fill('2');
    await button(organiser, 'Assign teams to groups').click();
    for (let index = 0; index < 8; index++) {
      await button(organiser, journal.clubs[index].name).click();
      await button(organiser, index < 4 ? 'Group A' : 'Group B').click();
    }
    await button(organiser, 'Review fixture plan').click();
    await check(organiser.getByText('12 group matches', { exact: true })).toBeVisible();
    await button(organiser, 'Generate group fixtures').click();
    await check(organiser.getByText('Fixtures ready', { exact: true })).toBeVisible();
    stages = await checked(stack.admin.from('fixture_stages').select('id,type').eq('tournament_id', journal.tournamentId));
  }
  console.info('STEP group plan committed');
  const groupStage = stages.find(stage => stage.type === 'GROUP').id;
  const groupFixtures = await checked(stack.admin.from('fixture_matches').select('id,team_a_id,team_b_id').eq('stage_id', groupStage).order('round').order('id'));
  assert.equal(groupFixtures.length, 12);
  const measurements = reviewOnly ? JSON.parse(await readFile('.e2e/phases789-tournament-evidence.json', 'utf8')).scoringFeedbackMs : [];
  async function openers(batting, bowling) {
    await check(scoring.getByText('Select openers', { exact: true })).toBeVisible();
    for (const player of clubFor(batting).roster.slice(0, 2)) await button(scoring, 'Select ' + player.display_name).click();
    await button(scoring, 'Confirm').click();
    await button(scoring, 'Select ' + clubFor(bowling).roster[0].display_name).click(); await button(scoring, 'Confirm').click();
  }
  async function play(f) {
    console.info('STEP score fixture ' + f.id);
    const match = await checked(stack.admin.from('matches').select('id,status,result').eq('fixture_match_id', f.id).single());
    if (match.status === 'COMPLETED') return;
    const winner = rank(f.team_a_id) < rank(f.team_b_id) ? f.team_a_id : f.team_b_id;
    const first = winner === f.team_a_id ? f.team_b_id : f.team_a_id;
    const second = winner;
    if (match.status === 'SCHEDULED') {
      await scoring.goto(tournamentUrl); await check(scoring.getByRole('tab', { name: 'Matches', exact: true })).toBeVisible();
      const params = new URLSearchParams({ tournamentId: journal.tournamentId, teamAId: f.team_a_id, teamBId: f.team_b_id, fixtureMatchId: f.id, canonicalMatchId: match.id, format: 'TURF' });
      await scoring.goto(origin + '/wricket/match/new?' + params);
      await check(scoring.getByText('Tournament locked', { exact: true })).toBeVisible();
      await button(scoring, 'TEAM A: ' + clubFor(f.team_a_id).name).click();
      await button(scoring, 'TEAM B: ' + clubFor(f.team_b_id).name).click();
      await check(button(scoring, 'Choose players')).toBeEnabled();
      await button(scoring, 'Choose players').click();
      await check(scoring.getByText('3/3 selected', { exact: true })).toHaveCount(2);
      await button(scoring, 'Continue to toss').click();
      await button(scoring, 'On-field toss').click(); await button(scoring, clubFor(f.team_a_id).name).click();
      await button(scoring, winner === f.team_a_id ? 'Field first' : 'Bat first').click();
      await button(scoring, 'Review match').click(); await button(scoring, 'Start scoring').click();
      await scoring.waitForURL('**/match/' + match.id + '/score');
    } else await scoring.goto(origin + '/wricket/match/' + match.id + '/score');
    let innings = await checked(stack.admin.from('match_innings').select('id,sequence,status,total_balls,total_runs').eq('match_id', match.id).order('sequence'));
    if (innings.length === 1 && innings[0].status !== 'COMPLETED') {
      if (innings[0].total_balls === 0) await openers(first, second);
      for (let i = innings[0].total_balls; i < 6; i++) {
        await check(button(scoring, 'Record 1 runs')).toBeEnabled();
        const started = performance.now(); await button(scoring, 'Record 1 runs').click();
        if (i < 5) await check(scoring.getByLabel('Score ' + (i + 1) + ' for 0', { exact: true })).toBeVisible();
        measurements.push(performance.now() - started);
      }
    }
    if (await button(scoring, 'Start next innings').count()) await button(scoring, 'Start next innings').click();
    innings = await checked(stack.admin.from('match_innings').select('id,sequence,status,total_balls,total_runs').eq('match_id', match.id).order('sequence'));
    const chaseBalls = innings.find(item => item.sequence === 2)?.total_balls ?? 0;
    if (chaseBalls === 0) await openers(second, first);
    for (let i = chaseBalls; i < 2; i++) { await check(button(scoring, 'Record 4 runs')).toBeEnabled(); await button(scoring, 'Record 4 runs').click(); }
    await scoring.waitForURL('**/scorecard');
    await check.poll(async () => (await checked(stack.admin.from('matches').select('status').eq('id', match.id).single())).status).toBe('COMPLETED');
    const finished = await checked(stack.admin.from('matches').select('id,result').eq('fixture_match_id', f.id).single());
    assert.equal(finished.id, match.id); assert.equal(finished.result.winnerTeamId, winner);
    assert.equal((await checked(stack.admin.from('match_events').select('id').eq('match_id', match.id).eq('kind', 'BALL_RECORDED'))).length, 8);
    console.info('PASS scorer completed ' + clubFor(f.team_a_id).name + ' vs ' + clubFor(f.team_b_id).name);
  }
  for (const f of groupFixtures) await play(f);
  const knockoutRoute = new URL(fixturesUrl); knockoutRoute.searchParams.set('focus', 'knockout');
  await organiser.goto(knockoutRoute.toString());
  stages = await checked(stack.admin.from('fixture_stages').select('id,type').eq('tournament_id', journal.tournamentId));
  if (!stages.some(stage => stage.type === 'KNOCKOUT')) {
    await organiser.getByRole('radio', { name: 'Top 4 \u00b7 SF \u2192 Final', exact: true }).click();
    await button(organiser, 'Confirm and generate knockout').click();
    await check(organiser.getByText('The road to the title.', { exact: true })).toBeVisible();
  }
  const knockout = await checked(stack.admin.from('fixture_stages').select('id').eq('tournament_id', journal.tournamentId).eq('type', 'KNOCKOUT').single());
  for (const round of [1, 2]) {
    if (round === 2) { await button(organiser, 'Refresh bracket').click(); await check.poll(async () => (await checked(stack.admin.from('fixture_matches').select('id').eq('stage_id', knockout.id).eq('round', 2))).length).toBe(1); }
    const fixtures = await checked(stack.admin.from('fixture_matches').select('id,team_a_id,team_b_id').eq('stage_id', knockout.id).eq('round', round));
    assert.equal(fixtures.length, round === 1 ? 2 : 1); for (const f of fixtures) await play(f);
  }
  await button(organiser, 'Refresh bracket').click();
  await check(organiser.getByText('CHAMPION', { exact: true })).toBeVisible();
  await organiser.screenshot({ path: '.e2e/r7-tournament-champion.png', fullPage: true });
  const allMatches = await checked(stack.admin.from('matches').select('id,status').eq('tournament_id', journal.tournamentId));
  assert.equal(allMatches.length, 15); assert.ok(allMatches.every(match => match.status === 'COMPLETED'));
  console.info('PASS twelve scored group matches, qualifiers, two scored semi-finals, final and champion; fifteen retained canonical IDs');
  assert.equal((await checked(stack.admin.from('match_events').select('id').in('match_id', allMatches.map(match => match.id)).eq('kind', 'BALL_RECORDED'))).length, 120);
  const algorithm = await loadMvpAlgorithm();
  for (let i = 0; i < 20; i++) { const totals = await processMvpBatch(stack.admin, algorithm, 50); if (!totals.claimed) break; assert.equal(totals.failed, 0); }
  const rankings = await checked(stack.admin.from('match_mvp_results').select('match_id,player_id,total_points,batting_breakdown').in('match_id', allMatches.map(match => match.id)));
  assert.equal(new Set(rankings.map(row => row.match_id)).size, 15);
  await organiser.goto(tournamentUrl + '?tab=stats');
  await check(organiser.getByText('Tournament MVP.', { exact: true })).toBeVisible();
  await check(organiser.getByRole('tab', { name: 'Batting leaderboard', exact: true })).toBeVisible();
  for (const metric of ['Batting', 'Bowling', 'Fielding', 'MVP']) { await organiser.getByRole('tab', { name: metric + ' leaderboard', exact: true }).click(); await check(organiser.getByRole('tab', { name: metric + ' leaderboard', exact: true })).toHaveAttribute('aria-selected', 'true'); }
  if (!await button(organiser, 'View ' + owner.name + ' performance').isVisible()) await organiser.getByRole('button', { name: /^Inspect R0 A1,/ }).click();
  await check(button(organiser, 'View ' + owner.name + ' performance')).toBeVisible();
  await organiser.screenshot({ path: '.e2e/r8-leaderboard-expanded.png', fullPage: true });
  await button(organiser, 'View ' + owner.name + ' performance').click();
  await check(organiser.getByText('MATCH HISTORY', { exact: true })).toBeVisible();
  await organiser.getByRole('tab', { name: 'Performance period Last year', exact: true }).click();
  await check(organiser.getByText('No completed matches in this period', { exact: true })).toBeVisible();
  await button(organiser, 'View all-time performance').click();
  await check(organiser.getByText('MATCH HISTORY', { exact: true })).toBeVisible();
  await organiser.screenshot({ path: '.e2e/r8-performance-history.png', fullPage: true });
  await scoring.goto(tournamentUrl + '?tab=stats');
  await check(scoring.getByRole('button', { name: /^Inspect R0 A1,/ })).toBeVisible();
  await scoring.reload(); await check(scoring.getByRole('button', { name: /^Inspect R0 A1,/ })).toBeVisible();
  await organiser.goto(tournamentUrl); await button(organiser, 'Manage').click(); await button(organiser, 'Scorer access').click();
  await button(organiser, 'Remove scorer ' + scorer.name).click();
  await button(organiser, 'Keep scorer').click();
  await check(button(organiser, 'Remove scorer ' + scorer.name)).toBeVisible();
  await button(organiser, 'Remove scorer ' + scorer.name).click(); await button(organiser, 'Confirm remove scorer').click();
  await check(button(organiser, 'Remove scorer ' + scorer.name)).toHaveCount(0);
  console.info('PASS persistent cloud MVP on two clients, discipline views, expanded points, performance period/history links and scorer removal/cancellation');
  assert.deepEqual(errors, []);
  await writeFile('.e2e/phases789-tournament-evidence.json', JSON.stringify({ recordedAt: new Date().toISOString(), tournamentId: journal.tournamentId, matches: 15, groupMatches: 12, semiFinals: 2, finals: 1, realRecordedDeliveries: 120, scoringFeedbackMs: measurements, environment: 'Chrome on Windows, development web bundle, local Docker PostgreSQL; automation includes click and assertion overhead', source: 'Scorer-driven UI; admin seeded reusable clubs/players only' }, null, 2));
  journal.complete = true; await save();
} catch (error) {
  console.error(error.stack ?? error);
  for (const [label, page] of [['organiser', organiser], ['scorer', scoring]]) if (page) { console.error(label + ' ' + page.url() + '\n' + (await page.locator('body').innerText()).slice(0, 4500)); await page.screenshot({ path: '.e2e/tournament-journey-' + label + '-failure.png', fullPage: true }).catch(() => undefined); }
  throw error;
} finally { await browser.close(); }
// Leave completed acceptance data isolated for design/native reviews and rollback checks.
