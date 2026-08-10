import { getSupabaseClient } from './client';

export type CricketRole = 'BAT' | 'BOWL' | 'AR' | 'WK';

export interface PlayerProfile {
  id: string;
  displayName: string;
  role: CricketRole;
  battingHand?: string;
  bowlingStyle?: string;
  imageUrl?: string;
}

const fields = 'id, display_name, role, batting_hand, bowling_style, image_url';

function map(row: any): PlayerProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role ?? 'AR',
    battingHand: row.batting_hand ?? undefined,
    bowlingStyle: row.bowling_style ?? undefined,
    imageUrl: row.image_url ?? undefined,
  };
}

export const playerProfileApi = {
  async getMine(accountId: string): Promise<PlayerProfile | undefined> {
    const { data, error } = await getSupabaseClient().from('players')
      .select(fields)
      .eq('profile_id', accountId)
      .maybeSingle();
    if (error) throw error;
    return data ? map(data) : undefined;
  },

  async ensureMine(accountId: string, displayName: string): Promise<PlayerProfile> {
    const existing = await this.getMine(accountId);
    if (existing) return existing;
    const { error } = await getSupabaseClient().rpc('create_my_player_profile', { p_display_name: displayName.trim() });
    if (error) throw error;
    const created = await this.getMine(accountId);
    if (!created) throw new Error('Could not create player profile');
    return created;
  },

  async saveMine(accountId: string, input: Omit<PlayerProfile, 'id' | 'imageUrl'>): Promise<PlayerProfile> {
    const player = await this.ensureMine(accountId, input.displayName);
    const { data, error } = await getSupabaseClient().from('players')
      .update({
        display_name: input.displayName.trim(),
        role: input.role,
        batting_hand: input.battingHand || null,
        bowling_style: input.bowlingStyle || null,
      })
      .eq('id', player.id)
      .eq('profile_id', accountId)
      .select(fields)
      .single();
    if (error) throw error;
    return map(data);
  },
};
