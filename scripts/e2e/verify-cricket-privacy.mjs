import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { localClients, checked, manifestPath } from './backend-fixture.mjs';

// Requires the isolated fixture. No hosted URL or service key is accepted.
const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(fixture.cleaned, false);
const stack = await localClients();
const ownerAccount = fixture.accounts[0];
const viewerAccount = fixture.accounts.find(account => account.name === 'R0 Viewer');
for (const account of [ownerAccount, viewerAccount]) {
  const { user } = await checked(stack.admin.auth.admin.getUserById(account.id));
  assert.equal(user.user_metadata.e2e_run_id, fixture.runId);
}
const owner = stack.client();
const viewer = stack.client();
const anonymous = stack.client();
await checked(owner.auth.signInWithPassword({ email: ownerAccount.email, password: fixture.password }));
await checked(viewer.auth.signInWithPassword({ email: viewerAccount.email, password: fixture.password }));
const phone = '+12025550123';
const tournament = await checked(owner.from('tournaments').insert({
  name: 'R1 International Community Cricket Championship with a deliberately long name',
  created_by: ownerAccount.id, format: 'T20', visibility: 'PUBLIC',
  start_date: '2026-09-25', organizer_phone: phone, settings: { status: 'ACTIVE' },
}).select('id,name').single());
let keep = false;
try {
  for (const [role, client] of [['owner', owner], ['viewer', viewer], ['anonymous', anonymous]]) {
    const safe = await checked(client.from('tournaments').select('id,name').eq('id', tournament.id).single());
    assert.equal(safe.name, tournament.name, `${role} safe projection remains accessible`);
    for (const projection of ['organizer_phone', '*']) {
      const denied = await client.from('tournaments').select(projection).eq('id', tournament.id);
      assert.ok(denied.error, `${role} cannot directly read the private column`);
      assert.equal(denied.data, null);
    }
  }
  const contact = client => client.rpc('get_tournament_organizer_contact', { p_tournament_id: tournament.id });
  assert.equal((await checked(contact(owner)))[0].phone, phone);
  assert.equal((await checked(contact(viewer)))[0].phone, null);
  assert.ok((await contact(anonymous)).error, 'Anonymous contact RPC is denied');
  await checked(owner.from('tournaments').update({ organizer_phone: '+12025550124' }).eq('id', tournament.id));
  assert.equal((await checked(contact(owner)))[0].phone, '+12025550124');
  // RLS can reject UPDATE or silently affect no rows. Verify stored state.
  await viewer.from('tournaments').update({ organizer_phone: '+12025550199' }).eq('id', tournament.id);
  assert.equal((await checked(contact(owner)))[0].phone, '+12025550124');
  keep = process.argv.includes('--keep');
  if (keep) await writeFile(new URL('../../.e2e/r1.json', import.meta.url), JSON.stringify({ tournament, phone: '+12025550124' }));
  console.log('PASS: owner, non-owner and anonymous projections; owner-only RPC; owner update; denied viewer update.');
} finally {
  if (!keep) await checked(stack.admin.from('tournaments').delete().eq('id', tournament.id).eq('created_by', ownerAccount.id));
  await owner.auth.signOut({ scope: 'local' });
  await viewer.auth.signOut({ scope: 'local' });
}
