import { getSupabaseClient } from './client';

export type GlobalSearchType = 'ALL' | 'TOURNAMENT' | 'MATCH' | 'USER' | 'SCORER';

export interface GlobalSearchResult {
  type: Exclude<GlobalSearchType, 'ALL'>;
  id: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  playerId?: string;
  occurredAt?: string;
  metadata: Record<string, unknown>;
}

export interface SearchProfile {
  accountId: string;
  displayName: string;
  avatarUrl?: string;
  isScorer: boolean;
  availabilityStatus?: string;
  playerId?: string;
  playerRole?: string;
}

export const globalSearchApi = {
  async search(query: string, type: GlobalSearchType = 'ALL'): Promise<GlobalSearchResult[]> {
    if (query.trim().length < 2) return [];
    const { data, error } = await getSupabaseClient().rpc('global_search', {
      p_query: query.trim(),
      p_type: type,
      p_limit: 40,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      type: String(row.entity_type) as GlobalSearchResult['type'],
      id: String(row.entity_id),
      title: String(row.title),
      subtitle: typeof row.subtitle === 'string' ? row.subtitle : '',
      imageUrl: typeof row.image_url === 'string' ? row.image_url : undefined,
      playerId: typeof row.player_id === 'string' ? row.player_id : undefined,
      occurredAt: typeof row.occurred_at === 'string' ? row.occurred_at : undefined,
      metadata: isRecord(row.metadata) ? row.metadata : {},
    }));
  },

  async getProfile(profileId: string): Promise<SearchProfile | undefined> {
    const { data, error } = await getSupabaseClient().rpc('get_search_profile', { p_profile_id: profileId });
    if (error) throw error;
    const row = data?.[0] as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      accountId: String(row.account_id),
      displayName: String(row.display_name),
      avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : undefined,
      isScorer: Boolean(row.is_scorer),
      availabilityStatus: typeof row.availability_status === 'string' ? row.availability_status : undefined,
      playerId: typeof row.player_id === 'string' ? row.player_id : undefined,
      playerRole: typeof row.player_role === 'string' ? row.player_role : undefined,
    };
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
