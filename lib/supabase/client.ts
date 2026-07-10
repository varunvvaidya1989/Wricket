import 'react-native-url-polyfill/auto';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseConfig } from './config';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const config = getSupabaseConfig();
  supabaseClient = createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return supabaseClient;
}

export function resetSupabaseClientForTests(): void {
  supabaseClient = null;
}
