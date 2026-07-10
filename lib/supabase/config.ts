export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export type SupabaseEnv = Record<string, string | undefined>;

const SUPABASE_URL_KEY = 'EXPO_PUBLIC_SUPABASE_URL';
const SUPABASE_PUBLISHABLE_KEY = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

export function readSupabaseConfig(env: SupabaseEnv): SupabaseConfig {
  const url = env[SUPABASE_URL_KEY]?.trim();
  const publishableKey = env[SUPABASE_PUBLISHABLE_KEY]?.trim();

  if (!url) {
    throw new Error(`${SUPABASE_URL_KEY} is required`);
  }
  if (!url.startsWith('https://')) {
    throw new Error(`${SUPABASE_URL_KEY} must be an https URL`);
  }
  if (!publishableKey) {
    throw new Error(`${SUPABASE_PUBLISHABLE_KEY} is required`);
  }
  if (!publishableKey.startsWith('sb_publishable_')) {
    throw new Error(`${SUPABASE_PUBLISHABLE_KEY} must be a publishable key`);
  }

  return { url, publishableKey };
}

export function getSupabaseConfig(): SupabaseConfig {
  return readSupabaseConfig(process.env);
}
