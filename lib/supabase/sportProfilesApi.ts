import { getSupabaseClient } from './client';

export type SportProfileStatus = 'ACTIVE' | 'ARCHIVED' | 'INCOMPLETE';

export interface SportProfile {
  id: string;
  accountId: string;
  sportId: string;
  displayName: string;
  avatarUrl?: string;
  status: SportProfileStatus;
}

const fields = 'id, account_id, sport_id, display_name, avatar_url, status';

export const sportProfilesApi = {
  async listMine(accountId: string): Promise<SportProfile[]> {
    const { data, error } = await getSupabaseClient().from('sport_profiles')
      .select(fields).eq('account_id', accountId).neq('status', 'ARCHIVED');
    if (error) throw error;
    return (data ?? []).map(mapSportProfile);
  },

  async saveMine(accountId: string, sportId: string, input: { displayName: string; avatarUrl?: string }): Promise<SportProfile> {
    const { data, error } = await getSupabaseClient().from('sport_profiles').upsert({
      account_id: accountId,
      sport_id: sportId,
      display_name: input.displayName.trim(),
      avatar_url: input.avatarUrl ?? null,
      status: 'ACTIVE',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id,sport_id' }).select(fields).single();
    if (error) throw error;
    return mapSportProfile(data);
  },
};

function mapSportProfile(row: Record<string, unknown>): SportProfile {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    sportId: String(row.sport_id),
    displayName: String(row.display_name),
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : undefined,
    status: String(row.status) as SportProfileStatus,
  };
}
