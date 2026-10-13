import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

await expect.poll(async () => {
  try { return (await fetch('http://127.0.0.1:4173/status', { signal: AbortSignal.timeout(10000) })).ok; }
  catch { return false; }
}, { timeout: 180000, intervals: [1000, 3000, 5000] }).toBe(true);

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients();
const ownerAccount = fixture.accounts[0];
const owner = stack.client();
await checked(owner.auth.signInWithPassword({ email: ownerAccount.email, password: fixture.password }));
const suffix = randomUUID().slice(0, 8);
const tournament = await checked(stack.admin.from('tournaments').insert({
  name: `R2 fixture ${suffix}`,
  created_by: ownerAccount.id,
  format: 'T20',
  visibility: 'PUBLIC',
  start_date: '2026-09-27',
  location: 'Inherited fixture ground',
  planned_team_count: 2,
  players_per_team: 3,
  overs_per_match: 2,
  settings: { status: 'ACTIVE' },
}).select('id').single());
let canonicalMatchId;
let context;
try {
  const storedTournament = await checked(stack.admin.from('tournaments').select('players_per_team,overs_per_match,location').eq('id', tournament.id).single());
  assert.deepEqual(storedTournament, { players_per_team: 3, overs_per_match: 2, location: 'Inherited fixture ground' });
  const teams = [];
  for (const [index, side] of ['A', 'B'].entries()) {
    const team = await checked(stack.admin.from('teams').insert({
      tournament_id: tournament.id,
      name: `R2 Fixture ${side} ${suffix}`,
      short_name: `F${side}`,
      color_hex: index ? '#387AFF' : '#19AF74',
      entity_owner_id: ownerAccount.id,
    }).select('id,name').single());
    teams.push(team);
    for (const [position, account] of fixture.accounts.slice(index * 3, index * 3 + 3).entries()) {
      await checked(stack.admin.from('team_players').insert({
        team_id: team.id,
        player_id: account.playerId,
        is_captain: position === 0,
        is_keeper: position === 1,
      }));
    }
  }
  canonicalMatchId = await checked(owner.rpc('create_owned_match_idempotent', {
    p_request_id: randomUUID(),
    p_tournament_id: tournament.id,
    p_team_a_id: teams[0].id,
    p_team_b_id: teams[1].id,
    p_format: 'T20',
    p_rules: { oversPerInnings: 2, playersPerSide: 3 },
    p_scheduled_at: '2026-09-27T09:00:00.000Z',
    p_venue: 'Inherited fixture ground',
  }));

  const browser = await chromium.launch({ channel: process.env.WRICKET_E2E_CHROME_CHANNEL || 'chrome' });
  context = await browser.newContext({ viewport: { width: 376, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:4173/auth?returnTo=%2Fwricket', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
    await page.getByPlaceholder('Email', { exact: true }).fill(ownerAccount.email);
    await page.getByPlaceholder('Password', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/live');
    await page.goto(`http://127.0.0.1:4173/wricket/tournament/${tournament.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: 'Matches', exact: true })).toBeVisible();
    const query = new URLSearchParams({ tournamentId: tournament.id, teamAId: teams[0].id, teamBId: teams[1].id,
      canonicalMatchId, format: 'T20', scheduledAt: '2026-09-27T09:00:00.000Z' });
    await page.goto(`http://127.0.0.1:4173/wricket/match/new?${query}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Tournament locked', { exact: true })).toBeVisible();
    await expect(page.getByText('2 overs · 3-a-side', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Overs', exact: true })).toHaveCount(0);
    await expect(page.getByText('Inherited fixture ground', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Choose players', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to toss', exact: true }).click();
    await page.getByRole('button', { name: 'On-field toss', exact: true }).click();
    await page.getByRole('button', { name: teams[0].name, exact: true }).click();
    await page.getByRole('button', { name: 'Bat first', exact: true }).click();
    await page.getByRole('button', { name: 'Review match', exact: true }).click();
    await page.getByRole('button', { name: 'Start scoring', exact: true }).click();
    await page.waitForURL(`**/match/${canonicalMatchId}/score`);
    const matches = await checked(stack.admin.from('matches').select('id,status,rules,venue').eq('tournament_id', tournament.id));
    assert.deepEqual(matches.map(row => row.id), [canonicalMatchId]);
    assert.equal(matches[0].status, 'IN_PROGRESS');
    assert.equal(matches[0].rules.oversPerInnings, 2);
    assert.equal(matches[0].rules.playersPerSide, 3);
    assert.equal(matches[0].venue, 'Inherited fixture ground');
    assert.deepEqual(errors, []);
    console.log('PASS: scheduled fixture retained its canonical ID and inherited locked tournament settings.');
  } finally {
    await context.close();
    await browser.close();
  }
} finally {
  await owner.auth.signOut({ scope: 'local' });
  if (canonicalMatchId) await checked(stack.admin.from('matches').delete().eq('id', canonicalMatchId).eq('created_by', ownerAccount.id));
  await checked(stack.admin.from('tournaments').delete().eq('id', tournament.id).eq('created_by', ownerAccount.id));
}
