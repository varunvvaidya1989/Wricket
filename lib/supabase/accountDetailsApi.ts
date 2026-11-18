import { normalizeE164Phone } from '@/lib/auth/phone';
import { validateOnboardingDetails, type OnboardingDetails } from '@/lib/auth/onboardingDetails';
import { getSupabaseClient } from './client';

export interface PrivateAccountDetails {
  contact_email: string | null;
  contact_phone: string | null;
  age: number | null;
  country_code: string | null;
  state_name: string | null;
  city: string | null;
  completed_at: string | null;
}

export const accountDetailsApi = {
  async getMine(accountId: string): Promise<PrivateAccountDetails | null> {
    const { data, error } = await getSupabaseClient().from('account_details')
      .select('contact_email,contact_phone,age,country_code,state_name,city,completed_at')
      .eq('account_id', accountId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async complete(value: OnboardingDetails): Promise<void> {
    if (Object.keys(validateOnboardingDetails(value)).length) throw new Error('Check the highlighted profile details.');
    const { error } = await getSupabaseClient().rpc('complete_my_account_details', {
      p_display_name: value.name.trim(), p_contact_email: value.email.trim(),
      p_contact_phone: normalizeE164Phone(value.phone), p_sport_codes: value.sports,
      p_primary_sport_code: value.primarySport,
      p_age: value.age.trim() ? Number(value.age) : null,
      p_country_code: value.country || null, p_state_name: value.state || null, p_city: value.city || null,
    });
    if (error) throw error;
  },
};
