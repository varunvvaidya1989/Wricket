import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';
import { adb, nativePackage, nodes, tap, tapNode, type, hideKeyboard, open, scrollTo, screenshot, waitFor, waitForMetro } from './native-driver.mjs';

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients(); const owner = fixture.accounts[0]; const captain = fixture.accounts[1];
const client = stack.client(); const ids = [];
const press = async label => { tapNode(await scrollTo(label)); };
const fill = async (label, value) => {
  await scrollTo(label);
  const input = nodes().find(node => node.class === 'android.widget.EditText' && (node['content-desc'] === label || node.text === label));
  assert.ok(input, 'Native editable control: ' + label);
  tapNode(input); type(value); hideKeyboard();
};
async function tournament(mode) {
  const row = await checked(stack.admin.from('tournaments').insert({ name: 'Native ' + mode + ' ' + randomUUID().slice(0,8), format: 'T20', start_date: '2026-10-10', created_by: owner.id, visibility: 'PRIVATE', planned_team_count: 2, players_per_team: 3, overs_per_match: 20 }).select('id').single());
  ids.push(row.id);
  await checked(client.rpc('configure_tournament_registration', { p_tournament_id: row.id, p_entry_mode: mode, p_published: mode === 'PLAYER_POOL', p_open: mode === 'PLAYER_POOL', p_fee_required: true, p_fee_label: 'External fee', p_payment_instructions: 'Arrange payment with organiser.' }));
  return row.id;
}
async function signInForInvitation(account, token) {
  await waitForMetro();
  // Reset only the E2E app. Exercise the public invitation before sign-in.
  adb('shell','am','force-stop',nativePackage); adb('shell','pm','clear',nativePackage);
  adb('shell','run-as',nativePackage,'mkdir','-p','shared_prefs');
  adb('shell','run-as',nativePackage,'cp','/data/local/tmp/wricket-e2e-prefs.xml','shared_prefs/' + nativePackage + '_preferences.xml');
  adb('reverse','tcp:4173','tcp:4173'); adb('reverse','tcp:54321','tcp:54321');
  adb('shell','am','start','-n',nativePackage + '/.MainActivity');
  await waitFor('SPORTSTAGE NOW');
  open('/wricket/tournament/join?token=' + token);
  await tap('Sign in for tournament invitation'); await tap('Sign in with password');
  let fields = nodes().filter(node => node.class === 'android.widget.EditText');
  tapNode(fields.find(node => node.password !== 'true')); type(account.email);
  fields = nodes().filter(node => node.class === 'android.widget.EditText');
  tapNode(fields.find(node => node.password === 'true')); type(fixture.password); hideKeyboard();
  await tap('Sign in');
}
try {
  await checked(client.auth.signInWithPassword({ email: owner.email, password: fixture.password }));
  const teamsTournament = await tournament('EXISTING_TEAMS'); const poolTournament = await tournament('PLAYER_POOL');
  await checked(client.rpc('configure_tournament_registration_form', { p_tournament_id: poolTournament, p_questions: [{ id: 'dates', label: 'Available dates', type: 'TEXT', required: true }, { id: 'slot', label: 'Preferred slot', type: 'CHOICE', required: true, options: ['Morning','Evening'] }] }));
  const team = await checked(stack.admin.from('teams').insert({ tournament_id: teamsTournament, entity_owner_id: owner.id, name: 'Native Reserved Stars', short_name: 'NRS', color_hex: '#a6f477' }).select('id').single());
  const invitation = await checked(client.rpc('create_tournament_entry_invitation', { p_tournament_id: teamsTournament, p_placeholder_team_id: team.id, p_target_account_id: captain.id, p_expires_hours: 168 }));
  if (process.env.WRICKET_NATIVE_TEAM_ONLY !== '1') {
  await signInForInvitation(captain, invitation.token); await waitFor('Claim captain role'); screenshot('native-captain-claim.png');
  await tap('Claim captain role'); await waitFor('Manage roster');
  const member = await checked(stack.admin.from('team_account_members').select('role,status').eq('team_id',team.id).eq('account_id',captain.id).single());
  assert.deepEqual(member,{ role: 'CAPTAIN', status: 'ACTIVE' });
  await tap('Manage roster'); await fill('Search player name',fixture.accounts[2].name);
  await press('Add ' + fixture.accounts[2].name + ' as player');
  await waitFor(fixture.accounts[2].name + ' added as player.'); screenshot('native-claimed-roster.png');
  assert.equal((await checked(stack.admin.from('team_players').select('player_id').eq('team_id',team.id))).length,2);
  console.info('PASS Android invitation before sign-in, preserved auth continuation, reserved captain claim and delegated roster management');
  open('/wricket/tournament/' + poolTournament + '?tab=players');
  await press('Request to join'); await fill('Registration contact number','9000000000');
  await fill('Available dates','Weekend mornings'); await press('Preferred slot: Morning');
  await press('Submit application'); await waitFor('Pending review'); screenshot('native-player-application.png');
  const registration = await checked(stack.admin.from('tournament_player_registrations').select('status,payment_status,custom_answers').eq('tournament_id',poolTournament).eq('account_id',captain.id).single());
  assert.equal(registration.status,'PENDING'); assert.equal(registration.payment_status,'PENDING');
  assert.deepEqual(registration.custom_answers,{ dates: 'Weekend mornings',slot: 'Morning' });
  open('/wricket/my-wricket'); await press('My applications'); await waitFor('Your tournament applications.');
  await scrollTo('Pending review'); screenshot('native-application-tracking.png');
  console.info('PASS Android player registration, keyboard dismissal, required text/choice answers, external-payment flag and My applications tracking');
  }
  await checked(client.rpc('configure_tournament_registration', { p_tournament_id: teamsTournament, p_entry_mode: 'EXISTING_TEAMS', p_published: true, p_open: true, p_fee_required: true, p_fee_label: 'External fee', p_payment_instructions: 'Arrange payment with organiser.' }));
  await checked(client.rpc('configure_tournament_registration_form', { p_tournament_id: teamsTournament, p_questions: [{ id: 'dates', label: 'Squad availability', type: 'TEXT', required: true }] }));
  const clubCaptain = fixture.accounts[3];
  const teamInvite = await checked(client.rpc('create_tournament_entry_invitation', { p_tournament_id: teamsTournament, p_placeholder_team_id: null, p_target_account_id: null, p_expires_hours: 168 }));
  await signInForInvitation(clubCaptain, teamInvite.token);
  await waitFor('Your team application'); await press('Apply with ' + fixture.teams[1].name);
  await fill('Team registration contact number','9000000000'); await fill('Squad availability','Sunday mornings');
  await press('Submit team application'); await waitFor('Pending review'); screenshot('native-team-application.png');
  const teamApplication = await checked(stack.admin.from('tournament_team_applications').select('id,status,payment_status,custom_answers').eq('tournament_id',teamsTournament).eq('account_id',clubCaptain.id).single());
  assert.equal(teamApplication.status,'PENDING'); assert.equal(teamApplication.payment_status,'PENDING');
  assert.deepEqual(teamApplication.custom_answers,{ dates: 'Sunday mornings' });
  await checked(client.rpc('review_tournament_team_application',{ p_application_id: teamApplication.id,p_status: 'APPROVED',p_payment_status: null }));
  open('/wricket/my-wricket'); await press('My applications'); await waitFor('Approved'); screenshot('native-approved-team-tracking.png');
  console.info('PASS Android existing-team invitation, eligible club selection, keyboard/form answers, approval and refreshed application tracking');
} finally {
  for (const id of ids) await checked(stack.admin.from('tournaments').delete().eq('id',id).eq('created_by',owner.id));
  await client.auth.signOut({ scope: 'local' });
}
