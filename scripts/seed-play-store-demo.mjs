#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const ADMIN_EMAIL = 'admin@sportstageapp.com';
const url = process.env.SPORTSTAGE_SUPABASE_URL;
const serviceKey = process.env.SPORTSTAGE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('SPORTSTAGE_SUPABASE_URL and SPORTSTAGE_SUPABASE_SERVICE_ROLE_KEY are required');

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});
const tournaments = [
  { name: 'SportStage Premier League 2026', format: 'T20', start: '2026-07-12T09:00:00+05:30', end: '2026-07-26', location: 'Jawaharlal Nehru Stadium, New Delhi', status: 'COMPLETED', description: 'Four elite city teams compete under lights in SportStage’s flagship T20 league.', reward: 'Champions ₹1,00,000 • Runners-up ₹50,000', teams: ['Delhi Strikers', 'Mumbai Waves', 'Bengaluru Blazers', 'Chennai Kings'] },
  { name: 'Monsoon Cricket Championship', format: 'T10', start: '2026-08-06T18:30:00+05:30', end: '2026-08-10', location: 'Sector 21 Cricket Ground, Gurugram', status: 'LIVE', description: 'Fast-paced evening cricket featuring live ball-by-ball scoring and instant match moments.', reward: 'Champions Trophy • Player of the Series', teams: ['Thunderbolts', 'Rain Riders', 'Storm XI', 'Cloud Warriors'] },
  { name: 'Corporate Champions Cup', format: 'T20', start: '2026-09-05T08:30:00+05:30', end: '2026-09-20', location: 'Sports Complex, Noida', status: 'UPCOMING', description: 'A professionally managed corporate cricket tournament with league and knockout rounds.', reward: 'Champions ₹75,000 • Best Batter • Best Bowler', teams: ['Tech Titans', 'Finance Falcons', 'Creative Challengers', 'Operations United'] },
  { name: 'Women’s T20 Showcase', format: 'T20', start: '2026-08-15T10:00:00+05:30', end: '2026-08-23', location: 'Arun Jaitley Stadium, New Delhi', status: 'MIXED', description: 'A celebration of women’s cricket with emerging talent, live scoring and complete player statistics.', reward: 'Champions ₹1,00,000 • Emerging Player Award', teams: ['Capital Queens', 'Royal Phoenix', 'Supernovas', 'Victory XI'] },
];

const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Ishaan', 'Kabir', 'Arjun', 'Rohan', 'Kunal', 'Dev', 'Nikhil', 'Meera', 'Ananya', 'Diya', 'Kavya', 'Riya', 'Ira'];
const lastNames = ['Sharma', 'Singh', 'Patel', 'Gupta', 'Mehta', 'Rao', 'Kapoor', 'Verma', 'Nair', 'Joshi'];

async function must(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function findAdmin() {
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find(item => item.email?.toLowerCase() === ADMIN_EMAIL);
    if (user) return user;
    if (data.users.length < 1000) throw new Error(`${ADMIN_EMAIL} does not exist in SportStage Auth`);
  }
}

function playerName(index, women) {
  const offset = women ? 10 : 0;
  return `${firstNames[(index + offset) % firstNames.length]} ${lastNames[(index * 3 + offset) % lastNames.length]}`;
}

