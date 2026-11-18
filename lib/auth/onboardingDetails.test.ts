import { describe, expect, it } from 'vitest';
import { changeLocation, validateOnboardingDetails, type OnboardingDetails } from './onboardingDetails';
import { profileCities, profileCountries, profileStates } from '@/lib/profile/locations';

const valid: OnboardingDetails = { name: 'Test Player', email: 'parent@example.test', phone: '+919876543210', age: '', country: '', state: '', city: '', sports: ['CRICKET'], primarySport: 'CRICKET' };
describe('first-time profile details', () => {
  it('requires only name, contact phone/email and a selected primary sport', () => {
    expect(validateOnboardingDetails(valid)).toEqual({});
    for (const field of ['name', 'email', 'phone'] as const) expect(validateOnboardingDetails({ ...valid, [field]: '' })[field]).toBeTruthy();
    expect(validateOnboardingDetails({ ...valid, sports: [] }).sports).toBeTruthy();
    expect(validateOnboardingDetails({ ...valid, primarySport: 'TENNIS' }).sports).toBeTruthy();
  });
  it('accepts optional ages including zero but rejects negative, fractional and implausible input', () => {
    expect(validateOnboardingDetails({ ...valid, age: '0' }).age).toBeUndefined();
    for (const age of ['-1', '12.5', '121', 'abc']) expect(validateOnboardingDetails({ ...valid, age }).age).toBeTruthy();
  });
  it('clears dependent location selections when a parent changes', () => {
    const before = { country: 'IN', state: 'Maharashtra', city: 'Mumbai' };
    expect(changeLocation(before, 'country', 'US')).toEqual({ country: 'US', state: '', city: '' });
    expect(changeLocation(before, 'state', 'Gujarat')).toEqual({ country: 'IN', state: 'Gujarat', city: '' });
    expect(validateOnboardingDetails({ ...valid, city: 'Mumbai' }).city).toBeTruthy();
  });
  it('uses the external dataset to link India, Maharashtra and Mumbai', async () => {
    expect(profileCountries()).toContainEqual({ value: 'IN', label: 'India' });
    expect(profileStates('IN')).toContainEqual({ value: 'Maharashtra', label: 'Maharashtra' });
    expect(await profileCities('IN', 'Maharashtra')).toContainEqual({ value: 'Mumbai', label: 'Mumbai' });
    expect(await profileCities('US', 'Maharashtra')).toEqual([]);
  });
});
