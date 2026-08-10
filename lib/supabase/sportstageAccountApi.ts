import { getSupabaseClient } from './client';

export interface SportOption {
  id: string;
  code: string;
  name: string;
  status: 'AVAILABLE' | 'COMING_SOON';
  appRoute?: string;
}

export const sportstageAccountApi = {
  async listSports(): Promise<SportOption[]> {
    const { data, error } = await getSupabaseClient()
      .from('sports')
      .select('id, code, name, availability_status, app_route')
      .neq('availability_status', 'HIDDEN')
      .order('display_order');
    if (error) throw error;
    return (data ?? []).map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.availability_status === 'AVAILABLE' ? 'AVAILABLE' : 'COMING_SOON',
      appRoute: row.app_route ?? undefined,
    }));
  },

  async saveSports(displayName: string, sportCodes: string[], primarySportCode: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('save_my_sports', {
      p_display_name: displayName.trim(),
      p_sport_codes: sportCodes,
      p_primary_sport_code: primarySportCode,
    });
    if (error) throw error;
  },
};
