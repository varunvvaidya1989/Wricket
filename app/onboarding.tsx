import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportOption, sportstageAccountApi } from '@/lib/supabase/sportstageAccountApi';

export default function OnboardingScreen() {
  const auth = useAuth();
  const metadata = auth.session?.user.user_metadata ?? {};
  const [displayName, setDisplayName] = useState(String(metadata.display_name ?? auth.profile?.displayName ?? ''));
  const [sportCode, setSportCode] = useState(String(metadata.primary_sport_code ?? 'CRICKET'));
  const [sports, setSports] = useState<SportOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void sportstageAccountApi.listSports().then(setSports).catch(cause => Alert.alert('Could not load sports', cause instanceof Error ? cause.message : 'Please try again.')); }, []);

  const complete = async () => {
    setSaving(true);
    try {
      await sportstageAccountApi.completeOnboarding(displayName, sportCode);
      await auth.refreshProfile();
    } catch (cause) {
      Alert.alert('Could not finish setup', cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setSaving(false); }
  };

  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.brand}><MaterialCommunityIcons name="account-check-outline" size={30} color={colors.accentInk} /></View>
    <Text variant="overline" tone="accent">ONE LAST STEP</Text>
    <Text variant="h1">Set up SportStage</Text>
    <Text variant="body" tone="muted">Choose your primary sport. Roles like owner, scorer and captain will be assigned later within each tournament or team.</Text>
    <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor={colors.textDim} style={styles.input} />
    <View style={styles.list}>{sports.map(sport => <Pressable key={sport.id} onPress={() => setSportCode(sport.code)} style={[styles.sport, sportCode === sport.code && styles.selected]}>
      <MaterialCommunityIcons name={sport.code === 'CRICKET' ? 'cricket' : 'trophy-outline'} size={23} color={sportCode === sport.code ? colors.accentInk : colors.text} />
      <View style={{ flex: 1 }}><Text variant="bodyStrong" style={sportCode === sport.code ? { color: colors.accentInk } : undefined}>{sport.name}</Text><Text variant="caption" style={sportCode === sport.code ? { color: colors.accentInk } : { color: colors.textMuted }}>{sport.status === 'AVAILABLE' ? 'Available now' : 'Coming soon'}</Text></View>
      {sportCode === sport.code ? <MaterialCommunityIcons name="check-circle" size={22} color={colors.accentInk} /> : null}
    </Pressable>)}</View>
    <Button title="Continue" onPress={() => void complete()} loading={saving} disabled={!sportCode || displayName.trim().length < 2} fullWidth />
    <Button title="Sign out" variant="ghost" onPress={() => void auth.signOut()} fullWidth />
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.bg },
  brand: { width: 58, height: 58, borderRadius: radius.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 16 },
  list: { gap: spacing.sm },
  sport: { minHeight: 64, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
});
