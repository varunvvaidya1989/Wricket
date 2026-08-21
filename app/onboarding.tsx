import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { isSportReleased } from '@/lib/sports/platform/sportRelease';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportOption, sportstageAccountApi } from '@/lib/supabase/sportstageAccountApi';
import { SportMultiSelect } from '@/components/sports/SportMultiSelect';
import { SportStageSignOutActions } from '@/components/auth/SportStageSignOutActions';

export default function OnboardingScreen() {
  const auth = useAuth();
  const metadata = auth.session?.user.user_metadata ?? {};
  const [displayName, setDisplayName] = useState(String(metadata.display_name ?? auth.profile?.displayName ?? ''));
  const metadataPrimaryCode = String(metadata.primary_sport_code ?? 'CRICKET');
  const initialPrimaryCode = isSportReleased(metadataPrimaryCode) ? metadataPrimaryCode : 'CRICKET';
  const metadataSportCodes = Array.isArray(metadata.sport_codes)
    ? metadata.sport_codes.filter((code): code is string => typeof code === 'string' && isSportReleased(code))
    : [];
  const [primarySportCode, setPrimarySportCode] = useState(initialPrimaryCode);
  const [selectedSportCodes, setSelectedSportCodes] = useState<string[]>(metadataSportCodes.length ? metadataSportCodes : [initialPrimaryCode]);
  const [sports, setSports] = useState<SportOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void sportstageAccountApi.listSports().then(setSports).catch(cause => Alert.alert('Could not load sports', cause instanceof Error ? cause.message : 'Please try again.')); }, []);

  const complete = async () => {
    setSaving(true);
    try {
      await sportstageAccountApi.saveSports(displayName, selectedSportCodes, primarySportCode);
      await auth.refreshProfile();
    } catch (cause) {
      Alert.alert('Could not finish setup', cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setSaving(false); }
  };

  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.brand}><MaterialCommunityIcons name="account-check-outline" size={30} color={colors.accentInk} /></View>
    <Text variant="overline" tone="accent">ONE LAST STEP</Text>
    <Text variant="h1">Set up SportStage</Text>
    <Text variant="body" tone="muted">Choose every sport you follow or play, then mark one as primary. Roles are assigned later within each tournament or team.</Text>
    <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor={colors.textDim} style={styles.input} />
    <SportMultiSelect sports={sports} selectedCodes={selectedSportCodes} primaryCode={primarySportCode} onToggle={code => toggleSport(code, selectedSportCodes, primarySportCode, setSelectedSportCodes, setPrimarySportCode)} onPrimary={setPrimarySportCode} />
    <Text variant="caption" tone="dim">{selectedSportCodes.length} selected · {sports.find(sport => sport.code === primarySportCode)?.name ?? primarySportCode} is primary</Text>
    <Button title="Continue" onPress={() => void complete()} loading={saving} disabled={!selectedSportCodes.length || !selectedSportCodes.includes(primarySportCode) || displayName.trim().length < 2} fullWidth />
    <SportStageSignOutActions />
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.bg },
  brand: { width: 58, height: 58, borderRadius: radius.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 16 },
});

function toggleSport(code: string, selected: string[], primary: string, setSelected: (codes: string[]) => void, setPrimary: (code: string) => void) {
  if (selected.includes(code)) {
    const next = selected.filter(item => item !== code);
    setSelected(next);
    if (primary === code) setPrimary(next[0] ?? '');
  } else {
    setSelected([...selected, code]);
    if (!primary) setPrimary(code);
  }
}
