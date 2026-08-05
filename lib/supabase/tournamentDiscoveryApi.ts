import { getSupabaseClient } from './client';

export type TournamentMembershipReason = 'OWNER' | 'MY_TEAM' | 'TOURNAMENT_MEMBER';

export interface TournamentSearchResult {
  id: string;
  name: string;
  format: string;
  startAt: string;
  location?: string;
  logoUrl?: string;
  organizerName: string;
  teamCount: number;
  isFollowing: boolean;
  membershipReason?: TournamentMembershipReason;
}

export interface TournamentSearchPage {
  items: TournamentSearchResult[];
  nextCursor?: { name: string; id: string };
  hasMore: boolean;
}

const SEARCH_PAGE_SIZE = 20;

export const tournamentDiscoveryApi = {
  async listRelevantIds(): Promise<Set<string>> {
    const { data, error } = await getSupabaseClient().rpc('list_relevant_tournament_ids');
    if (error) throw error;
    return new Set((data ?? []).map((row: Record<string, unknown>) => String(row.tournament_id)));
  },

  async listFollowedIds(tournamentIds: string[]): Promise<Set<string>> {
    if (tournamentIds.length === 0) return new Set();
    const { data, error } = await getSupabaseClient()
      .from('tournament_follows')
      .select('tournament_id')
      .in('tournament_id', tournamentIds)
      .eq('status', 'ACTIVE');
    if (error) throw error;
    return new Set((data ?? []).map(row => row.tournament_id));
  },

  async search(query: string, cursor?: { name: string; id: string }): Promise<TournamentSearchPage> {
    if (query.trim().length < 2) return { items: [], hasMore: false };
    const { data, error } = await getSupabaseClient().rpc('search_tournaments', {
      p_query: query.trim(),
      p_cursor_name: cursor?.name ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: SEARCH_PAGE_SIZE,
    });
    if (error) throw error;
    const items = (data ?? []).map(mapTournament);
    const last = items[items.length - 1];
    return {
      items,
      hasMore: items.length === SEARCH_PAGE_SIZE,
      nextCursor: last ? { name: last.name, id: last.id } : undefined,
    };
  },

  async follow(tournamentId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('follow_tournament', { p_tournament_id: tournamentId });
    if (error) throw error;
  },

  async unfollow(tournamentId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('unfollow_tournament', { p_tournament_id: tournamentId });
    if (error) throw error;
  },
};

function mapTournament(row: Record<string, unknown>): TournamentSearchResult {
  const membershipReason = ['OWNER', 'MY_TEAM', 'TOURNAMENT_MEMBER'].includes(String(row.membership_reason))
    ? row.membership_reason as TournamentMembershipReason
    : undefined;
  return {
    id: String(row.tournament_id),
    name: String(row.tournament_name),
    format: String(row.format),
    startAt: String(row.start_at),
    location: typeof row.location === 'string' ? row.location : undefined,
    logoUrl: typeof row.logo_url === 'string' ? row.logo_url : undefined,
    organizerName: String(row.organizer_name),
    teamCount: Number(row.team_count ?? 0),
    isFollowing: Boolean(row.is_following),
    membershipReason,
  };
}
