import { afterEach, describe, expect, it, vi } from 'vitest';
import { recoveryReturnFromUrl } from './recoveryIntent';

describe('recovery destination at app startup', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('retains the validated destination after Router removes query parameters and clears it after use', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { location: { href: 'https://sportstageapp.expo.app/reset-password?returnTo=%2Fbadminton%2Fmatch%2Fnew#access_token=private&refresh_token=private' } });
    const store = await import('./recoveryIntent');
    window.location.href = 'https://sportstageapp.expo.app/reset-password';
    expect(store.getInitialRecoveryReturnTo()).toBe('/badminton/match/new');
    store.clearInitialRecoveryReturnTo();
    expect(store.getInitialRecoveryReturnTo()).toBeUndefined();
  });
  it('starts without a browser URL on native/SSR', async () => {
    vi.resetModules(); vi.stubGlobal('window', undefined);
    const store = await import('./recoveryIntent');
    expect(store.getInitialRecoveryReturnTo()).toBeUndefined();
  });
  it.each([
    'https://sportstageapp.expo.app/auth?returnTo=%2Fprofile',
    'https://sportstageapp.expo.app/reset-password?returnTo=https%3A%2F%2Fexample.com',
    'invalid-url',
  ])('does not inherit another page or an unsafe destination: %s', url => {
    expect(recoveryReturnFromUrl(url)).toBeUndefined();
  });
});
