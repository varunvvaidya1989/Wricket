import { isSportReleased, releasedSportCodes } from '@/lib/sports/platform/sportRelease';

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
    return (data ?? []).filter((row) => isSportReleased(row.code)).map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.availability_status === 'AVAILABLE' ? 'AVAILABLE' : 'COMING_SOON',
      appRoute: row.app_route ?? undefined,
    }));
  },

  async saveSports(displayName: string, sportCodes: string[], primarySportCode: string): Promise<void> {
    const allowedSportCodes = releasedSportCodes(sportCodes);
    const allowedPrimarySportCode = allowedSportCodes.includes(primarySportCode)
      ? primarySportCode
      : allowedSportCodes[0];
    if (!allowedPrimarySportCode) throw new Error('Select an available sport');
    const { error } = await getSupabaseClient().rpc('save_my_sports', {
      p_display_name: displayName.trim(),
      p_sport_codes: allowedSportCodes,
      p_primary_sport_code: allowedPrimarySportCode,
    });
    if (error) throw error;
  },

  async updateAvatar(accountId: string, localUri: string): Promise<string> {
    const client = getSupabaseClient();
    const response = await fetch(localUri);
    if (!response.ok) throw new Error('Could not read the selected profile image');
    const extension = imageExtension(localUri);
    const folder = `${accountId}/avatar`;
    const storagePath = `${folder}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await client.storage.from('profile-media').upload(
      storagePath,
      await response.arrayBuffer(),
      { contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`, cacheControl: '3600' },
    );
    if (uploadError) throw uploadError;
    const avatarUrl = client.storage.from('profile-media').getPublicUrl(storagePath).data.publicUrl;
    const { error: updateError } = await client.from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', accountId);
    if (updateError) {
      await client.storage.from('profile-media').remove([storagePath]);
      throw updateError;
    }
    const { data: files } = await client.storage.from('profile-media').list(folder, { limit: 100 });
    const previousPaths = (files ?? [])
      .map(file => `${folder}/${file.name}`)
      .filter(path => path !== storagePath);
    if (previousPaths.length) await client.storage.from('profile-media').remove(previousPaths);
    return avatarUrl;
  },
};

function imageExtension(uri: string): 'jpg' | 'png' | 'webp' {
  const value = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (value === 'png' || value === 'webp') return value;
  return 'jpg';
}
