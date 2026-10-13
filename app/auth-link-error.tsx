import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';


import { StageButton, StageField, StageIntro, StageNotice, StagePage, StageStateArt } from '@/components/sports/platform/StageUI';
import { safeAuthReturnTo } from '@/lib/auth/returnTo';
import { authReturnDescription } from '@/lib/auth/authExperience';
import { useAuth } from '@/components/providers/AuthProvider';




import { authErrorMessage } from '@/lib/supabase/authErrors';

export default function AuthLinkErrorScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = safeAuthReturnTo(params.returnTo) ?? auth.authLinkError?.returnTo;
  const [notice, setNotice] = useState<string>();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState<'magic' | 'verification' | 'recovery' | null>(null);
  const expired = ['otp_expired', 'flow_state_expired', 'flow_state_not_found'].includes(auth.authLinkError?.code ?? '');

  const requireEmail = () => {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return true;
    setNotice('Enter your SportStage account email first.');
    return false;
  };

  const recover = async (kind: 'magic' | 'verification' | 'recovery') => {
    if (!requireEmail()) return;
    setSaving(kind);
    try {
      if (kind === 'magic') await auth.sendMagicLink(email, returnTo);
      else if (kind === 'verification') await auth.resendSignupConfirmation(email, returnTo);
      else await auth.requestPasswordReset(email, returnTo);
      setNotice('If the account is eligible, a new email has been sent. Use the newest link.');
    } catch (cause) {
      setNotice(authErrorMessage(cause, 'Wait a moment and try again.'));
    } finally { setSaving(null); }
  };

  const backToLogin = () => {
    auth.clearAuthLinkError();
    router.replace({ pathname: '/auth', params: returnTo ? { returnTo } : {} });
  };

  return <StagePage focused title="Sign-in link" onBack={backToLogin} footer={<StageButton primary title="Back to sign in" onPress={backToLogin} disabled={saving !== null} />}>
    <StageStateArt symbol="↻" /><StageIntro eyebrow={expired ? 'LINK EXPIRED' : 'LINK UNAVAILABLE'} title="Let’s get a fresh link." description="This link may have expired or already been used. Request a new link to continue." />
    {returnTo ? <StageNotice>After sign-in → {authReturnDescription(returnTo)}</StageNotice> : null}
    <StageField label="Email address" placeholder="SportStage account email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
    {notice ? <StageNotice>{notice}</StageNotice> : null}
    <StageButton title="Send a new sign-in link" onPress={() => void recover('magic')} loading={saving === 'magic'} disabled={saving !== null} />
    <StageButton title="Resend signup verification" onPress={() => void recover('verification')} loading={saving === 'verification'} disabled={saving !== null} />
    <StageButton title="Reset my password" onPress={() => void recover('recovery')} loading={saving === 'recovery'} disabled={saving !== null} />
  </StagePage>;
}

