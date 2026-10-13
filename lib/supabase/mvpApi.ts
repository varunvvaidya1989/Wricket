import { readIdChunks, readPages } from './readPages';
import { getSupabaseClient } from './client';
import { eligibleCompletedMatch } from '@/lib/wricket/presentation/completedStatistics';
import { aggregateTournamentLeaderboard, type LeaderboardRow, type MvpResultRecord } from '@/lib/wricket/presentation/tournamentLeaderboard';

export type CloudTournamentMvpRow = LeaderboardRow;

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
    const client = getSupabaseClient();
    const matches = await readPages((start, end) => client.from('matches')
      .select('id, team_a_id, team_b_id, status, result, scheduled_at, created_at')
      .eq('tournament_id', tournamentId).eq('status', 'COMPLETED').order('id').range(start, end));
    const eligible = matches.filter(eligibleCompletedMatch);
    const matchIds = eligible.map(match => match.id);
    if (!matchIds.length) return [];
    const teamIds = [...new Set(eligible.flatMap(match => [match.team_a_id, match.team_b_id]))];
    const teams = await readIdChunks(teamIds, chunk => readPages((start, end) => client.from('teams')
      .select('id, name').in('id', chunk).order('id').range(start, end)));
    const results: MvpResultRecord[] = await readIdChunks(matchIds, chunk => readPages((start, end) => client.from('match_mvp_results')
      .select('*, players(display_name), teams(name)')
      .in('match_id', chunk).eq('algorithm_version', 'wricket-mvp-v1')
      .order('match_id').order('player_id').range(start, end)));
    return aggregateTournamentLeaderboard(results, eligible, new Map(teams.map(team => [team.id, team.name])));
  },

  async requestRecalculation(matchId: string) {
    const { data, error } = await getSupabaseClient()
      .rpc('request_match_mvp_recalculation', { p_match_id: matchId });
    if (error) throw error;
    return data;
  },
};
