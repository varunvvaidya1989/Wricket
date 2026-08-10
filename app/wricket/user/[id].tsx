import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { globalSearchApi, SearchProfile } from '@/lib/supabase/globalSearchApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export default function SearchProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<SearchProfile>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await globalSearchApi.getProfile(id);
      setProfile(result);
      setError(result ? undefined : 'This member is unavailable');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this member');
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  return <Screen scroll>
    <Stack.Screen options={{ title: profile?.displayName ?? 'Member' }} />
    {loading ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : error || !profile ? <View style={styles.empty}>
      <MaterialCommunityIcons name="account-alert-outline" size={34} color={colors.textDim} />
      <Text variant="h3">Member unavailable</Text>
      <Text tone="muted" style={styles.centerText}>This profile may no longer be visible.</Text>
    </View> : <View style={styles.content}>
      <View style={styles.profileHeader}>
        {profile.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text variant="h1" tone="accent">{initials(profile.displayName)}</Text></View>}
        <Text variant="h1" style={styles.centerText}>{profile.displayName}</Text>
        <Text variant="caption" tone="muted">{roleLabel(profile.playerRole)}</Text>
        {profile.isScorer ? <View style={styles.scorerBadge}><MaterialCommunityIcons name="whistle-outline" size={15} color={colors.accent} /><Text variant="overline" tone="accent">SCORER{profile.availabilityStatus === 'AVAILABLE' ? ' · AVAILABLE' : ''}</Text></View> : null}
      </View>
      {profile.playerId ? <Card onPress={() => router.push({ pathname: '/wricket/player/[id]', params: { id: profile.playerId! } })}>
        <View style={styles.row}><View style={styles.icon}><MaterialCommunityIcons name="cricket" size={22} color={colors.accent} /></View><View style={styles.main}><Text variant="bodyStrong">Cricket profile</Text><Text variant="caption" tone="muted">Career statistics and playing style</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color={colors.textDim} /></View>
      </Card> : <View style={styles.noPlayer}><Text variant="caption" tone="dim">No linked player record yet.</Text></View>}
    </View>}
  </Screen>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'W';
}

function roleLabel(role?: string) {
  return ({ BAT: 'Batter', BOWL: 'Bowler', AR: 'All-rounder', WK: 'Wicket-keeper' } as Record<string, string>)[role ?? ''] ?? 'Wricket member';
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxxl },
  content: { paddingTop: spacing.lg, gap: spacing.lg },
  profileHeader: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  avatarImage: { width: 92, height: 92, borderRadius: 46, marginBottom: spacing.md },
  scorerBadge: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.accentMuted, paddingVertical: 6, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 3 },
  empty: { minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centerText: { textAlign: 'center' },
  noPlayer: { alignItems: 'center', padding: spacing.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg },
});
