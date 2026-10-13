import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { localEndpoint, requireHealthyBackend } from './environment.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const execute = promisify(execFile);
export const manifestPath = fileURLToPath(new URL('../../.e2e/fixture.json', import.meta.url));

export async function localClients() {
  const { stdout } = await execute(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '--workdir', '.e2e/stack', '--output', 'json'], { cwd: root });
  const status = JSON.parse(stdout);
  const backendURL = localEndpoint(status.API_URL, 54321, 'Local stack API');
  const publishableKey = status.PUBLISHABLE_KEY;
  if (!publishableKey?.startsWith('sb_publishable_') || !status.SERVICE_ROLE_KEY) throw new Error('Local stack credentials are unavailable');
  await requireHealthyBackend({ backendURL, publishableKey });
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return { backendURL, publishableKey, admin: createClient(backendURL, status.SERVICE_ROLE_KEY, options),
    client: () => createClient(backendURL, publishableKey, options) };
}

export async function checked(result) {
  const { data, error } = await result;
  if (error) throw new Error(error.message);
  return data;
}

export async function seedFixture() {
  const stack = await localClients();
  try {
    const previous = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!previous.cleaned) throw new Error('Existing E2E fixture needs cleanup before reseeding.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const runId = randomUUID();
  const fixture = { runId, backendURL: stack.backendURL, publishableKey: stack.publishableKey,
    password: `E2e!${randomBytes(18).toString('hex')}`, accounts: [], teams: [], cleaned: false };
  const save = async () => writeFile(manifestPath, JSON.stringify(fixture, null, 2));
  await mkdir(fileURLToPath(new URL('../../.e2e/', import.meta.url)), { recursive: true });
  await save();
  for (const label of ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'Viewer']) {
    const email = `wricket-${runId}-${label.toLowerCase()}@example.test`;
    const { user } = await checked(stack.admin.auth.admin.createUser({ email, password: fixture.password,
      email_confirm: true, user_metadata: { e2e_run_id: runId } }));
    const account = { id: user.id, email, name: `R0 ${label}`, playerId: null };
    fixture.accounts.push(account);
    await save();
    const client = stack.client();
    await checked(client.auth.signInWithPassword({ email, password: fixture.password }));
    await checked(client.rpc('save_my_sports', { p_display_name: account.name, p_sport_codes: ['CRICKET'], p_primary_sport_code: 'CRICKET' }));
    if (label !== 'Viewer') {
      const player = await checked(stack.admin.from('players').insert({ profile_id: user.id, display_name: account.name, created_by: user.id, role: 'AR' }).select('id').single());
      account.playerId = player.id;
      await save();
    }
    await client.auth.signOut({ scope: 'local' });
  }
  const owner = fixture.accounts[0];
  for (const [index, side] of ['A', 'B'].entries()) {
    const team = await checked(stack.admin.from('teams').insert({ name: `R0 ${side} ${runId.slice(0, 8)}`,
      short_name: `R0${side}`, color_hex: index ? '#387AFF' : '#19AF74', entity_owner_id: owner.id,
    }).select('id,name,short_name').single());
    fixture.teams.push(team);
    await save();
    const players = fixture.accounts.slice(index * 3, index * 3 + 3);
    for (const [position, account] of players.entries()) {
      await checked(stack.admin.from('team_account_members').insert({ team_id: team.id, account_id: account.id,
        player_id: account.playerId, role: position ? 'PLAYER' : 'CAPTAIN', status: 'ACTIVE' }));
      await checked(stack.admin.from('team_players').insert({ team_id: team.id, player_id: account.playerId,
        is_captain: position === 0, is_keeper: position === 1 }));
    }
  }
  return fixture;
}

export async function cleanupFixture() {
  const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (fixture.cleaned) return;
  if (!/^[0-9a-f-]{36}$/.test(fixture.runId) || !fixture.accounts.length) throw new Error('No valid scoped cleanup manifest');
  const stack = await localClients();
  for (const account of fixture.accounts) {
    const lookup = await stack.admin.auth.admin.getUserById(account.id);
    if (lookup.error?.status === 404) continue;
    const { user } = await checked(lookup);
    if (user.user_metadata.e2e_run_id !== fixture.runId || user.email !== account.email) throw new Error('Cleanup ownership mismatch');
  }
  const ownerId = fixture.accounts[0].id;
  const matches = await checked(stack.admin.from('matches').select('id').eq('created_by', ownerId));
  for (const match of matches) await checked(stack.admin.from('matches').delete().eq('id', match.id).eq('created_by', ownerId));
  await checked(stack.admin.from('tournaments').delete().eq('created_by', ownerId));
  for (const team of fixture.teams) await checked(stack.admin.from('teams').delete().eq('id', team.id).eq('entity_owner_id', ownerId));
  for (const account of fixture.accounts) {
    if (account.playerId) await checked(stack.admin.from('players').delete().eq('id', account.playerId).eq('profile_id', account.id));
    const deletion = await stack.admin.auth.admin.deleteUser(account.id);
    if (deletion.error?.status !== 404) await checked(deletion);
  }
  fixture.cleaned = true;
  await writeFile(manifestPath, JSON.stringify(fixture, null, 2));
  console.log(`Removed only fixture resources for run ${fixture.runId}.`);
}
