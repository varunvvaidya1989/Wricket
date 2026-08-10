import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { GlobalProfileData, globalProfileApi, SportSummary } from '@/lib/supabase/globalProfileApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export default function GlobalProfileScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [data, setData] = useState<GlobalProfileData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!auth.session) { setLoading(false); return; }
    setLoading(true);
    try {
      setData(await globalProfileApi.get(auth.session.user.id));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your global profile');
    } finally { setLoading(false); }
  }, [auth.session]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  return <Screen padded={false}>
    <AppHeader title="Global Profile" eyebrow="SPORTSTAGE" back right={<Pressable accessibilityRole="button" accessibilityLabel="Account settings" onPress={() => router.push('/account')} style={styles.headerAction}><MaterialCommunityIcons name="cog-outline" size={22} color={colors.text} /></Pressable>} />
    {loading && !data ? <View style={styles.center}><ActivityIndicator color={colors.accent} /><Text variant="caption" tone="muted">Loading your sports...</Text></View> : !auth.session ? <View style={styles.center}><MaterialCommunityIcons name="account-lock-outline" size={34} color={colors.textDim} /><Text variant="h3">Sign in to view your profile</Text></View> : error && !data ? <View style={styles.center}><MaterialCommunityIcons name="cloud-alert-outline" size={34} color={colors.textDim} /><Text variant="h3">Profile unavailable</Text><Text tone="muted" style={styles.centerText}>{error}</Text><Pressable onPress={() => void load()} style={styles.retry}><Text variant="caption" style={{ color: colors.accentInk }}>TRY AGAIN</Text></Pressable></View> : data ? <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} contentContainerStyle={styles.content}>
      <View style={styles.identity}>
        {data.profile.avatarUrl ? <Image source={{ uri: data.profile.avatarUrl }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text variant="h1" tone="accent">{initials(data.profile.displayName)}</Text></View>}
        <View style={styles.identityCopy}><Text variant="h2" numberOfLines={1}>{data.profile.displayName}</Text><Text variant="caption" tone="muted">SportStage member</Text></View>
        {data.profile.primarySport ? <View style={styles.primaryChip}><MaterialCommunityIcons name="star" size={13} color={colors.accent} /><Text variant="overline" tone="accent">{data.profile.primarySport.name}</Text></View> : null}
      </View>

      <View style={styles.activityStrip}>
        <ActivityValue value={data.activeSports} label="SPORTS" />
        <ActivityValue value={data.totalMatches} label="MATCHES" />
        <ActivityValue value={data.achievements} label="MILESTONES" />
      </View>
      {data.partial ? <View style={styles.partial}><MaterialCommunityIcons name="sync-alert" size={17} color={colors.textMuted} /><Text variant="caption" tone="muted" style={styles.flex}>Some activity is still syncing. Your sport access is unaffected.</Text></View> : null}

      <View style={styles.sectionHeader}><Text variant="overline" tone="muted">CONNECTED SPORTS</Text><Pressable onPress={() => router.push('/account')}><Text variant="caption" tone="accent">MANAGE</Text></Pressable></View>
      {data.sports.length ? data.sports.map(summary => <SportSummaryCard key={summary.sport.id} summary={summary} onOpen={route => router.push(route)} />) : <View style={styles.empty}><MaterialCommunityIcons name="trophy-outline" size={26} color={colors.textDim} /><Text variant="h3">No sports connected</Text><Text tone="muted" style={styles.centerText}>Choose the sports you follow or play to build your SportStage profile.</Text><Pressable onPress={() => router.push('/account')} style={styles.retry}><Text variant="caption" style={{ color: colors.accentInk }}>CHOOSE SPORTS</Text></Pressable></View>}

      <View style={styles.accountSection}><Text variant="overline" tone="muted">ACCOUNT</Text><Pressable onPress={() => router.push('/account')} style={styles.accountRow}><MaterialCommunityIcons name="shield-account-outline" size={21} color={colors.textMuted} /><View style={styles.flex}><Text variant="bodyStrong">Account and privacy</Text><Text variant="caption" tone="dim">Identity, security and data controls</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color={colors.textDim} /></Pressable></View>
    </ScrollView> : null}
  </Screen>;
}

function SportSummaryCard({ summary, onOpen }: { summary: SportSummary; onOpen: (route: Href) => void }) {
  const route = summary.sport.code === 'CRICKET' ? '/wricket/me' as Href : summary.sport.appRoute as Href | undefined;
  const canOpen = summary.available && Boolean(route);
  return <Card onPress={canOpen ? () => onOpen(route!) : undefined} style={!summary.available ? styles.unavailableCard : undefined}>
    <View style={styles.sportHeader}><View style={styles.sportIcon}><MaterialCommunityIcons name={summary.sport.code === 'CRICKET' ? 'cricket' : 'trophy-outline'} size={24} color={summary.available ? colors.accent : colors.textDim} /></View><View style={styles.flex}><View style={styles.sportTitle}><Text variant="h3">{summary.sport.name}</Text>{summary.sport.isPrimary ? <Text variant="overline" tone="accent">PRIMARY</Text> : null}</View><Text variant="caption" tone="muted">{summary.sport.accessStatus === 'COMING_SOON' ? 'Profile reserved · App coming soon' : summary.available ? 'Sport profile active' : 'Profile unavailable'}</Text></View>{canOpen ? <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} /> : null}</View>
    {summary.headlineStats.length ? <View style={styles.sportStats}>{summary.headlineStats.map(item => <View key={item.label} style={styles.sportStat}><Text variant="h2">{item.value}</Text><Text variant="overline" tone="dim">{item.label}</Text></View>)}</View> : <Text variant="caption" tone="dim" style={styles.noActivity}>{summary.available ? 'No recorded activity yet.' : 'Your profile will activate when this sport launches.'}</Text>}
  </Card>;
}

function ActivityValue({ value, label }: { value: number; label: string }) {
  return <View style={styles.activityValue}><Text variant="h2">{value}</Text><Text variant="overline" tone="dim">{label}</Text></View>;
}

function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'S'; }

const styles = StyleSheet.create({
  headerAction: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  centerText: { textAlign: 'center', lineHeight: 21 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  identityCopy: { flex: 1, minWidth: 0 },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 62, height: 62, borderRadius: 31 },
  primaryChip: { maxWidth: 110, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: colors.accentMuted, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  activityStrip: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: spacing.lg },
  activityValue: { flex: 1, alignItems: 'center', gap: 3 },
  partial: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceElevated, borderRadius: radius.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  sportHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sportIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  sportTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sportStats: { flexDirection: 'row', marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  sportStat: { flex: 1, alignItems: 'center', gap: 2 },
  unavailableCard: { opacity: 0.72 },
  noActivity: { marginTop: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg },
  retry: { marginTop: spacing.sm, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  accountSection: { marginTop: spacing.lg, gap: spacing.sm },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  flex: { flex: 1 },
});
