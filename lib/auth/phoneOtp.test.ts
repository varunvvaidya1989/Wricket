import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { phoneOtpNumber, requestPhoneOtp, verifyPhoneOtp } from './phoneOtp';

function fixture(error: object | null = null) {
  const signInWithOtp = vi.fn(async () => ({ error }));
  const verifyOtp = vi.fn(async () => ({ error }));
  return { client: { auth: { signInWithOtp, verifyOtp } } as unknown as SupabaseClient, signInWithOtp, verifyOtp };
}
describe('Supabase phone OTP', () => {
  it('normalizes the supported Indian route and rejects other routes', () => {
    expect(phoneOtpNumber('+91 98765 43210')).toBe('+919876543210');
    for (const value of ['9876543210', '+14155552671', '+911234567890', '+91987654321']) expect(() => phoneOtpNumber(value)).toThrow();
  });
  it('requests native SMS signup/sign-in without inventing identities or passwords', async () => {
    const f = fixture(); await requestPhoneOtp(f.client, '+919876543210');
    expect(f.signInWithOtp).toHaveBeenCalledExactlyOnceWith({ phone: '+919876543210', options: { channel: 'sms', shouldCreateUser: true } });
  });
  it('only submits valid codes to the Supabase verifier', async () => {
    const f = fixture();
    await expect(verifyPhoneOtp(f.client, '+919876543210', '12345')).rejects.toThrow('six-digit');
    expect(f.verifyOtp).not.toHaveBeenCalled();
    await verifyPhoneOtp(f.client, '+919876543210', ' 123456 ');
    expect(f.verifyOtp).toHaveBeenCalledExactlyOnceWith({ phone: '+919876543210', token: '123456', type: 'sms' });
  });
  it('preserves provider rate-limit and invalid-code errors for safe UI mapping', async () => {
    const error = { code: 'over_sms_send_rate_limit' }; const f = fixture(error);
    await expect(requestPhoneOtp(f.client, '+919876543210')).rejects.toBe(error);
    await expect(verifyPhoneOtp(f.client, '+919876543210', '123456')).rejects.toBe(error);
  });
});
