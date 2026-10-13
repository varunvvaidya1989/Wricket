import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import appConfig from './app.config';

afterEach(() => vi.unstubAllEnvs());
const base: ExpoConfig = {
  name: 'SportStage', slug: 'sportstage', web: { output: 'server' },
  ios: { bundleIdentifier: 'com.vcreativestudio.sportstage', associatedDomains: ['applinks:sportstageapp.com'] },
  android: { package: 'com.vcreativestudio.sportstage', intentFilters: [{ action: 'VIEW' }] },
};
const context = { config: base } as ConfigContext;

describe('isolated native build identity', () => {
  it('preserves the supplied application config outside E2E', () => {
    vi.stubEnv('EXPO_PUBLIC_WRICKET_E2E', undefined);
    expect(appConfig(context)).toBe(base);
  });
  it('uses a separate app ID and scheme without claiming production links', () => {
    vi.stubEnv('EXPO_PUBLIC_WRICKET_E2E', 'true');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    const result = appConfig(context);
    expect(result.ios?.bundleIdentifier).toBe('com.vcreativestudio.sportstage.e2e');
    expect(result.android?.package).toBe('com.vcreativestudio.sportstage.e2e');
    expect(result.ios?.associatedDomains).toEqual([]);
    expect(result.android?.intentFilters).toEqual([]);
    expect(result.scheme).toBe('sportstage-e2e');
    expect(result.web).toEqual({ output: 'server' });
    expect(base.ios?.bundleIdentifier).toBe('com.vcreativestudio.sportstage');
  });
  it('refuses to compile an E2E app pointing at a hosted backend', () => {
    vi.stubEnv('EXPO_PUBLIC_WRICKET_E2E', 'true');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    expect(() => appConfig(context)).toThrow('local Supabase');
  });
});
