import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageField, StageIntro, StageNotice, StagePage } from '@/components/sports/platform/StageUI';
import { safeAuthReturnFromUrl, safeAuthReturnTo } from '@/lib/auth/returnTo';
import { authReturnDescription } from '@/lib/auth/authExperience';
import { authErrorMessage } from '@/lib/supabase/authErrors';

export default function ResetPasswordScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const [callbackReturnTo, setCallbackReturnTo] = useState<string | undefined>(() => safeAuthReturnTo(params.returnTo)
    ?? (Platform.OS === 'web' && typeof window !== 'undefined' ? safeAuthReturnFromUrl(window.location.href) : undefined));
  const returnTo = safeAuthReturnTo(params.returnTo) ?? callbackReturnTo ?? auth.recoveryReturnTo;
  useEffect(() => {
    const target = safeAuthReturnTo(params.returnTo);
    if (target) setCallbackReturnTo(target);
  }, [params.returnTo]);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmation?: string }>({});
  const submitting = useRef(false);
  const update = async () => {
    if (submitting.current) return;
    if (!auth.session) { setError('Open the newest link from your password reset email.'); return; }
    const errors = {
      ...(password.length < 8 ? { password: 'Use at least 8 characters.' } : {}),
      ...(password !== confirmation ? { confirmation: 'Enter the same password twice.' } : {}),
    };
    setFieldErrors(errors);
    if (Object.keys(errors).length) { setError(undefined); return; }
    submitting.current = true;
    setSaving(true); setError(undefined);
    try { await auth.updatePassword(password); auth.clearRecoveryReturnTo(); router.replace((returnTo ?? '/live') as Href); }
    catch (cause) { setError(authErrorMessage(cause, 'Please request a new reset link and try again.')); }
    finally { submitting.current = false; setSaving(false); }
  };
  return <StagePage focused title="New password" footer={<StageButton primary title="Save password" loading={saving} disabled={!auth.session || auth.loading} onPress={() => void update()} />}>
    <StageIntro eyebrow="SECURE YOUR ACCOUNT" title="Choose a new password." description="Use at least eight characters and avoid reusing an old password." />
    {returnTo ? <StageNotice>After recovery → {authReturnDescription(returnTo)}</StageNotice> : null}
    <StageField label="New password" placeholder="New password" value={password} editable={!saving} error={fieldErrors.password} onChangeText={value => { setPassword(value); setFieldErrors({}); setError(undefined); }} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
    <StageField label="Confirm new password" placeholder="Confirm new password" value={confirmation} editable={!saving} error={fieldErrors.confirmation} onChangeText={value => { setConfirmation(value); setFieldErrors(current => ({ ...current, confirmation: undefined })); setError(undefined); }} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
    {error ? <StageNotice>{error}</StageNotice> : null}
    {!auth.session && !auth.loading ? <><StageNotice>Open this screen using your password reset email.</StageNotice><StageButton title="Request another link" onPress={() => router.replace({ pathname: '/forgot-password', params: returnTo ? { returnTo } : {} })} /></> : null}
  </StagePage>;
}