async function seedTournament(ownerId, definition, tournamentIndex) {
  const existing = await must(db.from('tournaments').select('id').eq('name', definition.name).maybeSingle(), `Check ${definition.name}`);
  if (existing) {
    console.log(`Skipping existing tournament: ${definition.name}`);
    await ensureFixtures(existing.id, definition.name);
    return { skipped: true };
  }
  const tournamentId = randomUUID();
  await must(db.from('tournaments').insert({
    id: tournamentId, name: definition.name, format: definition.format, visibility: 'PUBLIC',
    start_date: definition.start.slice(0, 10), start_at: definition.start, end_date: definition.end,
    planned_team_count: 4, players_per_team: 11, description: definition.description,
    organizer_phone: '+919810000001', location: definition.location, created_by: ownerId,
    settings: { demo_seed: 'play_store_2026', rewards: definition.reward },
  }), `Create ${definition.name}`);

  const teamRows = definition.teams.map((name, index) => ({
    id: randomUUID(), tournament_id: tournamentId, name,
    short_name: name.split(' ').map(word => word[0]).join('').slice(0, 4).toUpperCase(),
    color_hex: ['#F5B700', '#17C3B2', '#FF5A5F', '#7B61FF'][index],
  }));
  await must(db.from('teams').insert(teamRows), `Create teams for ${definition.name}`);

  const teamPlayers = new Map();
  for (let teamIndex = 0; teamIndex < teamRows.length; teamIndex += 1) {
    const players = Array.from({ length: 11 }, (_, playerIndex) => ({
      id: randomUUID(), created_by: ownerId,
      display_name: playerName(tournamentIndex * 44 + teamIndex * 11 + playerIndex, tournamentIndex === 3),
      role: playerIndex === 0 ? 'WK' : playerIndex < 5 ? 'BAT' : playerIndex < 9 ? 'AR' : 'BOWL',
      batting_hand: playerIndex % 4 === 0 ? 'Left-handed' : 'Right-handed',
      bowling_style: playerIndex < 5 ? null : playerIndex % 2 ? 'Right-arm medium' : 'Right-arm off break',
      source_system: 'sportstage_demo', source_player_id: `${tournamentIndex}-${teamIndex}-${playerIndex}`,
      source_metadata: { demo_seed: 'play_store_2026' },
    }));
    await must(db.from('players').insert(players), `Create players for ${teamRows[teamIndex].name}`);
    await must(db.from('team_players').insert(players.map((player, index) => ({
      team_id: teamRows[teamIndex].id, player_id: player.id, jersey_no: index + 1,
      is_captain: index === 0, is_keeper: index === 0,
    }))), `Create roster for ${teamRows[teamIndex].name}`);
    teamPlayers.set(teamRows[teamIndex].id, players);
  }

  const fixtures = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
  let matchCount = 0;
  let eventCount = 0;
  for (let matchIndex = 0; matchIndex < fixtures.length; matchIndex += 1) {
    const [a, b] = fixtures[matchIndex];
    const teamA = teamRows[a];
    const teamB = teamRows[b];
    const isCompleted = definition.status === 'COMPLETED' || (definition.status === 'MIXED' && matchIndex < 3) || (definition.status === 'LIVE' && matchIndex < 2);
    const isLive = definition.status === 'LIVE' && matchIndex === 2;
    const status = isCompleted ? 'COMPLETED' : isLive ? 'IN_PROGRESS' : 'SCHEDULED';
    const matchId = randomUUID();
    const inningsId = randomUUID();
    const scheduled = new Date(new Date(definition.start).getTime() + matchIndex * 86400000).toISOString();
    const result = isCompleted ? { kind: 'WIN', winnerTeamId: matchIndex % 2 ? teamB.id : teamA.id, margin: matchIndex % 2 ? '5 wickets' : '18 runs' } : null;
    await must(db.from('matches').insert({
      id: matchId, tournament_id: tournamentId, team_a_id: teamA.id, team_b_id: teamB.id,
      format: definition.format, status, visibility: 'PUBLIC', venue: definition.location,
      scheduled_at: scheduled, created_by: ownerId, toss_winner_team_id: teamA.id, toss_choice: 'BAT',
      result, rules: { overs: definition.format === 'T10' ? 10 : 20, playersPerTeam: 11 },
    }), `Create match ${matchIndex + 1}`);
    const xiRows = [teamA, teamB].flatMap(team => teamPlayers.get(team.id).map((player, index) => ({
      match_id: matchId, team_id: team.id, player_id: player.id, batting_order: index + 1,
      is_captain: index === 0, is_keeper: index === 0,
    })));
    await must(db.from('match_xis').insert(xiRows), `Create XIs for match ${matchIndex + 1}`);
    if (isCompleted || isLive) {
      const balls = isLive ? 22 : 36;
      const batting = teamPlayers.get(teamA.id);
      const bowling = teamPlayers.get(teamB.id);
      const events = Array.from({ length: balls }, (_, ball) => {
        const runs = [1, 0, 4, 1, 2, 6, 0, 1][(ball + matchIndex) % 8];
        const wicket = ball > 0 && ball % 17 === 0;
        return {
          id: randomUUID(), match_id: matchId, client_event_id: `demo-${matchId}-${ball}`, sequence: ball + 1,
          kind: 'BALL_RECORDED', scorer_id: ownerId,
          payload: {
            innings_id: inningsId, striker_id: batting[ball % 4].id, non_striker_id: batting[(ball + 1) % 4].id,
            bowler_id: bowling[6 + (ball % 4)].id, runs_bat: runs, runs_extra: 0, is_legal: true,
            is_wicket: wicket, out_player_id: wicket ? batting[ball % 4].id : null,
            dismissal_kind: wicket ? 'BOWLED' : null, event_label: wicket ? 'W' : String(runs),
          },
        };
      });
      const totalRuns = events.reduce((sum, event) => sum + event.payload.runs_bat, 0);
      const wickets = events.filter(event => event.payload.is_wicket).length;
      await must(db.from('match_innings').insert({
        id: inningsId, match_id: matchId, sequence: 1, batting_team_id: teamA.id, bowling_team_id: teamB.id,
        status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS', total_runs: totalRuns, total_wickets: wickets, total_balls: balls,
      }), `Create innings for match ${matchIndex + 1}`);
      await must(db.from('match_events').insert(events), `Create events for match ${matchIndex + 1}`);
      await must(db.from('match_snapshots').insert({
        match_id: matchId, latest_sequence: balls,
        scoreboard: { innings_id: inningsId, batting_team_id: teamA.id, bowling_team_id: teamB.id, total_runs: totalRuns, total_wickets: wickets, legal_balls: balls, last_event: events.at(-1).payload.event_label },
        scorecard: { batting: batting.slice(0, 4).map((player, index) => ({ playerId: player.id, name: player.display_name, runs: 12 + index * 9, balls: 8 + index * 5 })) },
      }), `Create snapshot for match ${matchIndex + 1}`);
      await must(db.from('matches').update({ current_sequence: balls }).eq('id', matchId), `Update match sequence ${matchIndex + 1}`);
      eventCount += events.length;
    }
    matchCount += 1;
  }
  console.log(`Created ${definition.name}: 4 teams, 44 players, ${matchCount} matches, ${eventCount} ball events`);
  await ensureFixtures(tournamentId, definition.name);
  return { skipped: false, teams: 4, players: 44, matches: matchCount, events: eventCount };
}

