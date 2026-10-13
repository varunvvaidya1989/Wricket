export function isScoringAccessError(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const error = cause as { code?: unknown; message?: unknown };
  return error.code === '42501' || (typeof error.message === 'string' && /only an assigned|scoring lease expired|belongs to another device|another scoring device/i.test(error.message));
}
