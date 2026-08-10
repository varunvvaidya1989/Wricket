export type SignupField = 'displayName' | 'email' | 'phone' | 'password' | 'confirmPassword' | 'sports';

interface SignupValues {
  displayName: string;
  email: string;
  phoneE164: string | null;
  password: string;
  confirmPassword: string;
  selectedSportCodes: string[];
  primarySportCode: string;
}

export function validateSignup(values: SignupValues): Partial<Record<SignupField, string>> {
  const errors: Partial<Record<SignupField, string>> = {};
  if (values.displayName.trim().length < 2) errors.displayName = 'Enter at least two characters.';
  if (!values.email.trim()) errors.email = 'Email is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Enter a valid email address.';
  if (!values.phoneE164) errors.phone = 'Enter a valid country code and mobile number.';
  if (!values.password) errors.password = 'Password is required.';
  else if (values.password.length < 8) errors.password = 'Use at least eight characters.';
  if (!values.confirmPassword) errors.confirmPassword = 'Confirm your password.';
  else if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  if (!values.selectedSportCodes.length || !values.selectedSportCodes.includes(values.primarySportCode)) {
    errors.sports = 'Select at least one sport and mark a primary sport.';
  }
  return errors;
}
