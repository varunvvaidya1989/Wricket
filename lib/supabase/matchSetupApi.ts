import { getSupabaseClient } from './client';
import type { FormatRules, MatchFormat, TossChoice } from '@/lib/wricket/domain/types';

interface PlayingXIEntry {
  playerId: string;
  battingOrder: number;
  isCaptain: boolean;
  isKeeper: boolean;
}

export interface StartedMatchSetup {
  matchId: string;
  inningsId: string;
  status: 'IN_PROGRESS';
  battingTeamId: string;
  bowlingTeamId: string;
}

export const matchSetupApi = {
  async createMatch(input: {
    tournamentId: string;
    teamAId: string;
    teamBId: string;
    format: MatchFormat;
    rules?: FormatRules;
    scheduledAt?: string;
    venue?: string;
  }): Promise<string> {
    const { data: authData, error: authError } = await getSupabaseClient().auth.getUser();
    if (authError) throw authError;
    if (!authData.user) throw new Error('Sign in before creating a match');
    const { data, error } = await getSupabaseClient().from('matches').insert({
      tournament_id: input.tournamentId,
      team_a_id: input.teamAId,
      team_b_id: input.teamBId,
      format: input.format,
      status: 'SETUP',
      visibility: 'PRIVATE',
      rules: input.rules ?? {},
      created_by: authData.user.id,
      scheduled_at: input.scheduledAt ?? null,
      venue: input.venue?.trim() || null,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  },

  async updateMatchDetails(matchId: string, input: {
    scheduledAt?: string;
    venue?: string;
    rules?: FormatRules;
  }): Promise<void> {
    const { error } = await getSupabaseClient().from('matches').update({
      scheduled_at: input.scheduledAt ?? null,
      venue: input.venue?.trim() || null,
      ...(input.rules ? { rules: input.rules } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', matchId);
    if (error) throw error;
  },

  async startMatch(input: {
    matchId: string;
    teamAXI: PlayingXIEntry[];
    teamBXI: PlayingXIEntry[];
    tossWinnerTeamId: string;
    tossChoice: TossChoice;
  }): Promise<StartedMatchSetup> {
    const { data, error } = await getSupabaseClient().rpc('start_match_setup', {
      p_match_id: input.matchId,
      p_team_a_xi: input.teamAXI.map(toRow),
      p_team_b_xi: input.teamBXI.map(toRow),
      p_toss_winner_team_id: input.tossWinnerTeamId,
      p_toss_choice: input.tossChoice,
    });
    if (error) throw error;
    if (!data?.match_id || !data?.innings_id) {
      throw new Error('Server did not return the started match setup');
    }
    return {
      matchId: data.match_id,
      inningsId: data.innings_id,
      status: data.status,
      battingTeamId: data.batting_team_id,
      bowlingTeamId: data.bowling_team_id,
    };
  },
};

function toRow(entry: PlayingXIEntry) {
  return {
    player_id: entry.playerId,
    batting_order: entry.battingOrder,
    is_captain: entry.isCaptain,
    is_keeper: entry.isKeeper,
  };
}
