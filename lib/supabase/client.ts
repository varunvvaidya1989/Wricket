import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { getSupabaseConfig } from './config';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const config = getSupabaseConfig();
  supabaseClient = createClient(config.url, config.publishableKey, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });

  return supabaseClient;
}

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', state => {
    if (!supabaseClient) return;
    if (state === 'active') supabaseClient.auth.startAutoRefresh();
    else supabaseClient.auth.stopAutoRefresh();
  });
}

export function resetSupabaseClientForTests(): void {
  supabaseClient = null;
}
