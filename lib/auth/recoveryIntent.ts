import { safeAuthReturnFromUrl } from './returnTo';

export function recoveryReturnFromUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return new URL(value).pathname === '/reset-password' ? safeAuthReturnFromUrl(value) : undefined;
  } catch { return undefined; }
}

// This module runs before expo-router/entry. Store no raw URL or Auth credentials.
let initialRecoveryReturnTo = recoveryReturnFromUrl(typeof window !== 'undefined' ? window.location?.href : undefined);

export function getInitialRecoveryReturnTo(): string | undefined { return initialRecoveryReturnTo; }
export function clearInitialRecoveryReturnTo(): void { initialRecoveryReturnTo = undefined; }
