import { describe, expect, it } from 'vitest';

import { readSupabaseConfig } from './config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('readSupabaseConfig', () => {
  it.each(['127.0.0.1', 'localhost', '10.0.2.2'])('allows %s only in explicitly isolated E2E builds', host => {
    const env = {
      EXPO_PUBLIC_SUPABASE_URL: `http://${host}:54321`,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    };
    expect(() => readSupabaseConfig(env)).toThrow('https');
    expect(readSupabaseConfig({ ...env, EXPO_PUBLIC_WRICKET_E2E: 'true' }).url).toBe(env.EXPO_PUBLIC_SUPABASE_URL);
  });

  it.each([
    'https://example.supabase.co', 'http://localhost.example.com:54321',
    'http://127.0.0.1:54322', 'http://user:pass@localhost:54321',
    'http://localhost:54321/other', 'http://localhost:54321?redirect=remote',
    'http://localhost:54321#fragment', 'not-a-url',
  ])('rejects an unsafe E2E endpoint: %s', url => {
    expect(() => readSupabaseConfig({
      EXPO_PUBLIC_WRICKET_E2E: 'true',
      EXPO_PUBLIC_SUPABASE_URL: url,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    })).toThrow('local Supabase endpoint');
  });

  it('reads client-safe Supabase public configuration', () => {
    expect(
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      }),
    ).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    });
  });

  it('rejects missing or non-https URLs', () => {
    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      }),
    ).toThrow('EXPO_PUBLIC_SUPABASE_URL is required');

    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'http://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      }),
    ).toThrow('EXPO_PUBLIC_SUPABASE_URL must be an https URL');
  });

  it('rejects non-publishable keys', () => {
    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example',
      }),
    ).toThrow('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key');
  });

  it('uses Expo-compatible static environment references in the app bundle', () => {
    const source = readFileSync(resolve(__dirname, 'config.ts'), 'utf8');
    expect(source).toContain('process.env.EXPO_PUBLIC_SUPABASE_URL');
    expect(source).toContain('process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    expect(source).not.toContain('readSupabaseConfig(process.env)');
  });
});
