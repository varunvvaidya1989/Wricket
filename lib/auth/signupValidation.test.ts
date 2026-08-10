import { describe, expect, it } from 'vitest';

import { validateSignup } from './signupValidation';

describe('create account validation', () => {
  it('reports every required field on an empty submission', () => {
    expect(validateSignup({
      displayName: '',
      email: '',
      phoneE164: null,
      password: '',
      confirmPassword: '',
      selectedSportCodes: [],
      primarySportCode: '',
    })).toEqual({
      displayName: 'Enter at least two characters.',
      email: 'Email is required.',
      phone: 'Enter a valid country code and mobile number.',
      password: 'Password is required.',
      confirmPassword: 'Confirm your password.',
      sports: 'Select at least one sport and mark a primary sport.',
    });
  });

  it('accepts a complete valid account form', () => {
    expect(validateSignup({
      displayName: 'Asha Rao',
      email: 'asha@example.com',
      phoneE164: '+919876543210',
      password: 'secure-pass',
      confirmPassword: 'secure-pass',
      selectedSportCodes: ['CRICKET'],
      primarySportCode: 'CRICKET',
    })).toEqual({});
  });
});
