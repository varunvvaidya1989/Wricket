import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { Redirect, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { SportStageLogo } from '@/components/branding/SportStageLogo';
import { useAuth } from '@/components/providers/AuthProvider';
import { SportIcon } from '@/components/sports/SportIcon';
import { SportLiveActivityBadge } from '@/components/sports/platform/SportLiveActivityBadge';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useGlobalProfile } from '@/hooks/useGlobalProfile';
import { useSportStageDashboardActivity } from '@/hooks/useSportStageDashboardActivity';
import { orderSportSummaries, sportLaunchDescription } from '@/lib/sports/platform/sportDashboard';
import type { SportSummary } from '@/lib/supabase/globalProfileApi';
import { colors } from '@/lib/theme/colors';

export default function SportStageDashboard() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { data } = useGlobalProfile(auth.session?.user.id);
  const activity = useSportStageDashboardActivity(pathname !== '/' && Boolean(auth.session));
  const fallbackSports: SportSummary[] = (auth.profile?.connectedSports ?? [])
    .filter((sport) => sport.accessStatus !== 'SUSPENDED')
    .map((sport) => ({ sport, available: true, headlineStats: [] }));
  const sports = data?.sports ?? fallbackSports;
  const launchableSports = sports.filter(
    (summary) => sportLaunchDescription(summary.sport.code) && sportRoute(summary),
  );
  const orderedSports = orderSportSummaries(launchableSports, activity.profileMatchCounts);
  const columnCount = width < 350 ? 1 : 2;
  const sportRows = chunk(orderedSports.sports, columnCount);
  const displayName = data?.profile.displayName ?? auth.profile?.displayName ?? 'SportStage member';

  if (pathname === '/') return <Redirect href="/live" />;

  return (
    <Screen scroll padded={false}>
      <View style={styles.hero}>
        <View pointerEvents="none" style={styles.heroGlowOuter} />
        <View pointerEvents="none" style={styles.heroGlowInner} />
        <View style={styles.heroMark}><SportStageLogo size={54} /></View>
        <Text style={styles.heroTitle}>Your sports stage</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.networkActions}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/live')} style={styles.networkAction}>
          <MaterialCommunityIcons name="access-point" size={21} color={colors.live} />
          <View style={styles.sportMain}>
            <Text style={styles.networkTitle}>Live network</Text>
            <Text style={styles.networkCopy}>Scores across every sport</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textDim} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/notifications')} style={styles.networkAction}>
          <MaterialCommunityIcons name="bell-outline" size={21} color={colors.gold} />
          <View style={styles.sportMain}>
            <Text style={styles.networkTitle}>Notifications</Text>
            <Text style={styles.networkCopy}>Invites, schedules and results</Text>
          </View>
          <View style={styles.actionTail}>
            {activity.unreadCount > 0 ? (
              <View accessibilityLabel={`${activity.unreadCount} unread notifications`} style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {activity.unreadCount > 99 ? '99+' : activity.unreadCount}
                </Text>
              </View>
            ) : null}
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textDim} />
          </View>
        </Pressable>
      </View>

      {auth.session ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Global Profile"
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.profileCard, pressed && styles.pressed]}
        >
          <View style={styles.profileTop}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileInitials}>{initials(displayName)}</Text>
            </View>
            <View style={styles.profileIdentity}>
              <Text numberOfLines={1} style={styles.profileName}>{displayName}</Text>
              <Text style={styles.profileSub}>GLOBAL PROFILE</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={21} color={colors.textDim} />
          </View>
          <View style={styles.profileStats}>
            <ProfileStat value={data?.activeSports ?? sports.length} label="SPORTS" />
            <ProfileStat value={data?.totalMatches ?? '\u2014'} label="MATCHES" />
            <ProfileStat value={data?.achievements ?? '\u2014'} label="MILESTONES" />
          </View>
        </Pressable>
      ) : null}

      <Text style={styles.sectionLabel}>YOUR SPORTS</Text>
      <View style={styles.sportGrid}>
        {sportRows.map((row, rowIndex) => (
          <View key={row.map((summary) => summary.sport.id).join(':')} style={styles.sportRow}>
            {row.map((summary) => (
              <SportCard
                key={summary.sport.id}
                summary={summary}
                liveCount={activity.liveCounts.get(summary.sport.code) ?? 0}
                primary={summary.sport.id === orderedSports.primarySportId}
                onOpen={(route) => router.push(route)}
              />
            ))}
            {columnCount === 2 && row.length === 1 ? (
              <View key={`spacer-${rowIndex}`} style={styles.sportCardSpacer} />
            ) : null}
          </View>
        ))}
      </View>
    </Screen>
  );
}

function ProfileStat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.profileStat}>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

