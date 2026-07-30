import { getSupabaseClient } from './client';
import type { TournamentMvpRow } from '@/lib/wricket/domain/mvp';

export interface CloudTournamentMvpRow extends TournamentMvpRow {
  playerName: string;
  teamNames: readonly string[];
}

export const mvpApi = {
  async getMatch(matchId: string) {
    const { data, error } = await getSupabaseClient()
      .from('match_mvp_results')
      .select('*, players(display_name), teams(name, short_name)')
      .eq('match_id', matchId)
      .order('deterministic_order');
    if (error) throw error;
    return data;
  },

  async getAwards(matchId: string) {
    const { data, error } = await getSupabaseClient()
      .from('match_mvp_results')
      .select('*, players(display_name), teams(name, short_name)')
      .eq('match_id', matchId)
      .or('is_player_of_match.eq.true,is_fighter_of_match.eq.true')
      .order('deterministic_order');
    if (error) throw error;
    return data;
  },

  async getTournamentLeaderboard(tournamentId: string, from = 0, pageSize = 50) {
    const { data: matches, error: matchError } = await getSupabaseClient()
      .from('matches').select('id').eq('tournament_id', tournamentId)
      .eq('status', 'COMPLETED');
    if (matchError) throw matchError;
    const ids = (matches ?? []).map(match => match.id);
    if (!ids.length) return [];
    const { data, error } = await getSupabaseClient()
      .from('match_mvp_results').select('*').in('match_id', ids)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    return data;
  },

  async getCompleteTournamentLeaderboard(tournamentId: string): Promise<CloudTournamentMvpRow[]> {
    const { data: matches, error: matchError } = await getSupabaseClient()
      .from('matches').select('id').eq('tournament_id', tournamentId)
      .eq('status', 'COMPLETED');
    if (matchError) throw matchError;
    const matchIds = (matches ?? []).map(match => match.id);
    if (!matchIds.length) return [];

    const results: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await getSupabaseClient()
        .from('match_mvp_results')
        .select('*, players(display_name), teams(short_name)')
        .in('match_id', matchIds)
        .eq('algorithm_version', 'wricket-mvp-v1')
        .range(from, from + 999);
      if (error) throw error;
      results.push(...data);
      if (data.length < 1000) break;
    }

    const aggregated = new Map<string, {
      playerId: string;
      playerName: string;
      teamIds: Set<string>;
      teamNames: Set<string>;
      matchIds: Set<string>;
      battingPoints: number;
      bowlingPoints: number;
      fieldingPoints: number;
      totalPoints: number;
      playerOfTheMatchCount: number;
      fighterOfTheMatchCount: number;
      topThreeFinishes: number;
      algorithmVersions: Set<string>;
    }>();
    for (const result of results) {
      const current = aggregated.get(result.player_id) ?? {
        playerId: result.player_id,
        playerName: result.players?.display_name ?? 'Unknown player',
        teamIds: new Set<string>(),
        teamNames: new Set<string>(),
        matchIds: new Set<string>(),
        battingPoints: 0,
        bowlingPoints: 0,
        fieldingPoints: 0,
        totalPoints: 0,
        playerOfTheMatchCount: 0,
        fighterOfTheMatchCount: 0,
        topThreeFinishes: 0,
        algorithmVersions: new Set<string>(),
      };
      current.teamIds.add(result.team_id);
      if (result.teams?.short_name) current.teamNames.add(result.teams.short_name);
      current.matchIds.add(result.match_id);
      current.battingPoints += Number(result.batting_points);
      current.bowlingPoints += Number(result.bowling_points);
      current.fieldingPoints += Number(result.fielding_points);
      current.totalPoints += Number(result.total_points);
      current.playerOfTheMatchCount += Number(Boolean(result.is_player_of_match));
      current.fighterOfTheMatchCount += Number(Boolean(result.is_fighter_of_match));
      current.topThreeFinishes += Number(Number(result.rank) <= 3);
      current.algorithmVersions.add(result.algorithm_version);
      aggregated.set(result.player_id, current);
    }

    return [...aggregated.values()]
      .sort((a, b) =>
        b.totalPoints - a.totalPoints ||
        b.playerOfTheMatchCount - a.playerOfTheMatchCount ||
        b.topThreeFinishes - a.topThreeFinishes ||
        a.matchIds.size - b.matchIds.size ||
        a.playerId.localeCompare(b.playerId))
      .map((row, index) => ({
        playerId: row.playerId,
        playerName: row.playerName,
        teamIds: [...row.teamIds],
        teamNames: [...row.teamNames],
        matchesPlayed: row.matchIds.size,
        battingPoints: row.battingPoints,
        bowlingPoints: row.bowlingPoints,
        fieldingPoints: row.fieldingPoints,
        totalPoints: row.totalPoints,
        playerOfTheMatchCount: row.playerOfTheMatchCount,
        fighterOfTheMatchCount: row.fighterOfTheMatchCount,
        topThreeCount: row.topThreeFinishes,
        wickets: 0,
        runs: 0,
        fieldingDismissals: 0,
        algorithmVersions: [...row.algorithmVersions],
        rank: index + 1,
      }));
  },

  async requestRecalculation(matchId: string) {
    const { data, error } = await getSupabaseClient()
      .rpc('request_match_mvp_recalculation', { p_match_id: matchId });
    if (error) throw error;
    return data;
  },
};
