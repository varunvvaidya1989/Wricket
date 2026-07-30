import { getDb } from '@/lib/wricket/db/client';
import { DEFAULT_RULES, type MatchFormat } from '@/lib/wricket/domain/types';
import { getSupabaseClient } from './client';

/**
 * Rebuilds the offline scoring cache from the authoritative cloud match/event
 * log. Historical events are inserted directly into SQLite and never enter the
 * cloud outbox, so hydration cannot replay or duplicate remote scoring.
 */
export async function hydrateScoringMatch(matchId: string): Promise<void> {
  const client = getSupabaseClient();
  const { data: match, error: matchError } = await client.from('matches')
    .select('id, tournament_id, team_a_id, team_b_id, format, status, venue, scheduled_at, toss_winner_team_id, toss_choice, rules, result')
    .eq('id', matchId)
    .single();
  if (matchError) throw matchError;
  if (!['IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION'].includes(match.status)) {
    throw new Error('This match is no longer open for scoring.');
  }

  const [
    { data: innings, error: inningsError },
    { data: xis, error: xiError },
    { data: events, error: eventError },
  ] = await Promise.all([
    client.from('match_innings')
      .select('id, sequence, batting_team_id, bowling_team_id, status, target, is_follow_on, total_runs, total_wickets, total_balls')
      .eq('match_id', matchId)
      .order('sequence'),
    client.from('match_xis')
      .select('team_id, player_id, batting_order, is_captain, is_keeper')
      .eq('match_id', matchId)
      .order('batting_order'),
    client.from('match_events')
      .select('id, sequence, kind, payload, created_at')
      .eq('match_id', matchId)
      .order('sequence'),
  ]);
  if (inningsError) throw inningsError;
  if (xiError) throw xiError;
  if (eventError) throw eventError;
  if (!innings?.length) throw new Error('The cloud match has no innings to resume.');
  if (!xis?.length) throw new Error('The cloud match has no playing XI.');

  const playerIds = Array.from(new Set(xis.map(row => row.player_id)));
  const { data: players, error: playersError } = await client.from('players')
    .select('id, display_name, batting_hand, bowling_style')
    .in('id', playerIds);
  if (playersError) throw playersError;

  const db = await getDb();
  const teamRows = await db.getAllAsync<{ id: string; cloud_id: string }>(
    'SELECT id, cloud_id FROM teams WHERE cloud_id IN (?, ?)',
    match.team_a_id,
    match.team_b_id,
  );
  const teamId = new Map(teamRows.map(row => [row.cloud_id, row.id]));
  const localTeamA = teamId.get(match.team_a_id);
  const localTeamB = teamId.get(match.team_b_id);
  if (!localTeamA || !localTeamB) {
    throw new Error('Sync the tournament teams on this device before resuming scoring.');
  }
  const tournamentRow = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM tournaments WHERE cloud_id = ?',
    match.tournament_id,
  );
  const existingUsers = await db.getAllAsync<{ id: string; cloud_id: string }>(
    `SELECT id, cloud_id FROM users WHERE cloud_id IN (${playerIds.map(() => '?').join(',')})`,
    ...playerIds,
  );
  const playerId = new Map(existingUsers.map(row => [row.cloud_id, row.id]));
  const format = match.format as MatchFormat;
  const rules = { ...DEFAULT_RULES[format], ...(match.rules ?? {}) };
  const mapTeam = (cloudId: string) => {
    const value = teamId.get(cloudId);
    if (!value) throw new Error(`A cloud team is not available locally: ${cloudId}`);
    return value;
  };
  const mapPlayer = (cloudId: string | undefined | null) =>
    cloudId ? playerId.get(cloudId) ?? cloudId : undefined;
  const requirePlayer = (cloudId: string | undefined | null) => {
    const value = mapPlayer(cloudId);
    if (!value) throw new Error('A scoring event is missing a required player identity.');
    return value;
  };

  await db.withTransactionAsync(async () => {
    for (const player of players ?? []) {
      if (playerId.has(player.id)) continue;
      // Cloud identity is canonical; using it as the local ID avoids creating
      // a second identity if this cache is hydrated before roster sync.
      await db.runAsync(
        `INSERT OR IGNORE INTO users (
          id, name, role, batting_hand, bowling_style, created_at,
          cloud_id, sync_status, updated_at
        ) VALUES (?, ?, 'AR', ?, ?, ?, ?, 'SYNCED', ?)`,
        player.id, player.display_name, player.batting_hand ?? null,
        player.bowling_style ?? null, Date.now(), player.id, Date.now(),
      );
      playerId.set(player.id, player.id);
    }

    await db.runAsync(
      `INSERT OR REPLACE INTO matches (
        id, tournament_id, format, rules_json, team_a_id, team_b_id, venue,
        scheduled_at, toss_winner_team_id, toss_choice, status, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      match.id, tournamentRow?.id ?? null, format, JSON.stringify(rules),
      localTeamA, localTeamB, match.venue ?? null,
      match.scheduled_at ? Date.parse(match.scheduled_at) : null,
      match.toss_winner_team_id ? mapTeam(match.toss_winner_team_id) : null,
      match.toss_choice ?? null, match.status,
      match.result ? JSON.stringify(match.result) : null, Date.now(),
    );

    await db.runAsync('DELETE FROM match_xis WHERE match_id = ?', matchId);
    for (const xi of xis) {
      await db.runAsync(
        `INSERT INTO match_xis (
          match_id, team_id, user_id, batting_order, is_captain, is_keeper
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        matchId, mapTeam(xi.team_id), requirePlayer(xi.player_id), xi.batting_order,
        Number(xi.is_captain), Number(xi.is_keeper),
      );
    }

    // Replace the derived cache as one transaction so a failed hydration never
    // leaves a partially resumable innings.
    await db.runAsync('DELETE FROM scoring_sessions WHERE match_id = ?', matchId);
    const previousInnings = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM innings WHERE match_id = ?', matchId,
    );
    for (const row of previousInnings) {
      await db.runAsync('DELETE FROM balls WHERE innings_id = ?', row.id);
      await db.runAsync('DELETE FROM score_adjustments WHERE innings_id = ?', row.id);
      await db.runAsync('DELETE FROM batter_retirements WHERE innings_id = ?', row.id);
    }
    await db.runAsync('DELETE FROM innings WHERE match_id = ?', matchId);
    for (const item of innings) {
      await db.runAsync(
        `INSERT INTO innings (
          id, match_id, sequence, batting_team_id, bowling_team_id, total_runs,
          total_wickets, total_balls, is_closed, is_follow_on, target
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id, matchId, item.sequence, mapTeam(item.batting_team_id),
        mapTeam(item.bowling_team_id), item.total_runs, item.total_wickets,
        item.total_balls, Number(item.status === 'COMPLETED'),
        Number(item.is_follow_on), item.target ?? null,
      );
    }

    for (const event of events ?? []) {
      const payload = event.payload ?? {};
      const inningsId = String(payload.innings_id ?? '');
      if (!inningsId) continue;
      const createdAt = Date.parse(event.created_at) + Number(event.sequence);
      if (event.kind === 'BALL_RECORDED') {
        await db.runAsync(
          `INSERT OR IGNORE INTO balls (
            id, innings_id, over_no, ball_in_over, legal_ball_in_over, striker_id,
            non_striker_id, bowler_id, runs_bat, runs_extra, extra_kind, is_legal,
            is_wicket, dismissal_kind, out_player_id, fielder_id,
            assistant_fielder_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          event.id, inningsId, Number(payload.over_no ?? 0),
          Number(payload.ball_in_over ?? 0), Number(payload.legal_ball_in_over ?? 0),
          requirePlayer(payload.striker_id as string), requirePlayer(payload.non_striker_id as string),
          requirePlayer(payload.bowler_id as string), Number(payload.runs_bat ?? 0),
          Number(payload.runs_extra ?? 0), payload.extra_kind ?? null,
          Number(Boolean(payload.is_legal)), Number(Boolean(payload.is_wicket)),
          payload.dismissal_kind ?? null, mapPlayer(payload.out_player_id as string) ?? null,
          mapPlayer(payload.fielder_id as string) ?? null,
          mapPlayer(payload.assistant_fielder_id as string) ?? null,
          createdAt,
        );
      } else if (event.kind === 'SCORE_ADJUSTED') {
        await db.runAsync(
          `INSERT OR IGNORE INTO score_adjustments(id, innings_id, kind, runs, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          event.id, inningsId, payload.kind, Number(payload.runs ?? 0),
          payload.note ?? null, createdAt,
        );
      } else if (event.kind === 'BATTER_RETIRED') {
        await db.runAsync(
          `INSERT OR IGNORE INTO batter_retirements(id, innings_id, player_id, kind, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          event.id, inningsId, requirePlayer(payload.player_id as string), payload.kind, createdAt,
        );
      }
    }
  });
}
