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
  const e2e = env.EXPO_PUBLIC_WRICKET_E2E === 'true';
  if (e2e && !isLocalTestEndpoint(url)) {
    throw new Error('Wricket E2E builds require a local Supabase endpoint on port 54321');
  }
  if (!url.startsWith('https://') && !e2e) {
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

function isLocalTestEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol)
      && ['127.0.0.1', 'localhost', '10.0.2.2'].includes(url.hostname)
      && url.port === '54321'
      && url.pathname === '/'
      && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function getSupabaseConfig(): SupabaseConfig {
  // Expo only inlines EXPO_PUBLIC_* values when each variable is referenced
  // statically with dot notation. Passing process.env through to computed
  // property access works in Node/tests but produces undefined in native EAS
  // bundles.
  return readSupabaseConfig({
    EXPO_PUBLIC_WRICKET_E2E: process.env.EXPO_PUBLIC_WRICKET_E2E,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
