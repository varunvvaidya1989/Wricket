import type { User } from '@supabase/supabase-js';

import { getSupabaseClient } from './client';

export interface CloudProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  onboardingStatus: 'PROFILE_REQUIRED' | 'SPORT_REQUIRED' | 'COMPLETED';
  primarySport?: {
    id: string;
    code: string;
    name: string;
    status: 'AVAILABLE' | 'COMING_SOON' | 'HIDDEN';
    appRoute?: string;
    accessStatus: 'ACTIVE' | 'COMING_SOON' | 'SUSPENDED';
  };
}

export async function getCloudProfile(userId: string): Promise<CloudProfile | null> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id, display_name, avatar_url, onboarding_status, primary_sport_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  let primarySport: CloudProfile['primarySport'];
  if (data.primary_sport_id) {
    const [{ data: sport, error: sportError }, { data: access, error: accessError }] = await Promise.all([
      getSupabaseClient().from('sports').select('id, code, name, availability_status, app_route').eq('id', data.primary_sport_id).single(),
      getSupabaseClient().from('account_sports').select('access_status').eq('account_id', userId).eq('sport_id', data.primary_sport_id).maybeSingle(),
    ]);
    if (sportError) throw sportError;
    if (accessError) throw accessError;
    primarySport = {
      id: sport.id,
      code: sport.code,
      name: sport.name,
      status: sport.availability_status,
      appRoute: sport.app_route ?? undefined,
      accessStatus: access?.access_status ?? 'COMING_SOON',
    };
  }
  return { id: data.id, displayName: data.display_name, avatarUrl: data.avatar_url, onboardingStatus: data.onboarding_status, primarySport };
}

export async function saveCloudProfile(user: User, displayName: string): Promise<CloudProfile> {
  const cleanName = displayName.trim();
  if (!cleanName) throw new Error('Display name is required');

  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .upsert({ id: user.id, display_name: cleanName, updated_at: new Date().toISOString() })
    .select('id, display_name, avatar_url')
    .single();
  if (error) throw error;
  return { id: data.id, displayName: data.display_name, avatarUrl: data.avatar_url, onboardingStatus: 'SPORT_REQUIRED' };
}
