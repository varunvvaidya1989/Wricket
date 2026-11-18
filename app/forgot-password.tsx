import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageField, StageIntro, StageNotice, StagePage, StageStateArt } from '@/components/sports/platform/StageUI';
import { safeAuthReturnTo } from '@/lib/auth/returnTo';
import { authReturnDescription } from '@/lib/auth/authExperience';
import { authErrorMessage } from '@/lib/supabase/authErrors';

export default function ForgotPasswordScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = safeAuthReturnTo(params.returnTo);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [emailError, setEmailError] = useState<string>();
  const submitting = useRef(false);
  const send = async () => {
    if (submitting.current) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setEmailError('Enter a valid email address.'); return; }
    submitting.current = true;
    setEmailError(undefined);
    setSaving(true); setError(undefined);
    try { await auth.requestPasswordReset(email, returnTo); setSent(true); }
    catch (cause) { setError(authErrorMessage(cause, 'Could not send a reset link. Please try again.')); }
    finally { submitting.current = false; setSaving(false); }
  };
  const signIn = () => router.replace({ pathname: '/auth', params: returnTo ? { returnTo } : {} });
  return <StagePage focused title={sent ? 'Check email' : 'Reset password'} footer={<StageButton primary title={sent ? 'Back to sign in' : 'Send reset link'} loading={saving} onPress={sent ? signIn : () => void send()} />}>
    {sent ? <StageStateArt symbol="↗" /> : null}
    <StageIntro eyebrow={sent ? 'RESET REQUESTED' : 'ACCOUNT RECOVERY'} title={sent ? 'Check your inbox.' : 'Forgot your password?'} description={sent ? 'If an account exists for this email, we sent a reset link. Open the newest link on this device.' : 'Enter your email. If an account exists, we’ll send a reset link.'} />
    {!sent ? <StageField label="Email address" placeholder="Email" value={email} editable={!saving} error={emailError} onChangeText={value => { setEmail(value); setEmailError(undefined); setError(undefined); }} keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} /> : null}
    {returnTo ? <StageNotice>After recovery → {authReturnDescription(returnTo)}</StageNotice> : null}
    {error ? <StageNotice>{error}</StageNotice> : null}
    {sent ? <><StageButton title="Use a different email" disabled={saving} onPress={() => { setSent(false); setError(undefined); }} /><StageButton title="Resend link" loading={saving} onPress={() => void send()} /></> : <StageButton title="Back to sign in" disabled={saving} onPress={signIn} />}
  </StagePage>;
}
