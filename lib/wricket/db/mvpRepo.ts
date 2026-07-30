import { getDb } from './client';
import type { MatchMvpResult, PlayerMvpResult } from '../domain/mvp';

export async function replaceMatchMvp(result: MatchMvpResult): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO match_mvp_calculations(match_id, algorithm_version, status, calculated_at, error)
       VALUES (?, ?, 'CALCULATING', NULL, NULL)
       ON CONFLICT(match_id) DO UPDATE SET algorithm_version=excluded.algorithm_version,
       status='CALCULATING', calculated_at=NULL, error=NULL`,
      result.matchId, result.algorithmVersion,
    );
    await db.runAsync(
      'DELETE FROM match_mvp_results WHERE match_id = ? AND algorithm_version = ?',
      result.matchId, result.algorithmVersion,
    );
    for (const row of result.rankings) {
      await db.runAsync(
        `INSERT INTO match_mvp_results (
          match_id, player_id, team_id, algorithm_version, batting_points, bowling_points,
          fielding_points, total_points, rank, deterministic_order, is_player_of_match,
          is_fighter_of_match, batting_breakdown_json, bowling_breakdown_json,
          fielding_breakdown_json, explanations_json, calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.matchId, row.playerId, row.teamId, row.algorithmVersion, row.battingPoints,
        row.bowlingPoints, row.fieldingPoints, row.totalPoints, row.rank, row.order,
        Number(row.isPlayerOfTheMatch), Number(row.isFighterOfTheMatch),
        JSON.stringify(row.battingBreakdown), JSON.stringify(row.bowlingBreakdown),
        JSON.stringify(row.fieldingBreakdown), JSON.stringify(row.explanations), row.calculatedAt,
      );
    }
    await db.runAsync(
      `UPDATE match_mvp_calculations SET status='COMPLETED', calculated_at=?, error=NULL
       WHERE match_id=?`,
      result.calculatedAt, result.matchId,
    );
  });
}

export async function recordMatchMvpFailure(matchId: string, version: string, error: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO match_mvp_calculations(match_id, algorithm_version, status, error)
     VALUES (?, ?, 'FAILED', ?)
     ON CONFLICT(match_id) DO UPDATE SET algorithm_version=excluded.algorithm_version,
     status='FAILED', error=excluded.error`,
    matchId, version, error instanceof Error ? error.message : String(error),
  );
}

export async function getStoredMatchMvp(matchId: string, version?: string): Promise<MatchMvpResult | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM match_mvp_results WHERE match_id = ?
     ${version ? 'AND algorithm_version = ?' : ''}
     ORDER BY calculated_at DESC, deterministic_order ASC`,
    ...(version ? [matchId, version] : [matchId]),
  );
  if (!rows.length) return null;
  const selectedVersion = version ?? rows[0].algorithm_version;
  const selected = rows.filter(row => row.algorithm_version === selectedVersion);
  return {
    matchId, algorithmVersion: selectedVersion, calculatedAt: selected[0].calculated_at,
    playerOfTheMatchId: selected.find(row => row.is_player_of_match)?.player_id,
    fighterOfTheMatchId: selected.find(row => row.is_fighter_of_match)?.player_id,
    rankings: selected.map(rowToResult),
  };
}

export async function listStoredTournamentMvpMatches(
  matchIds: readonly string[], version?: string,
): Promise<MatchMvpResult[]> {
  const values: MatchMvpResult[] = [];
  for (const id of matchIds) {
    const result = await getStoredMatchMvp(id, version);
    if (result) values.push(result);
  }
  return values;
}

function rowToResult(row: any): PlayerMvpResult {
  return {
    matchId: row.match_id, playerId: row.player_id, teamId: row.team_id,
    algorithmVersion: row.algorithm_version, battingPoints: row.batting_points,
    bowlingPoints: row.bowling_points, fieldingPoints: row.fielding_points,
    totalPoints: row.total_points, rank: row.rank, order: row.deterministic_order,
    isPlayerOfTheMatch: !!row.is_player_of_match, isFighterOfTheMatch: !!row.is_fighter_of_match,
    battingBreakdown: JSON.parse(row.batting_breakdown_json),
    bowlingBreakdown: JSON.parse(row.bowling_breakdown_json),
    fieldingBreakdown: JSON.parse(row.fielding_breakdown_json),
    explanations: JSON.parse(row.explanations_json), calculatedAt: row.calculated_at,
  };
}
