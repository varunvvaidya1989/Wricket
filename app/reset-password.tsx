import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageField, StageIntro, StageNotice, StagePage } from '@/components/sports/platform/StageUI';
import { safeAuthReturnTo } from '@/lib/auth/returnTo';
import { authErrorMessage } from '@/lib/supabase/authErrors';

export default function ResetPasswordScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const [callbackReturnTo, setCallbackReturnTo] = useState<string>();
  const returnTo = safeAuthReturnTo(params.returnTo) ?? callbackReturnTo;
  useEffect(() => {
    let active = true;
    // The authentication token fragment can replace the router's initial
    // query state during session restoration. Keep the validated callback task.
    void Linking.getInitialURL().then(url => {
      if (active && url) setCallbackReturnTo(safeAuthReturnTo(Linking.parse(url).queryParams?.returnTo));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const update = async () => {
    if (!auth.session) { setError('Open the newest link from your password reset email.'); return; }
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirmation) { setError('Enter the same password twice.'); return; }
    setSaving(true); setError(undefined);
    try { await auth.updatePassword(password); router.replace((returnTo ?? '/live') as Href); }
    catch (cause) { setError(authErrorMessage(cause, 'Please request a new reset link and try again.')); }
    finally { setSaving(false); }
  };
  return <StagePage focused title="New password" footer={<StageButton primary title="Save password" loading={saving} disabled={!auth.session || auth.loading} onPress={() => void update()} />}>
    <StageIntro eyebrow="SECURE YOUR ACCOUNT" title="Choose a new password." description="Use at least eight characters and avoid reusing an old password." />
    <StageField label="New password" placeholder="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
    <StageField label="Confirm new password" placeholder="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
    {error ? <StageNotice>{error}</StageNotice> : null}
    {!auth.session && !auth.loading ? <><StageNotice>Open this screen using your password reset email.</StageNotice><StageButton title="Request another link" onPress={() => router.replace({ pathname: '/forgot-password', params: returnTo ? { returnTo } : {} })} /></> : null}
  </StagePage>;
}
