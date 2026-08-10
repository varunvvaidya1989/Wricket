import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { LegacyPlayerCandidate, legacyPlayerLinkApi } from '@/lib/supabase/legacyPlayerLinkApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export default function AuctionYodhaProfileLinkScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [candidates, setCandidates] = useState<LegacyPlayerCandidate[]>([]);
  const [selected, setSelected] = useState<LegacyPlayerCandidate>();
  const [matchMethod, setMatchMethod] = useState<'EMAIL' | 'PHONE' | 'EMAIL_PHONE'>();
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    let active = true;
    const displayName = auth.profile?.displayName;
    if (!displayName) {
      router.back();
      return undefined;
    }
    void legacyPlayerLinkApi.resolve(displayName).then(resolution => {
      if (!active) return;
      if ((resolution.status !== 'VERIFIED_MATCH' && resolution.status !== 'CONTACT_CONFLICT') || resolution.candidates.length === 0) {
        router.back();
        return;
      }
      setCandidates(resolution.candidates);
      setMatchMethod(resolution.method);
      if (resolution.candidates.length === 1) setSelected(resolution.candidates[0]);
      setLoading(false);
    }).catch(cause => {
      if (!active) return;
      Alert.alert('Could not check your previous profile', cause instanceof Error ? cause.message : 'Please try again.');
      router.back();
    });
    return () => { active = false; };
  }, [auth.profile?.displayName, router]);

  const connect = async () => {
    if (!selected) return;
    setLinking(true);
    try {
      await legacyPlayerLinkApi.confirm(selected.playerId);
      Alert.alert('Profile connected', 'Your AuctionYodha history is now part of your SportStage player profile.');
      router.replace('/wricket/(tabs)/me');
    } catch (cause) {
      Alert.alert('Could not connect profile', cause instanceof Error ? cause.message : 'Please try again.');
      setLinking(false);
    }
  };

  return <Screen scroll>
    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text tone="muted">Checking your verified account details…</Text></View> : candidates.length ? <>
      <View style={styles.hero}>
        <View style={styles.icon}><MaterialCommunityIcons name="account-convert-outline" size={34} color={colors.accentInk} /></View>
        <Text variant="h1">Your cricket history is ready</Text>
        <Text tone="muted">We found an AuctionYodha player profile with the same verified {matchMethod === 'PHONE' ? 'phone number' : 'email address'} as your SportStage account.</Text>
      </View>
      {candidates.map(candidate => <Card key={candidate.playerId} onPress={() => setSelected(candidate)}>
        <View style={styles.candidateRow}>
          <View style={{ flex: 1 }}><Text variant="overline" tone="muted">AUCTIONYODHA PLAYER</Text><Text variant="h2">{candidate.displayName}</Text></View>
          <MaterialCommunityIcons name={selected?.playerId === candidate.playerId ? 'radiobox-marked' : 'radiobox-blank'} size={24} color={selected?.playerId === candidate.playerId ? colors.accent : colors.textDim} />
        </View>
        <View style={styles.verified}><MaterialCommunityIcons name="shield-check" size={18} color={colors.success} /><Text variant="caption" style={{ color: colors.success }}>Verified {matchMethod === 'PHONE' ? 'phone' : 'email'} match</Text></View>
      </Card>)}
      <View style={styles.notice}><Text variant="bodyStrong">What will be connected?</Text><Text variant="caption" tone="muted">Your previous matches and statistics will be associated with this SportStage account. Future SportStage matches will continue adding to the same career record.</Text></View>
      <Button title="Yes, connect my profile" onPress={() => void connect()} loading={linking} disabled={!selected} fullWidth />
      <Button title="Not my profile" variant="ghost" onPress={() => router.back()} disabled={linking} fullWidth />
    </> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  loading: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  icon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  verified: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  candidateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  notice: { gap: spacing.xs, padding: spacing.md, marginVertical: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
});
