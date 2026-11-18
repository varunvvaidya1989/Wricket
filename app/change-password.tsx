import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageField, StageIntro, StageNotice, StagePage } from '@/components/sports/platform/StageUI';
import { authErrorMessage } from '@/lib/supabase/authErrors';

export default function ChangePasswordScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmation?: string }>({});
  const submitting = useRef(false);
  const save = async () => {
    if (submitting.current) return;
    const errors = {
      ...(!currentPassword ? { currentPassword: 'Enter your current SportStage password.' } : {}),
      ...(newPassword.length < 8 ? { newPassword: 'Use at least eight characters.' } : newPassword === currentPassword ? { newPassword: 'Choose a different password.' } : {}),
      ...(newPassword !== confirmation ? { confirmation: 'Enter the same new password twice.' } : {}),
    };
    setFieldErrors(errors);
    if (Object.keys(errors).length) { setError(undefined); return; }
    submitting.current = true;
    setSaving(true); setError(undefined);
    try { await auth.updatePassword(newPassword, currentPassword); setSaved(true); setCurrentPassword(''); setNewPassword(''); setConfirmation(''); }
    catch (cause) { setError(authErrorMessage(cause, 'Could not change your password. Please try again.')); }
    finally { submitting.current = false; setSaving(false); }
  };
  if (auth.session?.user.phone && !auth.session.user.email) return <StagePage focused title="Phone sign-in" footer={<StageButton primary title="Back to account" onPress={() => router.replace('/account')} />}>
    <StageIntro eyebrow="PHONE SIGN-IN" title="You sign in with an SMS code." description="This phone-only account does not need a password." />
  </StagePage>;
  return <StagePage focused title="Change password" footer={<StageButton primary title={saved ? 'Back to account' : 'Save password'} loading={saving} onPress={saved ? () => router.canGoBack() ? router.back() : router.replace('/account') : () => void save()} />}>
    <StageIntro eyebrow="SECURE YOUR ACCOUNT" title={saved ? 'Password updated.' : 'Choose a new password.'} description={saved ? 'You can now sign in using your new password.' : 'Confirm your current password, then choose a new password with at least eight characters.'} />
    {!saved ? <><StageField label="Current password" placeholder="Current password" value={currentPassword} editable={!saving} error={fieldErrors.currentPassword} onChangeText={value => { setCurrentPassword(value); setFieldErrors(current => ({ ...current, currentPassword: undefined })); setError(undefined); }} secureTextEntry autoCapitalize="none" autoComplete="current-password" /><StageField label="New password" placeholder="New password" value={newPassword} editable={!saving} error={fieldErrors.newPassword} onChangeText={value => { setNewPassword(value); setFieldErrors(current => ({ ...current, newPassword: undefined, confirmation: undefined })); setError(undefined); }} secureTextEntry autoCapitalize="none" autoComplete="new-password" /><StageField label="Confirm new password" placeholder="Confirm new password" value={confirmation} editable={!saving} error={fieldErrors.confirmation} onChangeText={value => { setConfirmation(value); setFieldErrors(current => ({ ...current, confirmation: undefined })); setError(undefined); }} secureTextEntry autoCapitalize="none" autoComplete="new-password" /></> : null}
    {error ? <StageNotice>{error}</StageNotice> : null}
  </StagePage>;
}
