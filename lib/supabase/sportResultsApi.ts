import { isSportReleased } from '@/lib/sports/platform/sportRelease';

import { getSupabaseClient } from './client';

export interface SportStanding {
  entryId: string; rank: number; played: number; won: number; drawn: number;
  lost: number; points: number; rubbersWon: number; rubbersLost: number;
}

export interface MySportStatistic {
  sportCode: string; matchesPlayed: number; wins: number; losses: number;
}

export interface CompetitionPlayerStatistic {
  sportProfileId: string; displayName: string; matchesPlayed: number; wins: number; losses: number;
}

export const sportResultsApi = {
  async listStandings(competitionId: string): Promise<SportStanding[]> {
    const { data, error } = await getSupabaseClient().from('sport_competition_standings')
      .select('entry_id, rank, played, won, drawn, lost, points, rubbers_won, rubbers_lost')
      .eq('competition_id', competitionId).order('rank');
    if (error) throw error;
    return (data ?? []).map(row => ({ entryId: String(row.entry_id), rank: Number(row.rank),
      played: Number(row.played), won: Number(row.won), drawn: Number(row.drawn),
      lost: Number(row.lost), points: Number(row.points), rubbersWon: Number(row.rubbers_won),
      rubbersLost: Number(row.rubbers_lost) }));
  },
  async listCompetitionPlayerStatistics(competitionId: string): Promise<CompetitionPlayerStatistic[]> {
    const { data, error } = await getSupabaseClient().from('sport_player_statistics')
      .select('sport_profile_id, display_name_snapshot, matches_played, wins, losses')
      .eq('competition_id', competitionId);
    if (error) throw error;
    const aggregated = new Map<string, CompetitionPlayerStatistic>();
    for (const row of data ?? []) {
      const id = String(row.sport_profile_id);
      const current = aggregated.get(id) ?? {
        sportProfileId: id, displayName: String(row.display_name_snapshot), matchesPlayed: 0, wins: 0, losses: 0,
      };
      current.matchesPlayed += Number(row.matches_played);
      current.wins += Number(row.wins);
      current.losses += Number(row.losses);
      aggregated.set(id, current);
    }
    return [...aggregated.values()].sort((a, b) => b.wins - a.wins || b.matchesPlayed - a.matchesPlayed || a.displayName.localeCompare(b.displayName));
  },
  async rebuild(competitionId: string): Promise<void> {
    const client = getSupabaseClient();
    const standings = await client.rpc('rebuild_sport_competition_projections', { p_competition_id: competitionId });
    if (standings.error) throw standings.error;
    const statistics = await client.rpc('rebuild_sport_player_statistics', { p_competition_id: competitionId });
    if (statistics.error) throw statistics.error;
  },
  async correct(scoringMatchId: string, winnerEntryId: string, reason: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('correct_sport_scoring_result', {
      p_scoring_match_id: scoringMatchId, p_winner_entry_id: winnerEntryId, p_reason: reason.trim(),
    });
    if (error) throw error;
  },
  async listMine(): Promise<MySportStatistic[]> {
    const { data, error } = await getSupabaseClient().rpc('list_my_sport_statistics');
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      sportCode: String(row.sport_code),
      matchesPlayed: Number(row.matches_played),
      wins: Number(row.wins),
      losses: Number(row.losses),
    })).filter((stat: MySportStatistic) => isSportReleased(stat.sportCode));
  },
};
