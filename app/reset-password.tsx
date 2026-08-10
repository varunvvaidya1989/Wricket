import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { authErrorMessage } from '@/lib/supabase/authErrors';

export default function ResetPasswordScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);

  const update = async () => {
    if (!auth.session) return Alert.alert('Reset link required', 'Open this screen from the link in your password reset email.');
    if (password.length < 8) return Alert.alert('Password too short', 'Use at least 8 characters.');
    if (password !== confirmation) return Alert.alert('Passwords do not match', 'Enter the same password twice.');
    setSaving(true);
    try {
      await auth.updatePassword(password);
      Alert.alert('Password updated', 'You can now use your new password.');
      router.replace('/');
    } catch (cause) {
      Alert.alert('Could not update password', authErrorMessage(cause, 'Please request a new reset link and try again.'));
    } finally { setSaving(false); }
  };

  return <View style={styles.page}>
    <Text variant="overline" tone="accent">SPORTSTAGE SECURITY</Text>
    <Text variant="h1">Choose a new password</Text>
    <Text variant="body" tone="muted">Use at least eight characters and avoid reusing an old password.</Text>
    <TextInput value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor={colors.textDim} secureTextEntry style={styles.input} />
    <TextInput value={confirmation} onChangeText={setConfirmation} placeholder="Confirm new password" placeholderTextColor={colors.textDim} secureTextEntry style={styles.input} />
    <Button title="Update password" onPress={() => void update()} loading={saving} fullWidth />
    {!auth.session ? <Button title="Request another link" variant="ghost" onPress={() => router.replace('/forgot-password')} fullWidth /> : null}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.bg },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 16 },
});