async function ensureFixtures(tournamentId, tournamentName) {
  const matches = await must(
    db.from('matches').select('id, team_a_id, team_b_id, status, result, fixture_match_id, scheduled_at').eq('tournament_id', tournamentId).order('scheduled_at'),
    `Read matches for ${tournamentName}`,
  );
  if (!matches.length) return;
  let stage = await must(db.from('fixture_stages').select('id').eq('tournament_id', tournamentId).eq('stage_order', 1).maybeSingle(), `Check fixture stage for ${tournamentName}`);
  if (!stage) {
    stage = await must(db.from('fixture_stages').insert({
      id: randomUUID(), tournament_id: tournamentId, stage_order: 1, type: 'GROUP',
      status: matches.every(match => match.status === 'COMPLETED') ? 'COMPLETED' : 'IN_PROGRESS',
      config: { format: 'ROUND_ROBIN', advancePerGroup: 2, pointsRule: { win: 2, tie: 1, loss: 0, noResult: 1 }, tiebreakers: ['POINTS', 'NET_RUN_RATE'] },
    }).select('id').single(), `Create fixture stage for ${tournamentName}`);
  }
  const teamIds = [...new Set(matches.flatMap(match => [match.team_a_id, match.team_b_id]))];
  let group = await must(db.from('fixture_groups').select('id').eq('stage_id', stage.id).eq('name', 'League').maybeSingle(), `Check fixture group for ${tournamentName}`);
  if (!group) {
    group = await must(db.from('fixture_groups').insert({ id: randomUUID(), stage_id: stage.id, name: 'League', team_ids: teamIds }).select('id').single(), `Create fixture group for ${tournamentName}`);
  }
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match.fixture_match_id) continue;
    const fixtureId = randomUUID();
    const fixtureStatus = match.status === 'COMPLETED' ? 'COMPLETED' : match.status === 'IN_PROGRESS' ? 'LIVE' : 'SCHEDULED';
    const winnerIsA = match.result?.winnerTeamId === match.team_a_id;
    const scoreA = fixtureStatus === 'COMPLETED' ? (winnerIsA ? 154 : 136) : null;
    const scoreB = fixtureStatus === 'COMPLETED' ? (winnerIsA ? 136 : 154) : null;
    // Insert with an unresolved opponent so the canonical-match insert trigger
    // intentionally skips it; then attach the existing scored match below.
    await must(db.from('fixture_matches').insert({
      id: fixtureId, stage_id: stage.id, group_id: group.id, team_a_id: match.team_a_id,
      team_b_id: null, round: Math.floor(index / 2) + 1, leg: 1, status: 'SCHEDULED',
    }), `Create fixture ${index + 1} for ${tournamentName}`);
    await must(db.from('fixture_matches').update({
      team_b_id: match.team_b_id, status: fixtureStatus, score_a: scoreA, score_b: scoreB,
    }).eq('id', fixtureId), `Complete fixture ${index + 1} for ${tournamentName}`);
    await must(db.from('matches').update({ fixture_match_id: fixtureId }).eq('id', match.id), `Connect fixture ${index + 1} for ${tournamentName}`);
  }
  console.log(`Verified fixtures for ${tournamentName}: ${matches.length}`);
}

