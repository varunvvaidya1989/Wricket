import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients();
const ownerAccount = fixture.accounts[0];
const client = stack.client();
const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
  email: ownerAccount.email,
  password: fixture.password,
});
if (signInError) throw signInError;
const requestId = crypto.randomUUID();
const input = {
  p_request_id: requestId,
  p_tournament_id: null,
  p_team_a_id: fixture.teams[0].id,
  p_team_b_id: fixture.teams[1].id,
  p_format: 'T20',
  p_rules: { oversPerInnings: 2, playersPerSide: 3 },
  p_scheduled_at: '2026-09-27T08:00:00.000Z',
  p_venue: 'Idempotency test ground',
};
let matchId;
try {
  const [first, retry] = await Promise.all([
    checked(client.rpc('create_owned_match_idempotent', input)),
    checked(client.rpc('create_owned_match_idempotent', input)),
  ]);
  assert.equal(first, retry, 'Concurrent retries must return one canonical match');
  matchId = first;
  const rows = await checked(stack.admin.from('matches').select('id').eq('created_by', ownerAccount.id).eq('setup_request_id', requestId));
  assert.equal(rows.length, 1, 'One request ID must store exactly one match');
  const mismatch = await client.rpc('create_owned_match_idempotent', { ...input, p_venue: 'Different ground' });
  assert.ok(mismatch.error, 'Reusing a request ID with changed details must fail');
  assert.match(mismatch.error.message, /different match details/i);
  console.log('PASS: concurrent setup retries return one match and reject a changed payload.');
} finally {
  if (matchId) await checked(stack.admin.from('matches').delete().eq('id', matchId).eq('created_by', ownerAccount.id));
  if (signIn.session) await client.auth.signOut({ scope: 'local' });
}
