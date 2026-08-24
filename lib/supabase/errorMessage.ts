type SupabaseErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

/** Keeps useful Supabase failures visible while giving network errors friendly copy. */
export function supabaseErrorMessage(cause: unknown, fallback: string): string {
  const error = isErrorLike(cause) ? cause : undefined;
  const rawMessage = cleanString(error?.message)
    ?? (typeof cause === 'string' ? cleanString(cause) : undefined);

  if (
    cause instanceof TypeError
    || rawMessage?.toLowerCase().includes('failed to fetch')
    || rawMessage?.toLowerCase().includes('network request failed')
  ) {
    return 'Could not connect to SportStage. Check your internet connection and try again.';
  }

  if (rawMessage) return rawMessage;
  return cleanString(error?.details) ?? cleanString(error?.hint) ?? fallback;
}

function isErrorLike(value: unknown): value is SupabaseErrorLike {
  return typeof value === 'object' && value !== null;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean || undefined;
}
