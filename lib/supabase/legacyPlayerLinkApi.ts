import { getSupabaseClient } from './client';

export interface LegacyPlayerCandidate {
  playerId: string;
  displayName: string;
}

export interface LegacyLinkResolution {
  status: 'LINKED' | 'AUTO_LINKED' | 'VERIFIED_MATCH' | 'CANDIDATES' | 'CONTACT_CONFLICT' | 'NO_MATCH';
  playerId?: string;
  playerIds: string[];
  method?: 'EMAIL' | 'PHONE' | 'EMAIL_PHONE';
  candidates: LegacyPlayerCandidate[];
}

export const legacyPlayerLinkApi = {
  async resolve(displayName: string): Promise<LegacyLinkResolution> {
    const { data, error } = await getSupabaseClient().rpc('resolve_auction_yodha_link', { p_display_name: displayName.trim() });
    if (error) throw error;
    const value = data as any;
    return {
      status: value.status,
      playerId: value.player_id,
      playerIds: value.player_ids ?? (value.player_id ? [value.player_id] : []),
      method: value.method,
      candidates: (value.candidates ?? []).map((candidate: any) => ({ playerId: candidate.player_id, displayName: candidate.display_name })),
    };
  },

  async request(playerId: string): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('request_player_link', { p_player_id: playerId });
    if (error) throw error;
    return data as string;
  },

  async confirm(playerId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('confirm_auction_yodha_link', { p_player_id: playerId });
    if (error) throw error;
  },
};
