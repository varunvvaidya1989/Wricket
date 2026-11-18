import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageField, StageNotice, StageText } from '@/components/sports/platform/StageUI';
import { AuthLayout, AuthLink, AuthMethods, AuthPrimaryButton, authInputStyle } from './AuthLayout';
import { normalizePhoneParts } from '@/lib/auth/phone';
import { PHONE_OTP_RESEND_SECONDS, phoneOtpNumber } from '@/lib/auth/phoneOtp';
import { authErrorMessage } from '@/lib/supabase/authErrors';

export function PhoneOtpSignIn({ task, onBack }: { task: string; onBack: () => void }) {
  const auth = useAuth();
  const [number, setNumber] = useState('');
  const [sentPhone, setSentPhone] = useState<string>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [phoneError, setPhoneError] = useState<string>();
  const [codeError, setCodeError] = useState<string>();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false);
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  const send = async () => {
    if (pending.current || Date.now() < resendAt) return;
    let phone: string;
    try { phone = phoneOtpNumber(sentPhone ?? normalizePhoneParts('+91', number) ?? ''); }
    catch { setPhoneError('Enter a valid 10-digit Indian mobile number.'); return; }
    pending.current = true; setBusy(true); setError(undefined); setPhoneError(undefined);
    // Also delay retries after a failed/ambiguous response; server limits remain authoritative.
    const until = Date.now() + PHONE_OTP_RESEND_SECONDS * 1000;
    setResendAt(until); setNow(Date.now());
    try {
      await auth.requestPhoneOtp(phone);
      setSentPhone(phone); setCode(''); setCodeError(undefined);
    } catch (cause) {
      setError(authErrorMessage(cause, 'Could not request your SMS code. Wait a minute and try again.'));
    } finally { pending.current = false; setBusy(false); }
  };
  const verify = async () => {
    if (pending.current || !sentPhone) return;
    if (!/^\d{6}$/.test(code.trim())) { setCodeError('Enter the six-digit SMS code.'); return; }
    pending.current = true; setBusy(true); setError(undefined); setCodeError(undefined);
    try { await auth.verifyPhoneOtp(sentPhone, code); }
    catch (cause) { setError(authErrorMessage(cause, 'Could not verify this code. Check the code and try again.')); }
    finally { pending.current = false; setBusy(false); }
  };

  return <AuthLayout title={sentPhone ? 'Enter your SMS code.' : 'Welcome back.'} description={sentPhone ? `We requested a code for ${sentPhone}. Enter it to continue to ${task.toLowerCase()}.` : 'Sign in or join with your mobile number.'} onBack={onBack}>
    {!sentPhone ? <AuthMethods phone onEmail={onBack} onPhone={() => undefined} disabled={busy} /> : null}
    {sentPhone ? <>
      <StageField style={{ ...authInputStyle, fontSize: 24, letterSpacing: 8, textAlign: 'center' }} label="SMS code" value={code} onChangeText={value => { setCode(value.replace(/\D/g, '').slice(0, 6)); setCodeError(undefined); setError(undefined); }} keyboardType="number-pad" autoComplete={Platform.OS === 'web' ? 'one-time-code' : 'sms-otp'} textContentType="oneTimeCode" maxLength={6} editable={!busy} error={codeError} onSubmitEditing={() => void verify()} returnKeyType="go" />
    </> : <View style={{ gap: 12 }}>
      <StageField style={authInputStyle} label="Indian mobile number (+91)" value={number} onChangeText={value => { setNumber(value); setPhoneError(undefined); setError(undefined); }} placeholder="10-digit mobile number" keyboardType="phone-pad" autoComplete="tel-national" editable={!busy} maxLength={15} error={phoneError} onSubmitEditing={() => void send()} returnKeyType="go" />
      <StageText muted style={{ fontSize: 12, lineHeight: 19 }}>We’ll send a six-digit code. No password needed.</StageText>
    </View>}
    {error ? <StageNotice danger>{error}</StageNotice> : null}
    <AuthPrimaryButton title={sentPhone ? 'Verify & continue' : seconds ? `Try again in ${seconds}s` : 'Send SMS code'} disabled={!sentPhone && seconds > 0} loading={busy} onPress={() => void (sentPhone ? verify() : send())} />
    {sentPhone ? <>
      <AuthLink title={seconds ? `Resend code in ${seconds}s` : 'Resend SMS code'} disabled={busy || seconds > 0} onPress={() => void send()} />
      <AuthLink title="Use a different phone number" disabled={busy} onPress={() => { setSentPhone(undefined); setCode(''); setError(undefined); setCodeError(undefined); }} />
      <AuthLink title="Use email instead" disabled={busy} onPress={onBack} />
    </> : <View style={{ borderTopWidth: 1, borderTopColor: '#29392d', paddingTop: 18, gap: 4 }}>
      <StageText muted style={{ fontSize: 12, lineHeight: 19 }}>Already have an email account? Use email to keep your existing teams and matches.</StageText>
    </View>}
  </AuthLayout>;
}
