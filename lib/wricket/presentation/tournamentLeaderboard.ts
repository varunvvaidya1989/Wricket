import type { TournamentMvpRow } from '@/lib/wricket/domain/mvp';

export interface MvpMatchDetail {
  matchId: string;
  teamName: string;
  opponentName: string;
  date: string;
  totalPoints: number;
  battingPoints: number;
  bowlingPoints: number;
  fieldingPoints: number;
  playerOfMatch: boolean;
}

export interface LeaderboardRow extends TournamentMvpRow {
  playerName: string;
  teamNames: readonly string[];
  matchDetails: readonly MvpMatchDetail[];
}

export interface MvpResultRecord {
  match_id: string;
  player_id: string;
  team_id: string;
  algorithm_version: string;
  batting_points: number | string;
  bowling_points: number | string;
  fielding_points: number | string;
  total_points: number | string;
  rank: number | null;
  is_player_of_match: boolean;
  is_fighter_of_match: boolean;
  batting_breakdown: Record<string, unknown> | null;
  bowling_breakdown: Record<string, unknown> | null;
  fielding_breakdown: Record<string, unknown> | null;
  players: { display_name: string } | null;
  teams: { name: string } | null;
}

export interface MvpMatchRecord {
  id: string;
  team_a_id: string;
  team_b_id: string;
  scheduled_at: string | null;
  created_at: string;
}

export type LeaderboardMetric = 'MVP' | 'Batting' | 'Bowling' | 'Fielding';
export function leaderboardValue(row: TournamentMvpRow, metric: LeaderboardMetric): number {
  return metric === 'Batting' ? row.runs : metric === 'Bowling' ? row.wickets : metric === 'Fielding' ? row.fieldingDismissals : row.totalPoints;
}

export function rankLeaderboard(rows: readonly LeaderboardRow[], metric: LeaderboardMetric): LeaderboardRow[] {
  // The existing MVP order remains the secondary order for discipline ties.
  return [...rows].filter(row => metric === 'MVP' || leaderboardValue(row, metric) > 0).sort((a, b) => leaderboardValue(b, metric) - leaderboardValue(a, metric) || a.rank - b.rank)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function aggregateTournamentLeaderboard(results: readonly MvpResultRecord[], matches: readonly MvpMatchRecord[], teamNames: ReadonlyMap<string, string>): LeaderboardRow[] {
  const byMatch = new Map(matches.map(match => [match.id, match]));
  const players = new Map<string, LeaderboardRow>();
  const seen = new Set<string>();
  for (const result of results) {
    const match = byMatch.get(result.match_id);
    const key = `${result.match_id}:${result.player_id}`;
    if (!match || result.rank === null || result.rank <= 0 || seen.has(key)) continue;
    seen.add(key);
    const row = players.get(result.player_id) ?? {
      playerId: result.player_id, playerName: result.players?.display_name ?? 'Unknown player',
      teamIds: [], teamNames: [], matchDetails: [], matchesPlayed: 0,
      battingPoints: 0, bowlingPoints: 0, fieldingPoints: 0, totalPoints: 0,
      playerOfTheMatchCount: 0, fighterOfTheMatchCount: 0, topThreeCount: 0,
      runs: 0, wickets: 0, fieldingDismissals: 0, algorithmVersions: [], rank: 0,
    };
    const teamName = result.teams?.name ?? teamNames.get(result.team_id) ?? 'Unknown team';
    if (!row.teamIds.includes(result.team_id)) {
      row.teamIds = [...row.teamIds, result.team_id];
      row.teamNames = [...row.teamNames, teamName];
    }
    row.matchesPlayed += 1;
    row.battingPoints += Number(result.batting_points);
    row.bowlingPoints += Number(result.bowling_points);
    row.fieldingPoints += Number(result.fielding_points);
    row.totalPoints += Number(result.total_points);
    row.playerOfTheMatchCount += Number(result.is_player_of_match);
    row.fighterOfTheMatchCount += Number(result.is_fighter_of_match);
    row.topThreeCount += Number(result.rank <= 3);
    row.runs += Number(result.batting_breakdown?.runs ?? 0);
    row.wickets += Number(result.bowling_breakdown?.wickets ?? 0);
    for (const key of ['catches', 'stumpings', 'directHitRunOuts', 'assistedRunOuts']) {
      row.fieldingDismissals += Number(result.fielding_breakdown?.[key] ?? 0);
    }
    if (!row.algorithmVersions.includes(result.algorithm_version)) row.algorithmVersions = [...row.algorithmVersions, result.algorithm_version];
    row.matchDetails = [...row.matchDetails, {
      matchId: match.id, teamName,
      opponentName: teamNames.get(result.team_id === match.team_a_id ? match.team_b_id : match.team_a_id) ?? 'Opponent',
      date: match.scheduled_at ?? match.created_at,
      totalPoints: Number(result.total_points), battingPoints: Number(result.batting_points),
      bowlingPoints: Number(result.bowling_points), fieldingPoints: Number(result.fielding_points),
      playerOfMatch: result.is_player_of_match,
    }].sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.matchId.localeCompare(b.matchId));
    players.set(row.playerId, row);
  }
  return [...players.values()].sort((a, b) => b.totalPoints - a.totalPoints ||
    b.playerOfTheMatchCount - a.playerOfTheMatchCount || b.topThreeCount - a.topThreeCount ||
    a.matchesPlayed - b.matchesPlayed || a.playerId.localeCompare(b.playerId))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
