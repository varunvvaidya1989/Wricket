import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { localClients } from './backend-fixture.mjs';
import { signedClients, checked } from './signed-release-fixture.mjs';

const hosted = process.argv.includes('--production');
assert.ok(hosted || process.argv.includes('--local'));
const source = await readFile(new URL('../../lib/supabase/accountDeletion.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { deleteMyAccount } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const stack = await (hosted ? signedClients() : localClients());
const run = randomUUID();
const password = `Deletion!${randomBytes(16).toString('hex')}`;
const accounts = [];
const report = { target: hosted ? 'hosted' : 'local', checks: [], fixtureRemoved: false };
const evidence = `.e2e/account-deletion-${report.target}`;
await mkdir(evidence, { recursive: true });
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9kAAAAASUVORK5CYII=', 'base64');
let clubId, tournamentId, matchId;
try {
  for (const role of ['owner', 'other']) {
    const email = `wricket-delete-${run}-${role}@example.test`;
    const { user } = await checked(stack.admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_deletion_run: run } }));
    const account = { id: user.id, email, client: stack.client(), path: `${user.id}/deletion-review.png`, deleted: false };
    accounts.push(account);
    await checked(account.client.auth.signInWithPassword({ email, password }));
    await checked(account.client.rpc('save_my_sports', { p_display_name: `Deletion ${role}`, p_sport_codes: ['CRICKET', 'BADMINTON'], p_primary_sport_code: 'CRICKET' }));
    await checked(account.client.storage.from('profile-media').upload(account.path, image, { contentType: 'image/png' }));
  }
  const [owner, other] = accounts;
  const retainedToken = (await owner.client.auth.getSession()).data.session.access_token;
  const confirmation = await owner.client.rpc('delete_my_sportstage_account', { p_confirmation: null });
  assert.match(confirmation.error?.message ?? '', /ACCOUNT_DELETION_CONFIRMATION/);
  const { data: manifest } = await checkedResult(owner.client.rpc('list_my_account_deletion_media', { p_confirmation: 'DELETE' }));
  assert.ok(manifest.some(x => x.storage_path === owner.path));
  assert.ok(manifest.every(x => x.storage_path !== other.path));
  const guest = stack.client();
  assert.ok((await guest.rpc('list_my_account_deletion_media', { p_confirmation: 'DELETE' })).error);
  report.checks.push('NULL confirmation and anonymous callers denied; manifest contains only caller-scoped files');

  clubId = await checked(owner.client.rpc('create_sport_club', { p_sport_code: 'BADMINTON', p_name: `Deletion guard ${run}`, p_short_name: 'DEL', p_visibility: 'PRIVATE' }));
  await assert.rejects(deleteMyAccount(owner.client, 'DELETE'), error => /ACCOUNT_DELETION_SHARED_RECORDS/.test(error.message));
  await checked(owner.client.storage.from('profile-media').download(owner.path));
  assert.ok((await checked(stack.admin.auth.admin.getUserById(owner.id))).user);
  await checked(stack.admin.from('sport_clubs').delete().eq('id', clubId).eq('owner_account_id', owner.id));
  clubId = undefined;
  report.checks.push('Restrictive ownership blocks deletion before any file removal; identity and avatar remain available');

  const sport = await checked(owner.client.from('sports').select('id').eq('code', 'BADMINTON').single());
  const sideA = await checked(owner.client.from('sport_profiles').select('id').eq('account_id', owner.id).eq('sport_id', sport.id).single());
  const sideB = await checked(other.client.from('sport_profiles').select('id').eq('account_id', other.id).eq('sport_id', sport.id).single());
  matchId = await checked(other.client.rpc('create_standalone_sport_scoring_match', { p_sport_code: 'BADMINTON', p_match_format: 'SINGLES', p_side_a_profile_ids: [sideA.id], p_side_b_profile_ids: [sideB.id], p_rules_snapshot: { initial_server: 0, options: { matchUnitsToWin: 2 } } }));
  await assert.rejects(deleteMyAccount(owner.client, 'DELETE'), error => /ACCOUNT_DELETION_SHARED_RECORDS/.test(error.message));
  assert.ok((await checked(stack.admin.from('sport_scoring_matches').select('id').eq('id', matchId))).length);
  await checked(owner.client.storage.from('profile-media').download(owner.path));
  await checked(stack.admin.from('sport_scoring_matches').delete().eq('id', matchId).eq('created_by', other.id));
  matchId = undefined;
  report.checks.push('A participant in another account’s real racket match cannot delete shared history; the match and avatar remain intact');

  tournamentId = (await checked(owner.client.from('tournaments').insert({ created_by: owner.id, source_local_id: randomUUID(), name: `Account deletion ${run}`, format: 'T20', visibility: 'PRIVATE', start_date: '2026-10-13', planned_team_count: 2, players_per_team: 11, overs_per_match: 10 }).select('id').single())).id;
  await deleteMyAccount(owner.client, 'DELETE');
  owner.deleted = true;
  const removedIdentity = await stack.admin.auth.admin.getUserById(owner.id);
  assert.equal(removedIdentity.error?.status, 404);
  assert.equal((await checked(stack.admin.from('profiles').select('id').eq('id', owner.id))).length, 0);
  assert.equal((await checked(stack.admin.from('tournaments').select('id').eq('id', tournamentId))).length, 0);
  tournamentId = undefined;
  const files = await checked(stack.admin.storage.from('profile-media').list(owner.id));
  assert.equal(files.length, 0);
  await checked(other.client.storage.from('profile-media').download(other.path));
  assert.equal((await owner.client.auth.getSession()).data.session.access_token, retainedToken);
  assert.ok((await owner.client.storage.from('profile-media').upload(`${owner.id}/retained-token.png`, image, { contentType: 'image/png' })).error);
  assert.equal((await checked(stack.admin.storage.from('profile-media').list(owner.id))).length, 0);
  report.checks.push('A retained, unexpired JWT cannot recreate Storage files after deletion');
  assert.ok((await owner.client.auth.signInWithPassword({ email: owner.email, password })).error);
  report.checks.push('Real Storage API removal and transactional account deletion remove avatar, profile, Auth identity and owned cricket tournament; other account and file survive');
  report.status = 'PASS';
} finally {
  if (matchId && accounts[1]) await checked(stack.admin.from('sport_scoring_matches').delete().eq('id', matchId).eq('created_by', accounts[1].id));
  for (const account of accounts) {
    if (account.deleted) continue;
    const { user } = await checked(stack.admin.auth.admin.getUserById(account.id));
    assert.equal(user.user_metadata.account_deletion_run, run);
    if (clubId) await checked(stack.admin.from('sport_clubs').delete().eq('id', clubId).eq('owner_account_id', account.id));
    if (tournamentId) await checked(account.client.rpc('delete_owned_tournament', { p_tournament_id: tournamentId }));
    await checked(stack.admin.storage.from('profile-media').remove([account.path]));
    await checked(stack.admin.auth.admin.deleteUser(account.id));
  }
  report.fixtureRemoved = true;
  await writeFile(`${evidence}/review.json`, JSON.stringify(report, null, 2));
}
console.info(JSON.stringify(report));

async function checkedResult(promise) {
  const result = await promise;
  if (result.error) throw result.error;
  return result;
}
