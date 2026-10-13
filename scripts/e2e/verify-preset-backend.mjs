import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { checked, localClients, manifestPath } from './backend-fixture.mjs';
import { loadDomainApi } from './load-domain-api.mjs';

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const stack = await localClients();
const owner = fixture.accounts[0];
const client = stack.client();
await checked(client.auth.signInWithPassword({ email: owner.email, password: fixture.password }));
const api = await loadDomainApi('fixturesApi', client);
const cases = [];
const created = [];
async function tournament(label, count = 8) {
  const record = await checked(stack.admin.from('tournaments').insert({ created_by: owner.id, source_local_id: randomUUID(), name: 'Preset acceptance ' + label, format: 'TURF', visibility: 'PRIVATE', start_date: '2026-10-11', planned_team_count: count, players_per_team: 3, overs_per_match: 1, settings: { status: 'ACTIVE' } }).select('id').single());
  created.push(record.id);
  const teams = await checked(stack.admin.from('teams').insert(Array.from({ length: count }, (_, i) => ({ tournament_id: record.id, name: `${label} Team ${i + 1}`, short_name: `T${i + 1}`, color_hex: '#a6f477', entity_owner_id: owner.id }))).select('id,name'));
  return { id: record.id, teams: teams.sort((a, b) => Number(a.name.split(' ').at(-1)) - Number(b.name.split(' ').at(-1))) };
}
async function generate(record, algorithm, groups = 2) {
  const ids = record.teams.map(team => team.id);
  return api.generatePreset({ tournamentId: record.id, teamIds: ids, recommendation: { formatType: 'GROUPS_ONLY', knockoutRounds: [] }, pairingAlgorithm: algorithm, numberOfGroups: groups, advancePerGroup: 2, groupTeamIds: Array.from({ length: groups }, (_, i) => ids.slice(i * ids.length / groups, (i + 1) * ids.length / groups)) });
}
async function arrange(record, fixtures) {
  for (const f of fixtures) {
    const order = id => record.teams.findIndex(team => team.id === id);
    const winner = order(f.teamA) < order(f.teamB) ? f.teamA : f.teamB;
    const match = await checked(stack.admin.from('matches').select('id').eq('fixture_match_id', f.id).single());
    await checked(stack.admin.from('match_innings').upsert([f.teamA, f.teamB].map((team, i) => ({ match_id: match.id, sequence: i + 1, batting_team_id: team, bowling_team_id: team === f.teamA ? f.teamB : f.teamA, status: 'COMPLETED', total_runs: 100 - order(team) * 10, total_balls: 6, total_wickets: 0 })), { onConflict: 'match_id,sequence' }));
    await checked(stack.admin.from('matches').update({ status: 'COMPLETED', result: { kind: 'WIN', winnerTeamId: winner } }).eq('id', match.id));
    await checked(stack.admin.from('fixture_matches').update({ status: 'COMPLETED', score_a: 100 - order(f.teamA) * 10, score_b: 100 - order(f.teamB) * 10 }).eq('id', f.id));
  }
}
try {
  for (const [algorithm, count] of [['ROUND_ROBIN', 12], ['DOUBLE_ROUND_ROBIN', 24], ['WEIGHTED_ROUND_ROBIN', 12], ['SWISS', 4], ['RANDOM_PAIRS', 4]]) {
    const record = await tournament(algorithm);
    await generate(record, algorithm);
    const setup = await api.getFixtureSetup(record.id);
    assert.equal(setup.matches.length, count);
    assert.ok(setup.matches.every(match => match.teamA !== match.teamB && setup.groups.some(group => group.id === match.groupId && group.team_ids.includes(match.teamA) && group.team_ids.includes(match.teamB))));
    assert.equal((await checked(stack.admin.from('matches').select('id').eq('tournament_id', record.id))).length, count);
    if (algorithm === 'WEIGHTED_ROUND_ROBIN') assert.ok(setup.matches.every(match => Number.isFinite(match.weight)));
    cases.push({ algorithm, fixtures: count, passed: true });
    console.info('PASS actual atomic backend ' + algorithm + ': ' + count + ' fixtures');
  }
  for (const [preset, expectedCounts, custom] of [['FINAL_2', [1]], ['SF_4', [2, 1]], ['QF_8', [4, 2, 1]], ['PLAYOFFS_4', [2, 1, 1]], ['SIX_TEAM_CROSSOVER', [3, 1, 1]], ['CUSTOM', [1], 2], ['CUSTOM', [2, 1], 4], ['CUSTOM', [4, 2, 1], 8]]) {
    const record = await tournament(preset + (custom ?? ''));
    await generate(record, 'ROUND_ROBIN', preset === 'PLAYOFFS_4' ? 1 : 2);
    const groupSetup = await api.getFixtureSetup(record.id);
    await arrange(record, groupSetup.matches);
    const customIds = custom ? record.teams.slice(0, custom).map(team => team.id).reverse() : undefined;
    await api.generateKnockout({ tournamentId: record.id, preset, qualifierTeamIds: customIds });
    let setup = await api.getFixtureSetup(record.id);
    const stage = setup.stages.find(item => item.type === 'KNOCKOUT');
    if (custom) assert.deepEqual(setup.bracket.rounds[0].matches.flatMap(match => [match.teamA, match.teamB]), customIds);
    const winners = [], losers = [];
    for (const [roundIndex, expected] of expectedCounts.entries()) {
      setup = await api.getFixtureSetup(record.id);
      const current = setup.bracket.rounds[roundIndex].matches;
      assert.equal(current.length, expected);
      if (roundIndex === 0) {
        for (const match of current) {
          const sorted = [match.teamA, match.teamB].sort((a, b) => record.teams.findIndex(team => team.id === a) - record.teams.findIndex(team => team.id === b));
          winners.push(sorted[0]); losers.push(sorted[1]);
        }
      }
      if (preset === 'PLAYOFFS_4' && roundIndex === 1) assert.deepEqual([current[0].teamA, current[0].teamB], [losers[0], winners[1]]);
      if (preset === 'PLAYOFFS_4' && roundIndex === 2) assert.equal(current[0].teamA, winners[0]);
      if (preset === 'SIX_TEAM_CROSSOVER' && roundIndex > 0) {
        // Team 1 has independently known highest group-stage NRR (5 runs/over).
        assert.equal(stage.config.preset, preset);
        const persisted = await checked(stack.admin.from('fixture_stages').select('config').eq('id', stage.id).single());
        assert.equal(persisted.config.directFinalistTeamId, record.teams[0].id);
        if (roundIndex === 1) assert.ok(current.every(match => match.teamA !== record.teams[0].id && match.teamB !== record.teams[0].id));
        else assert.equal(current[0].teamA, record.teams[0].id);
      }
      await arrange(record, current);
      await api.advanceTournamentIfReady(record.id);
      const before = (await api.getFixtureSetup(record.id)).matches.map(match => match.id).sort();
      await api.advanceTournamentIfReady(record.id);
      assert.deepEqual((await api.getFixtureSetup(record.id)).matches.map(match => match.id).sort(), before);
    }
    setup = await api.getFixtureSetup(record.id);
    assert.equal(setup.stages.find(item => item.id === stage.id).status, 'COMPLETED');
    assert.equal(setup.bracket.rounds.at(-1).matches[0].result.winnerTeamId, record.teams[0].id);
    await assert.rejects(api.resetKnockout(record.id), error => /started|completed/i.test(error.message));
    cases.push({ preset, custom, roundCounts: expectedCounts, passed: true });
    console.info('PASS persisted ' + preset + (custom ?? '') + ', winner/loser paths, final completion, idempotence and reset guard');
  }
  const large = await tournament('Large64', 64);
  const started = performance.now();
  await generate(large, 'ROUND_ROBIN', 1);
  const setup = await api.getFixtureSetup(large.id);
  assert.equal(setup.matches.length, 2016);
  assert.ok(setup.matches.every(match => match.canonicalMatchId));
  cases.push({ largeSchedule: 2016, generationAndReadMs: performance.now() - started, passed: true });
  console.info('PASS 64-team schedule: all 2016 fixture/canonical associations survived backend pagination');
  await writeFile('.e2e/r7-preset-backend-evidence.json', JSON.stringify({ recordedAt: new Date().toISOString(), environment: 'Windows Node; isolated local Supabase PostgreSQL', source: 'Actual app API and owner RPCs; admin-arranged results supplement scorer-driven E28', cases }, null, 2));
} finally {
  for (const id of created) await checked(client.rpc('delete_owned_tournament', { p_tournament_id: id }));
  await writeFile('.e2e/r7-preset-dataset.json', JSON.stringify({ tournamentIds: created, environment: 'isolated wricket-e2e stack', cleaned: true }, null, 2));
  await client.auth.signOut({ scope: 'local' });
}
