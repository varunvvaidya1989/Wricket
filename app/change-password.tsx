import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { authErrorMessage } from '@/lib/supabase/authErrors';

export default function ChangePasswordScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!currentPassword) return Alert.alert('Current password required', 'Enter your current SportStage password.');
    if (newPassword.length < 8) return Alert.alert('Password too short', 'Use at least eight characters.');
    if (newPassword === currentPassword) return Alert.alert('Choose a different password', 'Your new password must be different from the current password.');
    if (newPassword !== confirmation) return Alert.alert('Passwords do not match', 'Enter the same new password twice.');
    setSaving(true);
    try {
      await auth.updatePassword(newPassword, currentPassword);
      Alert.alert('Password changed', 'Your SportStage password has been updated.');
      router.back();
    } catch (cause) {
      Alert.alert('Could not change password', authErrorMessage(cause, 'Could not change your password. Please try again.'));
    } finally { setSaving(false); }
  };

  return <Screen>
    <View style={styles.headerRow}>
      <Pressable onPress={() => router.back()} style={styles.back}><MaterialCommunityIcons name="arrow-left" size={23} color={colors.text} /></Pressable>
      <View><Text variant="overline" tone="muted">ACCOUNT SECURITY</Text><Text variant="h2">Change password</Text></View>
    </View>
    <View style={styles.form}>
      <Text variant="body" tone="muted">Confirm your current password, then choose a new password with at least eight characters.</Text>
      <TextInput value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password" placeholderTextColor={colors.textDim} secureTextEntry autoCapitalize="none" style={styles.input} />
      <TextInput value={newPassword} onChangeText={setNewPassword} placeholder="New password" placeholderTextColor={colors.textDim} secureTextEntry autoCapitalize="none" style={styles.input} />
      <TextInput value={confirmation} onChangeText={setConfirmation} placeholder="Confirm new password" placeholderTextColor={colors.textDim} secureTextEntry autoCapitalize="none" style={styles.input} />
      <Button title="Change password" onPress={() => void save()} loading={saving} fullWidth />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, marginBottom: spacing.xl },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  form: { gap: spacing.md },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 16 },
});
