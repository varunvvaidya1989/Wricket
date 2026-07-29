import type { User } from '@supabase/supabase-js';

import { getSupabaseClient } from './client';

export interface CloudProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export async function getCloudProfile(userId: string): Promise<CloudProfile | null> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, displayName: data.display_name, avatarUrl: data.avatar_url } : null;
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
  return { id: data.id, displayName: data.display_name, avatarUrl: data.avatar_url };
}