function SportCard({ summary, liveCount, primary, onOpen }: {
  summary: SportSummary;
  liveCount: number;
  primary: boolean;
  onOpen: (route: Href) => void;
}) {
  const route = sportRoute(summary);
  const description = sportLaunchDescription(summary.sport.code);
  if (!route || !description) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${summary.sport.name}`}
      onPress={() => onOpen(route)}
      style={({ pressed }) => [styles.sportCard, primary && styles.sportCardPrimary, pressed && styles.pressed]}
    >
      {primary ? <View pointerEvents="none" style={styles.primaryGlow} /> : null}
      <View style={styles.sportCardTop}>
        <View style={styles.sportIcon}>
          <SportIcon code={summary.sport.code} size={22} color={colors.accentInk} />
        </View>
        <SportLiveActivityBadge count={liveCount} appearance="card" />
      </View>
      <Text style={styles.sportName}>{summary.sport.name}</Text>
      <Text style={styles.sportDescription}>{description}</Text>
      <View style={styles.sportCardFill} />
      <Text style={styles.sportOpen}>{`Open \u2192`}</Text>
    </Pressable>
  );
}

function sportRoute(summary: SportSummary): Href | undefined {
  if (summary.sport.code === 'CRICKET') return '/wricket/live';
  return summary.sport.appRoute as Href | undefined;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'S';
}

const styles = StyleSheet.create({
  hero: { position: 'relative', paddingTop: 30, paddingHorizontal: 18, paddingBottom: 30, overflow: 'hidden', alignItems: 'center' },
  heroGlowOuter: { position: 'absolute', top: -54, width: 360, height: 280, borderRadius: 180, backgroundColor: 'rgba(95, 227, 138, 0.045)' },
  heroGlowInner: { position: 'absolute', top: -18, width: 220, height: 190, borderRadius: 110, backgroundColor: 'rgba(95, 227, 138, 0.075)' },
  heroMark: { width: 56, height: 56, borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: '#0C1210', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  heroTitle: { marginTop: 14, color: colors.text, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 27, lineHeight: 30, letterSpacing: -0.5, zIndex: 2 },
  divider: { height: 1, marginHorizontal: 18, backgroundColor: colors.border },
  networkActions: { paddingHorizontal: 18, paddingTop: 18, gap: 8 },
  networkAction: { minHeight: 58, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12 },
  networkTitle: { color: colors.text, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13.5 },
  networkCopy: { marginTop: 2, color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 10.5 },
  actionTail: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notificationBadge: { minWidth: 18, height: 18, borderRadius: 999, paddingHorizontal: 5, backgroundColor: colors.live, alignItems: 'center', justifyContent: 'center' },
  notificationBadgeText: { color: colors.text, fontFamily: 'IBMPlexMono_500Medium', fontSize: 9, fontVariant: ['tabular-nums'] },
  profileCard: { marginTop: 20, marginHorizontal: 18, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  profileAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#274531', alignItems: 'center', justifyContent: 'center' },
  profileInitials: { color: colors.accent, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15 },
  profileIdentity: { flex: 1, minWidth: 0 },
  profileName: { color: colors.text, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15 },
  profileSub: { marginTop: 2, color: colors.textDim, fontFamily: 'IBMPlexMono_400Regular', fontSize: 9.5 },
  profileStats: { flexDirection: 'row', gap: 8 },
  profileStat: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, alignItems: 'center' },
  profileStatValue: { color: colors.text, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, fontVariant: ['tabular-nums'] },
  profileStatLabel: { marginTop: 2, color: colors.textDim, fontFamily: 'IBMPlexMono_400Regular', fontSize: 8 },
  sectionLabel: { paddingTop: 20, paddingHorizontal: 18, paddingBottom: 10, color: colors.textDim, fontFamily: 'IBMPlexMono_400Regular', fontSize: 9.5, letterSpacing: 0.8 },
  sportGrid: { paddingHorizontal: 16, paddingBottom: 48, gap: 10 },
  sportRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  sportCard: { position: 'relative', flex: 1, minWidth: 0, minHeight: 166, overflow: 'hidden', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  sportCardPrimary: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  sportCardSpacer: { flex: 1 },
  primaryGlow: { position: 'absolute', top: -38, right: -34, width: 118, height: 118, borderRadius: 59, backgroundColor: 'rgba(95, 227, 138, 0.10)' },
  sportCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  sportIcon: { width: 36, height: 36, borderRadius: 10, flexShrink: 0, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sportName: { marginTop: 12, color: colors.text, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14.5, lineHeight: 18 },
  sportDescription: { marginTop: 4, color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 10.5, lineHeight: 14 },
  sportCardFill: { flex: 1, minHeight: 8 },
  sportOpen: { marginTop: 8, color: colors.accent, fontFamily: 'IBMPlexMono_500Medium', fontSize: 10 },
  sportMain: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.78 },
});
