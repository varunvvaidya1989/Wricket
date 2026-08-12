import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SportStageLogo } from '@/components/branding/SportStageLogo';
import { useAuth } from '@/components/providers/AuthProvider';
import { SportIcon } from '@/components/sports/SportIcon';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useGlobalProfile } from '@/hooks/useGlobalProfile';
import type { SportSummary } from '@/lib/supabase/globalProfileApi';
import { colors } from '@/lib/theme/colors';

const LOCKED_COPY = 'Profile reserved · activates at launch';

export default function SportStageDashboard() {
  const auth = useAuth();
  const router = useRouter();
  const { data } = useGlobalProfile(auth.session?.user.id);
  const fallbackSports: SportSummary[] = (auth.profile?.connectedSports ?? [])
    .filter(sport => sport.accessStatus !== 'SUSPENDED')
    .map(sport => ({ sport, available: sport.accessStatus === 'ACTIVE', headlineStats: [] }));
  const sports = data?.sports ?? fallbackSports;
  const displayName = data?.profile.displayName ?? auth.profile?.displayName ?? 'SportStage member';

  return (
    <Screen scroll padded={false}>
      <View style={styles.hero}>
        <View pointerEvents="none" style={styles.heroGlowOuter} />
        <View pointerEvents="none" style={styles.heroGlowInner} />
        <View style={styles.heroMark}>
          <SportStageLogo size={54} />
        </View>
        <Text style={styles.heroTitle}>Your sports stage</Text>
      </View>

      <View style={styles.divider} />

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
            <ProfileStat value={data?.totalMatches ?? '—'} label="MATCHES" />
            <ProfileStat value={data?.achievements ?? '—'} label="MILESTONES" />
          </View>
        </Pressable>
      ) : null}

      <Text style={styles.sectionLabel}>YOUR SPORTS</Text>
      <View style={styles.sportGrid}>
        {sports.map(summary => (
          <SportCard
            key={summary.sport.id}
            summary={summary}
            onOpen={route => router.push(route)}
          />
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

function SportCard({ summary, onOpen }: { summary: SportSummary; onOpen: (route: Href) => void }) {
  const route = summary.sport.code === 'CRICKET'
    ? '/wricket' as Href
    : summary.sport.appRoute as Href | undefined;
  const ready = summary.available && Boolean(route);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !ready }}
      disabled={!ready}
      onPress={ready ? () => onOpen(route!) : undefined}
      style={({ pressed }) => [
        styles.sportCard,
        ready ? styles.sportCardReady : styles.sportCardLocked,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.sportIcon, ready ? styles.sportIconReady : styles.sportIconLocked]}>
        <SportIcon
          code={summary.sport.code}
          size={25}
          color={ready ? colors.accentInk : colors.textDim}
        />
      </View>
      <View style={styles.sportMain}>
        <Text style={styles.sportName}>{summary.sport.name}</Text>
        <Text style={styles.sportDescription}>
          {ready ? readyDescription(summary.sport.code) : LOCKED_COPY}
        </Text>
        {ready ? <Text style={styles.sportOpen}>Open app →</Text> : null}
      </View>
      <View style={[styles.sportStatus, ready ? styles.sportStatusReady : styles.sportStatusLocked]}>
        <Text style={[styles.sportStatusText, ready ? styles.sportStatusTextReady : styles.sportStatusTextLocked]}>
          {ready ? 'READY' : 'LOCKED'}
        </Text>
      </View>
    </Pressable>
  );
}

function readyDescription(code: string) {
  if (code === 'CRICKET') return 'Wricket · tournaments, live scoring and scorecards.';
  return 'Your SportStage app is ready.';
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'S';
}

const styles = StyleSheet.create({
  hero: {
    position: 'relative',
    paddingTop: 30,
    paddingHorizontal: 18,
    paddingBottom: 30,
    overflow: 'hidden',
    alignItems: 'center',
  },
  heroGlowOuter: {
    position: 'absolute',
    top: -54,
    width: 360,
    height: 280,
    borderRadius: 180,
    backgroundColor: 'rgba(95, 227, 138, 0.045)',
  },
  heroGlowInner: {
    position: 'absolute',
    top: -18,
    width: 220,
    height: 190,
    borderRadius: 110,
    backgroundColor: 'rgba(95, 227, 138, 0.075)',
  },
  heroMark: {
    width: 56,
    height: 56,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#0C1210',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  heroTitle: {
    marginTop: 14,
    color: colors.text,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.5,
    zIndex: 2,
  },
  divider: {
    height: 1,
    marginHorizontal: 18,
    backgroundColor: colors.border,
  },
  profileCard: {
    marginTop: 20,
    marginHorizontal: 18,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  profileAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#274531',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitials: {
    color: colors.accent,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
  },
  profileIdentity: { flex: 1, minWidth: 0 },
  profileName: {
    color: colors.text,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
  },
  profileSub: {
    marginTop: 2,
    color: colors.textDim,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 9.5,
  },
  profileStats: { flexDirection: 'row', gap: 8 },
  profileStat: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  profileStatValue: {
    color: colors.text,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  profileStatLabel: {
    marginTop: 2,
    color: colors.textDim,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 8,
  },
  sectionLabel: {
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 10,
    color: colors.textDim,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 9.5,
    letterSpacing: 0.8,
  },
  sportGrid: {
    paddingHorizontal: 18,
    paddingBottom: 48,
    gap: 10,
  },
  sportCard: {
    minHeight: 76,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  sportCardReady: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(95, 227, 138, 0.07)',
  },
  sportCardLocked: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    opacity: 0.62,
  },
  sportIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportIconReady: { backgroundColor: colors.accent },
  sportIconLocked: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sportMain: { flex: 1, minWidth: 0 },
  sportName: {
    color: colors.text,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14.5,
  },
  sportDescription: {
    marginTop: 3,
    color: colors.textMuted,
    fontFamily: 'Inter_400Regular',
    fontSize: 10.5,
    lineHeight: 15,
  },
  sportOpen: {
    marginTop: 8,
    color: colors.accent,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 10,
  },
  sportStatus: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  sportStatusReady: { backgroundColor: colors.accent },
  sportStatusLocked: { borderWidth: 1, borderColor: colors.border },
  sportStatusText: {
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 8.5,
    letterSpacing: 0.4,
  },
  sportStatusTextReady: { color: '#0A1A0F' },
  sportStatusTextLocked: { color: colors.textDim },
  pressed: { opacity: 0.78 },
});
