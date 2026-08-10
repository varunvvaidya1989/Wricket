import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { authErrorMessage } from '@/lib/supabase/authErrors';

export default function ForgotPasswordScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const send = async () => {
    if (!email.trim()) return Alert.alert('Email required', 'Enter the email used for your SportStage account.');
    setSaving(true);
    try {
      await auth.requestPasswordReset(email);
      Alert.alert('Check your email', 'If an account exists, a password reset link has been sent.');
      router.replace('/auth');
    } catch (cause) {
      Alert.alert('Could not send reset link', authErrorMessage(cause, 'Could not send a reset link. Please try again.'));
    } finally { setSaving(false); }
  };

  return <View style={styles.page}>
    <Text variant="overline" tone="accent">ACCOUNT RECOVERY</Text>
    <Text variant="h1">Reset your password</Text>
    <Text variant="body" tone="muted">We’ll email you a secure link that opens SportStage.</Text>
    <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.textDim} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.input} />
    <Button title="Send reset link" onPress={() => void send()} loading={saving} fullWidth />
    <Button title="Back to sign in" variant="ghost" onPress={() => router.replace('/auth')} disabled={saving} fullWidth />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.bg },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 16 },
});
