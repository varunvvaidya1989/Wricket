import { getSupabaseClient } from './client';

export interface ScorerSearchResult {
  scorerId?: string;
  accountId: string;
  displayName: string;
  avatarUrl?: string;
  availabilityStatus: 'AVAILABLE' | 'UNAVAILABLE';
  isAssigned: boolean;
}

export interface TournamentScorer {
  assignmentId: string;
  scorerId: string;
  accountId: string;
  displayName: string;
  avatarUrl?: string;
  availabilityStatus: 'AVAILABLE' | 'UNAVAILABLE';
  assignedAt: string;
}

export const scorerManagementApi = {
  async canScoreTournament(tournamentId: string, accountId: string): Promise<boolean> {
    const { data, error } = await getSupabaseClient().from('tournament_members')
      .select('role, status')
      .eq('tournament_id', tournamentId)
      .eq('account_id', accountId)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (error) throw error;
    return data?.role === 'OWNER' || data?.role === 'ADMIN' || data?.role === 'SCORER';
  },

  async list(tournamentId: string): Promise<TournamentScorer[]> {
    const { data, error } = await getSupabaseClient().rpc('list_tournament_scorers', {
      p_tournament_id: tournamentId,
    });
    if (error) throw error;
    return (data ?? []).map(mapAssignedScorer);
  },

  async search(tournamentId: string, query: string): Promise<ScorerSearchResult[]> {
    if (query.trim().length < 2) return [];
    const { data, error } = await getSupabaseClient().rpc('search_available_scorers', {
      p_tournament_id: tournamentId,
      p_query: query.trim(),
      p_limit: 20,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      scorerId: typeof row.scorer_id === 'string' ? row.scorer_id : undefined,
      accountId: String(row.account_id),
      displayName: String(row.display_name),
      avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : undefined,
      availabilityStatus: row.availability_status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE',
      isAssigned: Boolean(row.is_assigned),
    }));
  },

  async assign(tournamentId: string, accountId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('assign_tournament_scorer', {
      p_tournament_id: tournamentId,
      p_account_id: accountId,
    });
    if (error) throw error;
  },

  async remove(tournamentId: string, scorerId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('remove_tournament_scorer', {
      p_tournament_id: tournamentId,
      p_scorer_id: scorerId,
    });
    if (error) throw error;
  },
};

function mapAssignedScorer(row: Record<string, unknown>): TournamentScorer {
  return {
    assignmentId: String(row.assignment_id),
    scorerId: String(row.scorer_id),
    accountId: String(row.account_id),
    displayName: String(row.display_name),
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : undefined,
    availabilityStatus: row.availability_status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE',
    assignedAt: String(row.assigned_at),
  };
}
