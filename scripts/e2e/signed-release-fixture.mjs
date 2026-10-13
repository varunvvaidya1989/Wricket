import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ref = 'lzgnuqwvsioinwwrsdvn';
const url = `https://${ref}.supabase.co`;
export const signedFixturePath = resolve('.e2e/signed-release/private/fixture.json');
export const checked = async result => { const { data, error } = await result; if (error) throw new Error(error.message); return data; };
export async function signedClients() {
  assert.equal((await readFile('supabase/.temp/project-ref', 'utf8')).trim(), ref);
  const keys = JSON.parse(await readFile('.e2e/hosted/api-keys.json', 'utf8'));
  const secret = keys.find(x => x.type === 'secret' && x.name === 'default')?.api_key;
  const key = keys.find(x => x.type === 'publishable' && x.name === 'default')?.api_key;
  assert.ok(secret?.startsWith('sb_secret_') && key?.startsWith('sb_publishable_'));
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
  } };
  return { admin: createClient(url, secret, options), client: () => createClient(url, key, options), url };
}
export async function seedSignedFixture() {
  try { const old = JSON.parse(await readFile(signedFixturePath, 'utf8')); assert.ok(old.cleaned, 'Existing signed acceptance needs scoped cleanup before reseeding'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const stack = await signedClients();
  const fixture = { run: randomUUID(), password: `Release!${randomBytes(18).toString('hex')}`,
    accounts: [], teams: [], players: [], matches: [], tournamentId: null, cleaned: false };
  const save = () => writeFile(signedFixturePath, JSON.stringify(fixture, null, 2));
  await mkdir(resolve('.e2e/signed-release/private'), { recursive: true }); await save();
  for (const role of ['owner', 'viewer']) {
    const email = `wricket-release-${fixture.run}-${role}@example.test`;
    const { user } = await checked(stack.admin.auth.admin.createUser({ email, password: fixture.password,
      email_confirm: true, user_metadata: { signed_release_run: fixture.run } }));
    fixture.accounts.push({ id: user.id, email, role }); await save();
    const client = stack.client(); await checked(client.auth.signInWithPassword({ email, password: fixture.password }));
    await checked(client.rpc('save_my_sports', { p_display_name: `Release ${role} ${fixture.run.slice(0, 8)}`,
      p_sport_codes: ['CRICKET'], p_primary_sport_code: 'CRICKET' }));
    await client.auth.signOut({ scope: 'local' });
  }
  const owner = stack.client(); const ownerId = fixture.accounts[0].id;
  await checked(owner.auth.signInWithPassword({ email: fixture.accounts[0].email, password: fixture.password }));
  fixture.tournamentId = (await checked(stack.admin.from('tournaments').insert({ created_by: ownerId,
    source_local_id: randomUUID(), name: `Signed upgrade acceptance ${fixture.run}`, format: 'T20', visibility: 'PUBLIC',
    start_date: '2026-10-11', planned_team_count: 2, players_per_team: 3, overs_per_match: 3,
  }).select('id').single())).id; await save();
  for (const side of ['A', 'B']) {
    const team = await checked(owner.from('teams').insert({ tournament_id: fixture.tournamentId,
      entity_owner_id: ownerId, name: `RC ${side} ${fixture.run.slice(0, 8)}`, short_name: `RC${side}`,
      color_hex: '#a6f477' }).select('id').single());
    fixture.teams.push(team.id); await save();
    for (let order = 1; order <= 3; order++) {
      const player = await checked(stack.admin.from('players').insert({ display_name: `RC ${side}${order}`,
        created_by: ownerId, role: 'AR' }).select('id').single());
      fixture.players.push(player.id); await save();
      await checked(stack.admin.from('team_players').insert({ team_id: team.id, player_id: player.id,
        is_captain: order === 1, is_keeper: order === 2 }));
    }
  }
  const xi = offset => fixture.players.slice(offset, offset + 3).map((id, index) => ({ player_id: id,
    batting_order: index + 1, is_captain: index === 0, is_keeper: index === 1 }));
  for (const name of ['bowler', 'batter', 'recovery-new']) {
    const id = await checked(owner.rpc('create_owned_match_idempotent', { p_request_id: randomUUID(),
      p_tournament_id: fixture.tournamentId, p_team_a_id: fixture.teams[0], p_team_b_id: fixture.teams[1],
      p_format: 'T20', p_rules: { oversPerInnings: 3, playersPerSide: 3, inningsPerTeam: 1 },
      p_scheduled_at: null, p_venue: 'Signed release acceptance ' + fixture.run }));
    fixture.matches.push({ id, name }); await save();
    await checked(owner.rpc('start_match_setup', { p_match_id: id, p_team_a_xi: xi(0), p_team_b_xi: xi(3),
      p_toss_winner_team_id: fixture.teams[0], p_toss_choice: 'BAT' }));
  }
  await owner.auth.signOut({ scope: 'local' });
  return fixture;
}
export async function cleanupSignedFixture() {
  const fixture = JSON.parse(await readFile(signedFixturePath, 'utf8')); if (fixture.cleaned) return;
  assert.match(fixture.run, /^[0-9a-f-]{36}$/);
  const stack = await signedClients();
  for (const account of fixture.accounts) {
    const { user } = await checked(stack.admin.auth.admin.getUserById(account.id));
    assert.equal(user.user_metadata.signed_release_run, fixture.run); assert.equal(user.email, account.email);
  }
  const owner = stack.client();
  await checked(owner.auth.signInWithPassword({ email: fixture.accounts[0].email, password: fixture.password }));
  // Opening the real profile screen can create the temporary owner's player.
  // Validate its exact generated name before adding it to this scoped cleanup.
  const ownerPlayers = await checked(stack.admin.from('players').select('id,display_name').eq('created_by', fixture.accounts[0].id));
  for (const player of ownerPlayers) {
    if (!fixture.players.includes(player.id)) {
      assert.equal(player.display_name, `Release owner ${fixture.run.slice(0, 8)}`);
      fixture.players.push(player.id);
    }
  }
  await writeFile(signedFixturePath, JSON.stringify(fixture, null, 2));
  if (fixture.tournamentId) {
    const tournament = await checked(stack.admin.from('tournaments').select('name,created_by').eq('id', fixture.tournamentId).maybeSingle());
    if (tournament) {
      assert.equal(tournament.created_by, fixture.accounts[0].id);
      assert.equal(tournament.name, `Signed upgrade acceptance ${fixture.run}`);
      await checked(owner.rpc('delete_owned_tournament', { p_tournament_id: fixture.tournamentId }));
    }
  }
  for (const id of fixture.players) await checked(stack.admin.from('players').delete().eq('id', id).eq('created_by', fixture.accounts[0].id));
  await owner.auth.signOut({ scope: 'local' });
  for (const account of fixture.accounts) await checked(stack.admin.auth.admin.deleteUser(account.id));
  fixture.cleaned = true; await writeFile(signedFixturePath, JSON.stringify(fixture, null, 2));
}
if (process.argv.includes('--seed')) {
  assert.ok(process.argv.includes('--production')); const fixture = await seedSignedFixture();
  console.info(`Created scoped signed acceptance with ${fixture.matches.length} matches; credentials remain private.`); process.exit(0);
} else if (process.argv.includes('--cleanup')) {
  assert.ok(process.argv.includes('--production')); await cleanupSignedFixture(); console.info('Removed scoped signed acceptance resources.'); process.exit(0);
}
