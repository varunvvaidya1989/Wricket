import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeE164Phone } from './phone';

export const PHONE_OTP_RESEND_SECONDS = 60;

export function phoneOtpNumber(value: string): string {
  const phone = normalizeE164Phone(value);
  if (!phone || !/^\+91[6-9]\d{9}$/.test(phone)) throw new Error('Enter a valid Indian mobile number with country code +91.');
  return phone;
}

export async function requestPhoneOtp(client: SupabaseClient, value: string): Promise<void> {
  const phone = phoneOtpNumber(value);
  const { error } = await client.auth.signInWithOtp({ phone, options: { channel: 'sms', shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyPhoneOtp(client: SupabaseClient, value: string, token: string): Promise<void> {
  const phone = phoneOtpNumber(value);
  if (!/^\d{6}$/.test(token.trim())) throw new Error('Enter the six-digit SMS code.');
  const { error } = await client.auth.verifyOtp({ phone, token: token.trim(), type: 'sms' });
  if (error) throw error;
}
