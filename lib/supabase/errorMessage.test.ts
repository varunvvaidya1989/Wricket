import { describe, expect, it } from 'vitest';

import { supabaseErrorMessage } from './errorMessage';

describe('supabaseErrorMessage', () => {
  it('reads messages from structured Supabase errors', () => {
    expect(supabaseErrorMessage({ message: 'Sport profile is unavailable.' }, 'Fallback')).toBe(
      'Sport profile is unavailable.',
    );
  });

  it('turns network failures into actionable copy', () => {
    expect(supabaseErrorMessage({ message: 'Network request failed' }, 'Fallback')).toContain(
      'Check your internet connection',
    );
  });

  it('uses the contextual fallback when no error detail exists', () => {
    expect(supabaseErrorMessage({}, 'Could not load your sport profile.')).toBe(
      'Could not load your sport profile.',
    );
  });
});
