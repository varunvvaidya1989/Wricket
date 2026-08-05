import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportOption, sportstageAccountApi } from '@/lib/supabase/sportstageAccountApi';

export default function AccountScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(auth.profile?.displayName ?? '');
  const [email, setEmail] = useState(auth.session?.user.email ?? '');
  const [sportCode, setSportCode] = useState(auth.profile?.primarySport?.code ?? 'CRICKET');
  const [sports, setSports] = useState<SportOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void sportstageAccountApi.listSports().then(setSports).catch(cause => {
      Alert.alert('Could not load sports', cause instanceof Error ? cause.message : 'Please try again.');
    });
  }, []);

  const save = async () => {
    if (displayName.trim().length < 2) return Alert.alert('Display name required', 'Enter at least two characters.');
    if (!email.trim()) return Alert.alert('Email required', 'Enter your account email.');
    setSaving(true);
    try {
      await sportstageAccountApi.completeOnboarding(displayName, sportCode);
      if (email.trim().toLowerCase() !== auth.session?.user.email?.toLowerCase()) {
        await auth.updateEmail(email);
        Alert.alert('Confirm your email', 'Check your inbox to finish changing your email address.');
      }
      await auth.refreshProfile();
      router.back();
    } catch (cause) {
      Alert.alert('Could not update account', cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setSaving(false); }
  };

  return <Screen scroll>
    <View style={styles.headerRow}>
      <Pressable onPress={() => router.back()} style={styles.back}><MaterialCommunityIcons name="arrow-left" size={23} color={colors.text} /></Pressable>
      <View><Text variant="overline" tone="muted">SPORTSTAGE</Text><Text variant="h2">Account settings</Text></View>
    </View>
    <View style={styles.section}>
      <Text variant="overline" tone="muted">PROFILE</Text>
      <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor={colors.textDim} style={styles.input} />
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.textDim} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.input} />
    </View>
    <View style={styles.section}>
      <Text variant="overline" tone="muted">PRIMARY SPORT</Text>
      <Text variant="caption" tone="muted">Your selected sport controls which SportStage app you can enter. Roles remain tournament-specific.</Text>
      {sports.map(sport => <Pressable key={sport.id} onPress={() => setSportCode(sport.code)} style={[styles.sport, sportCode === sport.code && styles.selected]}>
        <MaterialCommunityIcons name={sport.code === 'CRICKET' ? 'cricket' : 'trophy-outline'} size={22} color={sportCode === sport.code ? colors.accentInk : colors.text} />
        <View style={{ flex: 1 }}><Text variant="bodyStrong" style={sportCode === sport.code ? styles.selectedText : undefined}>{sport.name}</Text><Text variant="caption" style={sportCode === sport.code ? styles.selectedText : { color: colors.textMuted }}>{sport.status === 'AVAILABLE' ? 'Available now' : 'Coming soon'}</Text></View>
        {sportCode === sport.code ? <MaterialCommunityIcons name="check-circle" size={21} color={colors.accentInk} /> : null}
      </Pressable>)}
    </View>
    <Button title="Save changes" onPress={() => void save()} loading={saving} fullWidth />
    <Button title="Change password" variant="secondary" onPress={() => router.push('/change-password')} disabled={saving} fullWidth />
  </Screen>;
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, marginBottom: spacing.xl },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm, marginBottom: spacing.xl },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 16 },
  sport: { minHeight: 64, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  selectedText: { color: colors.accentInk },
});