async function run() {
  const admin = await findAdmin();
  if (!admin.email_confirmed_at) throw new Error(`${ADMIN_EMAIL} must be email verified before seeding`);
  const cricket = await must(db.from('sports').select('id').eq('code', 'CRICKET').single(), 'Find Cricket sport');
  await must(db.from('profiles').upsert({
    id: admin.id, display_name: 'SportStage Admin', primary_sport_id: cricket.id,
    onboarding_status: 'COMPLETED', onboarding_completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }), 'Prepare admin profile');
  await must(db.from('account_sports').upsert({
    account_id: admin.id, sport_id: cricket.id, access_status: 'ACTIVE', is_primary: true, updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id,sport_id' }), 'Grant Cricket access');

  const totals = { tournaments: 0, teams: 0, players: 0, matches: 0, events: 0 };
  for (let index = 0; index < tournaments.length; index += 1) {
    const result = await seedTournament(admin.id, tournaments[index], index);
    if (!result.skipped) {
      totals.tournaments += 1; totals.teams += result.teams; totals.players += result.players;
      totals.matches += result.matches; totals.events += result.events;
    }
  }
  console.log('Demo seed complete', totals);

  const savedTournaments = await must(db.from('tournaments').select('id').in('name', tournaments.map(item => item.name)), 'Verify demo tournaments');
  const tournamentIds = savedTournaments.map(item => item.id);
  const savedTeams = await must(db.from('teams').select('id').in('tournament_id', tournamentIds), 'Verify demo teams');
  const teamIds = savedTeams.map(item => item.id);
  const savedMatches = await must(db.from('matches').select('id').in('tournament_id', tournamentIds), 'Verify demo matches');
  const matchIds = savedMatches.map(item => item.id);
  const savedStages = await must(db.from('fixture_stages').select('id').in('tournament_id', tournamentIds), 'Verify demo fixture stages');
  const [{ count: rosterCount, error: rosterError }, { count: eventCount, error: eventError }, { count: fixtureCount, error: fixtureError }] = await Promise.all([
    db.from('team_players').select('*', { count: 'exact', head: true }).in('team_id', teamIds),
    db.from('match_events').select('*', { count: 'exact', head: true }).in('match_id', matchIds),
    db.from('fixture_matches').select('*', { count: 'exact', head: true }).in('stage_id', savedStages.map(item => item.id)),
  ]);
  if (rosterError) throw rosterError;
  if (eventError) throw eventError;
  if (fixtureError) throw fixtureError;
  console.log('Verified demo records', {
    tournaments: savedTournaments.length, teams: savedTeams.length,
    rosterPlayers: rosterCount ?? 0, fixtures: fixtureCount ?? 0, matches: savedMatches.length, ballEvents: eventCount ?? 0,
  });
}

run().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
