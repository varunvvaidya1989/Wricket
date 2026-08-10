import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './authErrors';

describe('authErrorMessage', () => {
  it('does not disclose whether an account exists for invalid credentials', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe(
      'The email or password is incorrect. Check both fields and try again.',
    );
  });

  it('provides recovery guidance for verification and rate limits', () => {
    expect(authErrorMessage({ code: 'email_not_confirmed' })).toContain('Confirm your email');
    expect(authErrorMessage({ status: 429 })).toContain('Wait a few minutes');
  });

  it('handles network failures and hides unknown internal messages', () => {
    expect(authErrorMessage(new TypeError('Network request failed'))).toContain('internet connection');
    expect(authErrorMessage({ message: 'sensitive internal detail' }, 'Please try again.')).toBe('Please try again.');
  });
});
