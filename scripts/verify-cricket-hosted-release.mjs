import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = fileURLToPath(new URL('../', import.meta.url));
const ref = 'lzgnuqwvsioinwwrsdvn';
const url = `https://${ref}.supabase.co`;
const path = name => resolve(root, '.e2e/hosted', name);
async function checked(result) { const { data, error } = await result; if (error) throw new Error(error.message); return data; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 180000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await delay(1500); }
  throw new Error(`Timeout: ${label}`);
}

async function main() {
  if (!process.argv.includes('--production')) throw new Error('Use --production explicitly.');
  assert.equal((await readFile(resolve(root, 'supabase/.temp/project-ref'), 'utf8')).trim(), ref);
  const keys = JSON.parse(await readFile(path('api-keys.json'), 'utf8'));
  const secret = keys.find(key => key.type === 'secret')?.api_key ?? keys.find(key => key.name === 'service_role')?.api_key;
  const publishable = keys.find(key => key.type === 'publishable')?.api_key;
  assert.ok(secret && publishable, 'Authorised server and client keys are required');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  try {
    const previous = JSON.parse(await readFile(path('acceptance-fixture.json'), 'utf8'));
    if (!previous.cleaned) throw new Error('Clean the existing scoped hosted fixture before creating another.');
  } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const admin = createClient(url, secret, options);
  const client = () => createClient(url, publishable, options);
  const anonymous = client();
  const run = randomUUID();
  const fixture = { run, projectRef: ref, accounts: [], tournaments: [], teams: [], players: [], cleaned: false };
  const evidence = { at: new Date().toISOString(), projectRef: ref, run, passed: false, cases: [],
    scope: 'Temporary hosted fixture, real organiser/scorer/viewer RPCs and scheduled Edge worker. Completion and correction are controlled fixture writes, not a full UI tournament.' };
  const save = () => writeFile(path('acceptance-fixture.json'), JSON.stringify(fixture, null, 2), { mode: 0o600 });
  const pass = label => { evidence.cases.push(label); console.log(`PASS ${label}`); };
  let channel;
  const clients = [];
  await save();
  try {
    const password = `Hosted!${randomBytes(18).toString('hex')}`;
    for (const role of ['organiser', 'scorer', 'viewer']) {
      const email = `wricket-hosted-${run}-${role}@example.test`;
      const { user } = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true,
        user_metadata: { hosted_acceptance_run: run } }));
      fixture.accounts.push({ id: user.id, email, role }); await save();
      const accountClient = client(); clients.push(accountClient);
      await checked(accountClient.auth.signInWithPassword({ email, password }));
      await checked(accountClient.rpc('save_my_sports', { p_display_name: `Hosted acceptance ${role} ${run.slice(0, 8)}`,
        p_sport_codes: ['CRICKET'], p_primary_sport_code: 'CRICKET' }));
    }
    const [owner, scorer, viewer] = clients;
    const ownerId = fixture.accounts[0].id;
    const makeTournament = async label => {
      const tournament = await checked(admin.from('tournaments').insert({ created_by: ownerId,
        source_local_id: randomUUID(), name: `Hosted acceptance ${label} ${run}`, format: 'TURF', visibility: 'PUBLIC',
        start_date: '2026-10-11', planned_team_count: 4, players_per_team: 3, overs_per_match: 1,
        organizer_phone: '+91 90000 00000' }).select('id').single());
      fixture.tournaments.push(tournament.id); await save(); return tournament.id;
    };
    const tournamentId = await makeTournament('worker');
    for (const side of ['A', 'B', 'Placeholder']) {
      const team = await checked(owner.from('teams').insert({ tournament_id: tournamentId, entity_owner_id: ownerId,
        name: `Hosted ${side} ${run.slice(0, 8)}`, short_name: side.slice(0, 3), color_hex: '#a6f477' }).select('id').single());
      fixture.teams.push(team.id); await save();
    }
    const [teamA, teamB, placeholder] = fixture.teams;
    const invitation = await checked(owner.rpc('create_tournament_entry_invitation', { p_tournament_id: tournamentId,
      p_placeholder_team_id: placeholder, p_target_account_id: fixture.accounts[2].id, p_expires_hours: 1 }));
    assert.equal(await checked(viewer.rpc('claim_tournament_placeholder', { p_token: invitation.token })), placeholder);
    assert.ok((await scorer.rpc('claim_tournament_placeholder', { p_token: invitation.token })).error);
    await checked(owner.rpc('remove_owned_tournament_team', { p_tournament_id: tournamentId, p_team_id: placeholder }));
    pass('targeted captain claim, invitation replay denial and organiser team removal');

    const broadPhone = await viewer.from('tournaments').select('organizer_phone').eq('id', tournamentId);
    assert.ok(broadPhone.error);
    const anonPhone = await anonymous.from('tournaments').select('organizer_phone').eq('id', tournamentId);
    assert.ok(anonPhone.error);
    assert.ok((await viewer.rpc('claim_cricket_mvp_work', { p_limit: 1 })).error);
    assert.ok((await viewer.rpc('get_cricket_mvp_worker_heartbeat')).error);
    const workerURL = `${url}/functions/v1/cricket-mvp-worker`;
    assert.equal((await fetch(workerURL, { method: 'POST', body: '{}' })).status, 401);
    const session = await checked(viewer.auth.getSession());
    assert.equal((await fetch(workerURL, { method: 'POST', headers: { Authorization: `Bearer ${session.session.access_token}` }, body: '{}' })).status, 401);
    pass('phone privacy and anonymous/user denial of privileged worker and health endpoints');

    for (const [index, teamId] of [teamA, teamB].entries()) {
      for (let order = 1; order <= 3; order++) {
        const player = await checked(admin.from('players').insert({ display_name: `Hosted ${index + 1} player ${order} ${run.slice(0, 8)}`,
          created_by: ownerId, role: 'AR' }).select('id').single());
        fixture.players.push(player.id); await save();
        await checked(admin.from('team_players').insert({ team_id: teamId, player_id: player.id,
          is_captain: order === 1, is_keeper: order === 2 }));
      }
    }
    const setup = { p_request_id: randomUUID(), p_tournament_id: tournamentId, p_team_a_id: teamA, p_team_b_id: teamB,
      p_format: 'TURF', p_rules: { oversPerInnings: 1, playersPerSide: 3, inningsPerTeam: 1 }, p_scheduled_at: null, p_venue: 'Hosted acceptance fixture' };
    const matchId = await checked(owner.rpc('create_owned_match_idempotent', setup));
    assert.equal(await checked(owner.rpc('create_owned_match_idempotent', setup)), matchId);
    const xi = offset => fixture.players.slice(offset, offset + 3).map((id, index) => ({ player_id: id, batting_order: index + 1, is_captain: index === 0, is_keeper: index === 1 }));
    const started = await checked(owner.rpc('start_match_setup', { p_match_id: matchId, p_team_a_xi: xi(0), p_team_b_xi: xi(3), p_toss_winner_team_id: teamA, p_toss_choice: 'BAT' }));
    await checked(owner.rpc('assign_tournament_scorer', { p_tournament_id: tournamentId, p_account_id: fixture.accounts[1].id }));
    assert.ok((await viewer.rpc('acquire_scoring_lease', { p_match_id: matchId, p_device_id: `viewer-${run}` })).error);
    const lease = await checked(scorer.rpc('acquire_scoring_lease', { p_match_id: matchId, p_device_id: `scorer-${run}` }));
    const eventId = randomUUID();
    const sequence = (await checked(admin.from('match_events').select('sequence').eq('match_id', matchId).order('sequence', { ascending: false }).limit(1)))[0]?.sequence ?? 0;
    const ball = { p_match_id: matchId, p_client_event_id: eventId, p_expected_sequence: sequence, p_lease_token: lease.lease_token,
      p_kind: 'BALL_RECORDED', p_payload: { innings_id: started.innings_id, over_no: 0, ball_in_over: 1, legal_ball_in_over: 1,
        striker_id: fixture.players[0], non_striker_id: fixture.players[1], bowler_id: fixture.players[3],
        runs_bat: 4, runs_extra: 0, extra_kind: null, is_legal: true, is_wicket: false } };
    await checked(scorer.rpc('append_match_event', ball));
    await checked(scorer.rpc('append_match_event', ball));
    assert.equal((await checked(admin.from('match_events').select('id').eq('match_id', matchId).eq('client_event_id', eventId))).length, 1);
    pass('owner match idempotency, assigned scorer, spectator denial and exactly-once delivery');

    const realtime = [];
    channel = viewer.channel(`hosted-acceptance-${run}`).on('postgres_changes', { event: 'INSERT', schema: 'public',
      table: 'match_mvp_results', filter: `match_id=eq.${matchId}` }, payload => { realtime.push(payload.new); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Realtime subscription timeout')), 20000);
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
        else if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { clearTimeout(timer); reject(new Error('Realtime unavailable')); }
      });
    });
    await checked(admin.from('matches').update({ status: 'COMPLETED', result: { kind: 'WIN_BY_RUNS', winnerTeamId: teamA, margin: 4 } }).eq('id', matchId).eq('created_by', ownerId));
    const rankings = () => checked(viewer.from('match_mvp_results').select('player_id,batting_breakdown,batting_points').eq('match_id', matchId));
    await until(async () => (await rankings()).some(row => row.player_id === fixture.players[0] && row.batting_breakdown.runs === 4), 'scheduled completion calculation');
    await until(() => realtime.some(row => row.player_id === fixture.players[0] && row.batting_breakdown.runs === 4), 'independent Realtime completion');
    pass('scheduled hosted worker completion and independent viewer Realtime rankings');
    const latest = (await checked(admin.from('match_events').select('sequence').eq('match_id', matchId).order('sequence', { ascending: false }).limit(1)))[0].sequence;
    await checked(admin.from('match_events').insert({ match_id: matchId, client_event_id: randomUUID(), sequence: latest + 1,
      kind: 'BALL_CORRECTED', payload: { target_client_event_id: eventId }, scorer_id: fixture.accounts[1].id }));
    await until(async () => (await rankings()).some(row => row.player_id === fixture.players[0] && row.batting_breakdown.runs === 0), 'correction convergence');
    await until(() => realtime.some(row => row.player_id === fixture.players[0] && row.batting_breakdown.runs === 0), 'independent Realtime correction');
    pass('completed-match correction recalculation and independent viewer Realtime convergence');

    const assignments = await checked(owner.rpc('list_tournament_scorers', { p_tournament_id: tournamentId }));
    await checked(owner.rpc('remove_tournament_scorer', { p_tournament_id: tournamentId, p_scorer_id: assignments[0].scorer_id }));
    assert.ok((await scorer.rpc('acquire_scoring_lease', { p_match_id: matchId, p_device_id: `scorer-${run}` })).error);
    pass('organiser scorer revocation');

    const poolId = await makeTournament('registration');
    await checked(owner.rpc('configure_tournament_registration', { p_tournament_id: poolId, p_entry_mode: 'PLAYER_POOL',
      p_published: true, p_open: true, p_fee_required: true, p_fee_label: 'Manual acceptance fee', p_payment_instructions: 'Acceptance fixture only' }));
    const registration = await checked(viewer.rpc('submit_tournament_player_form', { p_tournament_id: poolId,
      p_role: 'AR', p_phone: '+91 90000 00001', p_note: 'Hosted acceptance fixture', p_answers: {} }));
    assert.equal((await checked(scorer.from('tournament_player_registrations').select('id,contact_phone').eq('tournament_id', poolId))).length, 0);
    await checked(owner.rpc('review_tournament_player_registration', { p_registration_id: registration, p_status: 'APPROVED', p_payment_status: 'DONE' }));
    const directory = await checked(scorer.rpc('list_registered_tournament_players', { p_tournament_id: poolId }));
    assert.equal(directory.length, 1);
    assert.ok(!Object.hasOwn(directory[0], 'contact_phone'));
    assert.equal((await checked(owner.from('tournament_player_registrations').select('payment_status').eq('id', registration).single())).payment_status, 'DONE');
    pass('published player registration, manual payment flag and public directory privacy');
    evidence.passed = true;
  } finally {
    await writeFile(path('acceptance-evidence.json'), JSON.stringify(evidence, null, 2));
    if (channel) await clients[2].removeChannel(channel);
    const owner = clients[0];
    if (owner) {
      for (const id of fixture.tournaments) {
        const tournament = await checked(admin.from('tournaments').select('created_by,name').eq('id', id).maybeSingle());
        if (!tournament) continue;
        assert.equal(tournament.created_by, fixture.accounts[0].id);
        assert.ok(tournament.name.endsWith(run));
        await checked(owner.rpc('delete_owned_tournament', { p_tournament_id: id }));
      }
    }
    for (const account of fixture.accounts) {
      await checked(admin.from('players').delete().eq('created_by', account.id));
    }
    for (const account of fixture.accounts) {
      const { user } = await checked(admin.auth.admin.getUserById(account.id));
      assert.equal(user.user_metadata.hosted_acceptance_run, run);
      assert.equal(user.email, account.email);
      await checked(admin.auth.admin.deleteUser(account.id));
    }
    await Promise.all(clients.map(client => client.auth.signOut({ scope: 'local' })));
    fixture.cleaned = true; await save();
    evidence.cleaned = true;
    await writeFile(path('acceptance-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log('Removed only the temporary hosted acceptance resources.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (cause) { console.error(cause.message); process.exitCode = 1; }
  process.exit(process.exitCode ?? 0);
}
