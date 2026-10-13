import { describe, expect, it } from 'vitest';
import { localEndpoint, testEnvironment } from './environment.mjs';

describe('E2E environment isolation', () => {
  it('does not inherit a hosted application target', () => {
    const result = testEnvironment({ EXPO_PUBLIC_SUPABASE_URL: 'https://production.supabase.co' });
    expect(result.backendURL).toBe('http://127.0.0.1:54321');
  });
  it.each([
    'https://production.supabase.co', 'http://localhost.example.com:54321',
    'http://127.0.0.1:54322', 'http://user:password@localhost:54321',
    'http://localhost:54321/path', 'http://localhost:54321?host=remote',
    'http://localhost:54321#fragment', 'file:///tmp/database',
  ])('rejects unsafe runner URL %s', value => {
    expect(() => localEndpoint(value, 54321, 'backend')).toThrow();
  });
  it('rejects run IDs that could escape the manifest directory', () => {
    expect(() => testEnvironment({ WRICKET_E2E_RUN_ID: '../../production' })).toThrow('UUID');
  });
  it('requires a real configured local key for backend tests', () => {
    expect(() => testEnvironment({}, { requireBackend: true })).toThrow('publishable key');
    expect(() => testEnvironment({ WRICKET_E2E_PUBLISHABLE_KEY: 'sb_secret_invalid' }, { requireBackend: true })).toThrow();
  });
});
