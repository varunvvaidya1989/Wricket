import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Preserve app.json, including local hosting changes. Only E2E builds differ. */
export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const base = config as ExpoConfig;
  if (process.env.EXPO_PUBLIC_WRICKET_E2E !== 'true') return base;
  const endpoint = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '');
  if (!['http:', 'https:'].includes(endpoint.protocol)
    || !['127.0.0.1', 'localhost', '10.0.2.2'].includes(endpoint.hostname)
    || endpoint.port !== '54321' || endpoint.pathname !== '/'
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('E2E builds may only connect to the local Supabase test stack on port 54321.');
  }
  return {
    ...base,
    name: 'SportStage E2E',
    scheme: 'sportstage-e2e',
    ios: { ...base.ios, bundleIdentifier: 'com.vcreativestudio.sportstage.e2e', associatedDomains: [] },
    android: { ...base.android, package: 'com.vcreativestudio.sportstage.e2e', intentFilters: [] },
  };
}
