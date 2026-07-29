import { describe, expect, it } from 'vitest';

import { readSupabaseConfig } from './config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('readSupabaseConfig', () => {
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
