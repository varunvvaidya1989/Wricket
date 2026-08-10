import type { User } from '@supabase/supabase-js';

import { getSupabaseClient } from './client';

export interface CloudSport {
  id: string;
  code: string;
  name: string;
  status: 'AVAILABLE' | 'COMING_SOON' | 'HIDDEN';
  appRoute?: string;
  accessStatus: 'ACTIVE' | 'COMING_SOON' | 'SUSPENDED';
  isPrimary: boolean;
}

export interface CloudProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  onboardingStatus: 'PROFILE_REQUIRED' | 'SPORT_REQUIRED' | 'COMPLETED';
  primarySport?: CloudSport;
  connectedSports: CloudSport[];
}

export async function getCloudProfile(userId: string): Promise<CloudProfile | null> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id, display_name, avatar_url, onboarding_status, primary_sport_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: relationships, error: relationshipError } = await getSupabaseClient()
    .from('account_sports')
    .select('sport_id, access_status, is_primary')
    .eq('account_id', userId);
  if (relationshipError) throw relationshipError;
  const sportIds = (relationships ?? []).map(item => item.sport_id);
  const { data: sports, error: sportError } = sportIds.length
    ? await getSupabaseClient().from('sports').select('id, code, name, availability_status, app_route, display_order').in('id', sportIds).order('display_order')
    : { data: [], error: null };
  if (sportError) throw sportError;
  const relationshipBySport = new Map((relationships ?? []).map(item => [item.sport_id, item]));
  const connectedSports: CloudSport[] = (sports ?? []).map(sport => {
    const relationship = relationshipBySport.get(sport.id)!;
    return {
      id: sport.id,
      code: sport.code,
      name: sport.name,
      status: sport.availability_status,
      appRoute: sport.app_route ?? undefined,
      accessStatus: relationship.access_status,
      isPrimary: relationship.is_primary || sport.id === data.primary_sport_id,
    };
  });
  const primarySport = connectedSports.find(sport => sport.id === data.primary_sport_id || sport.isPrimary);
  return { id: data.id, displayName: data.display_name, avatarUrl: data.avatar_url, onboardingStatus: data.onboarding_status, primarySport, connectedSports };
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
  return { id: data.id, displayName: data.display_name, avatarUrl: data.avatar_url, onboardingStatus: 'SPORT_REQUIRED', connectedSports: [] };
}
