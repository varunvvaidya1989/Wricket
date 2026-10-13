import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
  const save = async () => {
    const message = !currentPassword ? 'Enter your current SportStage password.' : newPassword.length < 8 ? 'Use at least eight characters.' : newPassword === currentPassword ? 'Choose a different password.' : newPassword !== confirmation ? 'Enter the same new password twice.' : undefined;
    if (message) { setError(message); return; }
    setSaving(true); setError(undefined);
    try { await auth.updatePassword(newPassword, currentPassword); setSaved(true); setCurrentPassword(''); setNewPassword(''); setConfirmation(''); }
    catch (cause) { setError(authErrorMessage(cause, 'Could not change your password. Please try again.')); }
    finally { setSaving(false); }
  };
  return <StagePage focused title="Change password" footer={<StageButton primary title={saved ? 'Back to account' : 'Save password'} loading={saving} onPress={saved ? () => router.canGoBack() ? router.back() : router.replace('/account') : () => void save()} />}>
    <StageIntro eyebrow="SECURE YOUR ACCOUNT" title={saved ? 'Password updated.' : 'Choose a new password.'} description={saved ? 'You can now sign in using your new password.' : 'Confirm your current password, then choose a new password with at least eight characters.'} />
    {!saved ? <><StageField label="Current password" placeholder="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" /><StageField label="New password" placeholder="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" /><StageField label="Confirm new password" placeholder="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoComplete="new-password" /></> : null}
    {error ? <StageNotice>{error}</StageNotice> : null}
  </StagePage>;
}
