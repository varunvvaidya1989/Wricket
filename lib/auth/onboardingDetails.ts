import { normalizeE164Phone } from './phone';

export interface OnboardingDetails {
  name: string;
  email: string;
  phone: string;
  age: string;
  country: string;
  state: string;
  city: string;
  sports: string[];
  primarySport: string;
}
export type OnboardingErrors = Partial<Record<keyof OnboardingDetails, string>>;

export function validateOnboardingDetails(value: OnboardingDetails): OnboardingErrors {
  const errors: OnboardingErrors = {};
  if (value.name.trim().length < 2 || value.name.trim().length > 100) errors.name = 'Enter a name between 2 and 100 characters.';
  if (value.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) errors.email = 'Enter a valid email address.';
  if (!normalizeE164Phone(value.phone)) errors.phone = 'Enter a phone number with country code, for example +91 98765 43210.';
  if (value.age.trim() && (!/^\d{1,3}$/.test(value.age.trim()) || Number(value.age) > 120)) errors.age = 'Enter an age between 0 and 120, or leave it blank.';
  if (value.country && !/^[A-Z]{2}$/.test(value.country)) errors.country = 'Select a country.';
  if (value.state && !value.country) errors.state = 'Select a country first.';
  if (value.city && !value.state) errors.city = 'Select a state first.';
  if (!value.sports.length || !value.sports.includes(value.primarySport)) errors.sports = 'Choose at least one sport and select your primary sport.';
  return errors;
}

export function changeLocation(value: Pick<OnboardingDetails, 'country' | 'state' | 'city'>, field: 'country' | 'state' | 'city', selected: string) {
  if (field === 'country') return { country: selected, state: '', city: '' };
  if (field === 'state') return { ...value, state: selected, city: '' };
  return { ...value, city: selected };
}
