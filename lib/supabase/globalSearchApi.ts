import { getSupabaseClient } from './client';

export type GlobalSearchType = 'ALL' | 'TOURNAMENT' | 'TEAM' | 'MATCH' | 'USER' | 'SCORER';

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
  async suggested(): Promise<GlobalSearchResult[]> {
    const client = getSupabaseClient();
    const [tournaments, teams] = await Promise.all([
      client.from('tournaments').select('id,name,format,location').order('created_at', { ascending: false }).limit(3),
      client.from('teams').select('id,name').order('created_at', { ascending: false }).limit(3),
    ]);
    if (tournaments.error) throw tournaments.error;
    if (teams.error) throw teams.error;
    return withRegistrationIndicators([...(tournaments.data ?? []).map(row => ({ type: 'TOURNAMENT' as const, id: row.id, title: row.name,
      subtitle: [row.format, row.location].filter(Boolean).join(' · '), metadata: {} })),
    ...(teams.data ?? []).map(row => ({ type: 'TEAM' as const, id: row.id, title: row.name, subtitle: 'Cricket team', metadata: {} }))]);
  },
  async search(query: string, type: GlobalSearchType = 'ALL'): Promise<GlobalSearchResult[]> {
    if (query.trim().length < 2) return [];
    const teamResults: GlobalSearchResult[] = [];
    if (type === 'ALL' || type === 'TEAM') {
      const pattern = query.trim().replace(/[\\%_]/g, character => `\\${character}`);
      const { data: teams, error } = await getSupabaseClient().from('teams').select('id,name')
        .ilike('name', `%${pattern}%`).order('name').limit(40);
      if (error) throw error;
      teamResults.push(...(teams ?? []).map(team => ({ type: 'TEAM' as const, id: team.id, title: team.name, subtitle: 'Cricket team', metadata: {} })));
      if (type === 'TEAM') return teamResults;
    }
    const { data, error } = await getSupabaseClient().rpc('global_search', {
      p_query: query.trim(),
      p_type: type,
      p_limit: 40,
    });
    if (error) throw error;
    return withRegistrationIndicators([...teamResults, ...(data ?? []).map((row: Record<string, unknown>) => ({
      type: String(row.entity_type) as GlobalSearchResult['type'],
      id: String(row.entity_id),
      title: String(row.title),
      subtitle: typeof row.subtitle === 'string' ? row.subtitle : '',
      imageUrl: typeof row.image_url === 'string' ? row.image_url : undefined,
      playerId: typeof row.player_id === 'string' ? row.player_id : undefined,
      occurredAt: typeof row.occurred_at === 'string' ? row.occurred_at : undefined,
      metadata: isRecord(row.metadata) ? row.metadata : {},
    }))]);
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

async function withRegistrationIndicators(results: GlobalSearchResult[]): Promise<GlobalSearchResult[]> {
  const ids = results.filter(row => row.type === 'TOURNAMENT').map(row => row.id);
  if (!ids.length) return results;
  const { data, error } = await getSupabaseClient().from('tournament_registration_settings').select('tournament_id,entry_mode,published_at,registration_open').in('tournament_id', ids);
  if (error) throw new Error(error.message);
  return results.map(row => {
    const settings = row.type === 'TOURNAMENT' ? data?.find(item => item.tournament_id === row.id && item.published_at) : undefined;
    if (!settings) return row;
    const indicator = settings.registration_open ? settings.entry_mode === 'PLAYER_POOL' ? 'Player registration open' : 'Team applications open' : 'Applications closed';
    return { ...row, subtitle: [row.subtitle, indicator].filter(Boolean).join(' · ') };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
