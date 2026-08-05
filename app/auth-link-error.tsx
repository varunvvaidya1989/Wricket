import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export default function AuthLinkErrorScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState<'magic' | 'verification' | 'recovery' | null>(null);
  const expired = ['otp_expired', 'flow_state_expired', 'flow_state_not_found'].includes(auth.authLinkError?.code ?? '');

  const requireEmail = () => {
    if (email.trim()) return true;
    Alert.alert('Email required', 'Enter your SportStage account email first.');
    return false;
  };

  const recover = async (kind: 'magic' | 'verification' | 'recovery') => {
    if (!requireEmail()) return;
    setSaving(kind);
    try {
      if (kind === 'magic') await auth.sendMagicLink(email);
      else if (kind === 'verification') await auth.resendSignupConfirmation(email);
      else await auth.requestPasswordReset(email);
      Alert.alert('New email sent', 'Check your inbox and use the newest SportStage link.');
    } catch (cause) {
      Alert.alert('Could not send email', cause instanceof Error ? cause.message : 'Wait a moment and try again.');
    } finally { setSaving(null); }
  };

  const backToLogin = () => {
    auth.clearAuthLinkError();
    router.replace('/auth');
  };

  return <View style={styles.page}>
    <View style={styles.icon}><MaterialCommunityIcons name="link-variant-off" size={31} color={colors.accentInk} /></View>
    <Text variant="overline" tone="accent">AUTHENTICATION LINK</Text>
    <Text variant="h1">{expired ? 'This link has expired' : 'This link cannot be used'}</Text>
    <Text variant="body" tone="muted" style={styles.copy}>{expired ? 'Email links are time-limited and can only be used once. Request a fresh link below.' : auth.authLinkError?.message ?? 'The link may be invalid or may already have been used.'}</Text>
    <TextInput value={email} onChangeText={setEmail} placeholder="SportStage account email" placeholderTextColor={colors.textDim} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.input} />
    <Button title="Send a new sign-in link" onPress={() => void recover('magic')} loading={saving === 'magic'} disabled={saving !== null} fullWidth />
    <Button title="Resend signup verification" variant="secondary" onPress={() => void recover('verification')} loading={saving === 'verification'} disabled={saving !== null} fullWidth />
    <Button title="Reset my password" variant="secondary" onPress={() => void recover('recovery')} loading={saving === 'recovery'} disabled={saving !== null} fullWidth />
    <Button title="Back to sign in" variant="ghost" onPress={backToLogin} disabled={saving !== null} fullWidth />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.bg },
  icon: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  copy: { lineHeight: 22, marginBottom: spacing.sm },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 16 },
});
