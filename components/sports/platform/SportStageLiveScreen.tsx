import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportIcon } from '@/components/sports/SportIcon';
import { SportLiveActivityBadge } from '@/components/sports/platform/SportLiveActivityBadge';
import { SportAvatarButton } from '@/components/sports/scoring/SportProfileDrawer';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { resolveMatchFeedAccess } from '@/lib/sports/platform/matchFeedAccess';
import { RELEASED_SPORTSTAGE_SPORTS, sportStageContent } from '@/lib/sports/platform/sportLiveContent';
import {
  sportDiscoveryApi,
  type SportPublicLiveSnapshot,
  type SportUpcomingSnapshot,
} from '@/lib/supabase/sportDiscoveryApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const LIVE_PAGE_SIZE = 50;
const UPCOMING_LIMIT = 5;

export function SportStageLiveScreen({ following = false }: { following?: boolean }) {
  const auth = useAuth();
  const router = useRouter();
  const clientKey = useRef(`sportstage-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [liveItems, setLiveItems] = useState<SportPublicLiveSnapshot[]>([]);
  const [followedItems, setFollowedItems] = useState<SportPublicLiveSnapshot[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<SportUpcomingSnapshot[]>([]);
  const [selectedSport, setSelectedSport] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const isAuthenticated = Boolean(auth.session);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [general, upcoming, followed] = await Promise.all([
        sportDiscoveryApi.discover(clientKey.current, undefined, LIVE_PAGE_SIZE),
        sportDiscoveryApi.upcoming(30),
        auth.session ? sportDiscoveryApi.feed(undefined, LIVE_PAGE_SIZE) : Promise.resolve([]),
      ]);
      setLiveItems(general.filter(isLiveSnapshot));
      setUpcomingItems(upcoming);
      setFollowedItems(followed.filter(isLiveSnapshot));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Live scores are temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, [auth.session]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const liveCounts = useMemo(() => countBySport(liveItems), [liveItems]);
  const followedKeys = useMemo(() => new Set(followedItems.map(snapshotKey)), [followedItems]);
  const filteredFollowed = filterBySport(followedItems, selectedSport);
  const generalItems = liveItems.filter((item) => !isAuthenticated || !followedKeys.has(snapshotKey(item)));
  const filteredGeneral = filterBySport(sortBySportActivity(generalItems, liveCounts), selectedSport);
  const filteredUpcoming = filterBySport(upcomingItems, selectedSport).slice(0, UPCOMING_LIMIT);
  const firstName = profileFirstName(auth.profile?.displayName, auth.session?.user.email);

  const openDetails = (snapshot: SportPublicLiveSnapshot) => {
    const decision = resolveMatchFeedAccess({
      authenticated: isAuthenticated,
      connectedSports: auth.profile?.connectedSports ?? [],
      sportCode: snapshot.sportCode,
      scoringMatchId: snapshot.scoringMatchId,
    });
    if (decision.kind === 'SIGN_IN') {
      Alert.alert(
        `Sign in for ${sportStageContent(snapshot.sportCode).guestDetailLabel.toLowerCase()}`,
        'Create your SportStage account to follow the full match story.',
        [
          { text: 'Keep watching', style: 'cancel' },
          { text: 'Sign in', onPress: () => router.push('/auth') },
        ],
      );
      return;
    }
    if (decision.kind === 'UNSUPPORTED') {
      Alert.alert(decision.title, decision.message);
      return;
    }
    if (decision.kind === 'UNAVAILABLE') {
      Alert.alert(decision.title, decision.message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Explore sports', onPress: () => router.push('/apps') },
        { text: 'Manage sports', onPress: () => router.push('/account') },
      ]);
      return;
    }
    router.push(decision.route as Href);
  };

  const selectSport = (code: string) => setSelectedSport((current) => current === code ? undefined : code);
  const noLiveAnywhere = liveItems.length === 0;
  const noFilteredLive = filteredGeneral.length === 0 && (!isAuthenticated || filteredFollowed.length === 0);

  return (
    <Screen scroll padded={false}>
      <LandingHeader
        authenticated={isAuthenticated}
        title={following ? 'Following live' : isAuthenticated ? `Good ${timeOfDay()}, ${firstName}` : 'Live across every sport'}
        back={following}
        onBack={() => router.back()}
        onSignIn={() => router.push('/auth')}
      />

      {!isAuthenticated ? <GuestHero onSignIn={() => router.push('/auth')} /> : null}

      {error ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry live scores" onPress={() => void load()} style={styles.error}>
          <MaterialCommunityIcons name="cloud-alert-outline" size={20} color={colors.danger} />
          <Text variant="caption" tone="danger" style={styles.flex}>{error}</Text>
          <Text variant="overline" tone="accent">RETRY</Text>
        </Pressable>
      ) : null}

      {isAuthenticated ? (
        <View style={styles.sectionBlock}>
          <SectionHeading label={'YOUR SPORTS \u00B7 LIVE NOW'} />
          {loading && !followedItems.length ? <LoadingLine /> : filteredFollowed.length ? (
            <View style={styles.cardList}>
              {filteredFollowed.map((snapshot) => <MatchCard key={`followed:${snapshotKey(snapshot)}`} snapshot={snapshot} authenticated onOpen={() => openDetails(snapshot)} />)}
            </View>
          ) : (
            <FollowPrompt onExplore={() => router.push('/apps')} filtered={Boolean(selectedSport)} />
          )}
        </View>
      ) : null}

      <View style={styles.stripBlock}>
        {isAuthenticated ? <SectionHeading label="ELSEWHERE ON SPORTSTAGE" /> : null}
        <SportStrip counts={liveCounts} selected={selectedSport} onSelect={selectSport} />
      </View>

      {filteredGeneral.length ? (
        <View style={styles.sectionBlock}>
          <SectionHeading label={isAuthenticated ? 'LIVE ACROSS SPORTSTAGE' : 'LIVE NOW'} />
          <View style={styles.cardList}>
            {filteredGeneral.map((snapshot) => <MatchCard key={snapshotKey(snapshot)} snapshot={snapshot} authenticated={isAuthenticated} onOpen={() => openDetails(snapshot)} />)}
          </View>
        </View>
      ) : null}

      {loading && !liveItems.length ? <LoadingNetwork /> : null}

      <View style={[styles.sectionBlock, noLiveAnywhere && styles.promotedUpcoming]}>
        <SectionHeading
          label="STARTING SOON"
          explanation={noLiveAnywhere
            ? "Nothing live right now - here's what's next."
            : selectedSport && noFilteredLive
              ? `No ${sportStageContent(selectedSport).name} match is live - here's what's next.`
              : undefined}
        />
        {filteredUpcoming.length ? (
          <View style={styles.upcomingList}>
            {filteredUpcoming.map((item) => <UpcomingCard key={item.discoveryId} item={item} />)}
          </View>
        ) : !loading ? <UpcomingEmpty selectedSport={selectedSport} /> : null}
      </View>
    </Screen>
  );
}

function LandingHeader({ authenticated, title, back, onBack, onSignIn }: {
  authenticated: boolean; title: string; back: boolean; onBack: () => void; onSignIn: () => void;
}) {
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={styles.headerCopy}>
        <Text style={styles.headerEyebrow}>SPORTSTAGE NOW</Text>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {authenticated ? <SportAvatarButton compact /> : (
        <Pressable accessibilityRole="button" accessibilityLabel="Sign in to SportStage" onPress={onSignIn} style={styles.signInButton}>
          <MaterialCommunityIcons name="login" size={15} color={colors.text} />
          <Text style={styles.signInText}>SIGN IN</Text>
        </Pressable>
      )}
    </View>
  );
}

function GuestHero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <View style={styles.hero}>
      <View pointerEvents="none" style={styles.heroGlow} />
      <View style={styles.liveNetwork}><View style={styles.liveDotSmall} /><Text style={styles.liveNetworkText}>LIVE NETWORK</Text></View>
      <Text style={styles.heroTitle}>Every sport, One Stage</Text>
      <Text style={styles.heroCopy}>Scores, stories, and the next match worth watching, all in one place.</Text>
      <Pressable accessibilityRole="button" onPress={onSignIn} style={({ pressed }) => [styles.heroCta, pressed && styles.pressed]}>
        <Text style={styles.heroCtaText}>Sign in to follow every match.</Text>
      </Pressable>
    </View>
  );
}

function SportStrip({ counts, selected, onSelect }: {
  counts: ReadonlyMap<string, number>; selected?: string; onSelect: (code: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sportStrip}>
      {RELEASED_SPORTSTAGE_SPORTS.map((sport) => {
        const count = counts.get(sport.code) ?? 0;
        const active = selected === sport.code;
        return (
          <Pressable
            key={sport.code}
            accessibilityRole="button"
            accessibilityLabel={`${sport.name}, ${count ? `${count} live` : 'none live'}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(sport.code)}
            style={({ pressed }) => [styles.sportChip, count > 0 && styles.sportChipLive, active && styles.sportChipSelected, pressed && styles.pressed]}
          >
            <SportIcon code={sport.code} size={21} color={count > 0 ? colors.text : colors.textDim} />
            <Text style={[styles.sportChipName, !count && styles.sportChipMuted]}>{sport.name}</Text>
            <SportLiveActivityBadge count={count} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function MatchCard({ snapshot, authenticated, onOpen }: {
  snapshot: SportPublicLiveSnapshot; authenticated: boolean; onOpen: () => void;
}) {
  const content = sportStageContent(snapshot.sportCode);
  return (
    <View style={styles.matchCard}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${snapshot.participantA} versus ${snapshot.participantB}`} onPress={onOpen}>
        <View style={styles.matchTop}>
          <View style={styles.matchSportIcon}><SportIcon code={snapshot.sportCode} size={17} color={colors.accent} /></View>
          <View style={styles.matchCompetition}>
            <Text style={styles.matchSport}>{content.name.toUpperCase()}</Text>
            <Text style={styles.matchCompetitionName}>{snapshot.competitionName}</Text>
          </View>
          <LiveStatus />
        </View>
        <View style={styles.matchScore}>
          <View style={styles.teamLine}><Text style={styles.teamName}>{snapshot.participantA}</Text></View>
          <View style={styles.versusLine}><Text style={styles.versusText}>VS</Text></View>
          <View style={styles.teamLine}><Text style={styles.teamName}>{snapshot.participantB}</Text></View>
          <View style={styles.scoreLine}>
            <Text style={styles.scoreLabel}>CURRENT SCORE</Text>
            <Text style={styles.scoreValue}>{snapshot.headlineScore}</Text>
          </View>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.gateRow, pressed && styles.pressed]}>
        {authenticated ? (
          <Text style={styles.openScorecard}>{'Open live scorecard \u2192'}</Text>
        ) : (
          <>
            <View style={styles.gateLabel}>
              <MaterialCommunityIcons name="lock-outline" size={15} color={colors.textMuted} />
              <Text style={styles.gateText}>{content.guestDetailLabel}</Text>
            </View>
            <Text style={styles.gateGo}>{'SIGN IN \u2192'}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function LiveStatus() {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  return (
    <View style={styles.liveStatus}>
      <Animated.View style={[styles.liveDotSmall, { opacity: pulse }]} />
      <Text style={styles.liveStatusText}>LIVE</Text>
    </View>
  );
}

function UpcomingCard({ item }: { item: SportUpcomingSnapshot }) {
  const content = sportStageContent(item.sportCode);
  const starts = new Date(item.scheduledAt);
  return (
    <View style={styles.upcomingCard}>
      <View style={styles.upcomingIcon}><SportIcon code={item.sportCode} size={18} color={colors.gold} /></View>
      <View style={styles.upcomingMain}>
        <Text style={styles.upcomingMeta}>{content.name.toUpperCase()}  /  {item.competitionName.toUpperCase()}</Text>
        <Text style={styles.upcomingTeams}>{item.participantA} vs {item.participantB}</Text>
        {item.venue ? <View style={styles.venueLine}><MaterialCommunityIcons name="map-marker-outline" size={13} color={colors.textDim} /><Text style={styles.upcomingVenue}>{item.venue}</Text></View> : null}
      </View>
      <View style={styles.upcomingTime}>
        <Text style={styles.upcomingDay}>{starts.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase()}</Text>
        <Text style={styles.upcomingClock}>{starts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    </View>
  );
}

function FollowPrompt({ onExplore, filtered }: { onExplore: () => void; filtered: boolean }) {
  return (
    <View style={styles.followPrompt}>
      <View style={styles.promptIcon}><MaterialCommunityIcons name="heart-plus-outline" size={20} color={colors.accent} /></View>
      <View style={styles.flex}>
        <Text style={styles.promptTitle}>{filtered ? 'Nothing followed in this sport yet' : 'Make this stage yours'}</Text>
        <Text style={styles.promptCopy}>Follow a club, player, or competition and their live matches will lead this page.</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onExplore}><Text style={styles.promptAction}>EXPLORE</Text></Pressable>
    </View>
  );
}

function UpcomingEmpty({ selectedSport }: { selectedSport?: string }) {
  return (
    <View style={styles.upcomingEmpty}>
      <MaterialCommunityIcons name="calendar-clock" size={25} color={colors.textDim} />
      <View style={styles.flex}>
        <Text style={styles.promptTitle}>No start times announced</Text>
        <Text style={styles.promptCopy}>{selectedSport ? `${sportStageContent(selectedSport).name} schedules will appear here when confirmed.` : 'Confirmed fixtures will appear here as soon as their start times are announced.'}</Text>
      </View>
    </View>
  );
}

function SectionHeading({ label, explanation }: { label: string; explanation?: string }) {
  return <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>{label}</Text>{explanation ? <Text style={styles.sectionExplanation}>{explanation}</Text> : null}</View>;
}

function LoadingLine() {
  return <View style={styles.loadingLine}><ActivityIndicator size="small" color={colors.accent} /><Text style={styles.loadingText}>Finding your matches...</Text></View>;
}

function LoadingNetwork() {
  return <View style={styles.loadingNetwork}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>Loading the live stage...</Text></View>;
}

function isLiveSnapshot(snapshot: SportPublicLiveSnapshot): boolean {
  return snapshot.status === 'LIVE';
}

function snapshotKey(snapshot: SportPublicLiveSnapshot): string {
  return `${snapshot.sportCode}:${snapshot.scoringMatchId}`;
}

function countBySport(items: readonly SportPublicLiveSnapshot[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.sportCode, (counts.get(item.sportCode) ?? 0) + 1);
  return counts;
}

function filterBySport<T extends { sportCode: string }>(items: readonly T[], sportCode?: string): T[] {
  return sportCode ? items.filter((item) => item.sportCode === sportCode) : [...items];
}

function sortBySportActivity(items: readonly SportPublicLiveSnapshot[], counts: ReadonlyMap<string, number>): SportPublicLiveSnapshot[] {
  return [...items].sort((left, right) => {
    const activity = (counts.get(right.sportCode) ?? 0) - (counts.get(left.sportCode) ?? 0);
    return activity || Date.parse(right.refreshedAt) - Date.parse(left.refreshedAt);
  });
}

function profileFirstName(displayName?: string, email?: string): string {
  return displayName?.trim().split(/\s+/)[0] || email?.split('@')[0] || 'there';
}

function timeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const styles = StyleSheet.create({
  header: { minHeight: 66, paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: { color: colors.textDim, fontFamily: 'IBMPlexMono_400Regular', fontSize: 9, letterSpacing: 1 },
  headerTitle: { marginTop: 3, color: colors.text, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 19, lineHeight: 24 },
  backButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  signInButton: { minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
  signInText: { color: colors.text, fontFamily: 'IBMPlexMono_500Medium', fontSize: 9.5, letterSpacing: 0.4 },
  hero: { marginHorizontal: spacing.lg, marginTop: 2, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: '#101712', overflow: 'hidden' },
  heroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -90, top: -110, backgroundColor: 'rgba(95,227,138,0.10)' },
  liveNetwork: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  liveNetworkText: { color: colors.live, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 9, letterSpacing: 0.8 },
  heroTitle: { marginTop: spacing.md, color: colors.text, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 25, lineHeight: 30, letterSpacing: -0.5 },
  heroCopy: { marginTop: 5, maxWidth: 480, color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  heroCta: { minHeight: 42, marginTop: 14, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  heroCtaText: { color: '#0A1A0F', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12.5 },
  error: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stripBlock: { paddingTop: 14 },
  sportStrip: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  sportChip: { minWidth: 64, minHeight: 76, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', gap: 5 },
  sportChipLive: { borderColor: colors.live },
  sportChipSelected: { backgroundColor: colors.accentMuted },
  sportChipName: { color: colors.text, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 10.5 },
  sportChipMuted: { color: colors.textDim },
  sectionBlock: { paddingTop: spacing.xl },
  promotedUpcoming: { paddingTop: spacing.lg },
  sectionHeading: { paddingHorizontal: spacing.lg, paddingBottom: 10, gap: 4 },
  sectionLabel: { color: colors.textDim, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 9.5, letterSpacing: 0.9 },
  sectionExplanation: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  cardList: { paddingHorizontal: spacing.lg, gap: spacing.md },
  matchCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  matchTop: { minHeight: 56, paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 9 },
  matchSportIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  matchCompetition: { flex: 1, minWidth: 0 },
  matchSport: { color: colors.textDim, fontFamily: 'IBMPlexMono_500Medium', fontSize: 8, letterSpacing: 0.6 },
  matchCompetitionName: { marginTop: 2, color: colors.text, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 11.5, lineHeight: 16 },
  liveStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveStatusText: { color: colors.live, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 8, letterSpacing: 0.7 },
  matchScore: { paddingHorizontal: 13, paddingVertical: spacing.md },
  teamLine: { minHeight: 28, justifyContent: 'center' },
  teamName: { color: colors.text, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13.5, lineHeight: 19, flexShrink: 1 },
  versusLine: { height: 16, justifyContent: 'center' },
  versusText: { color: colors.textDim, fontFamily: 'IBMPlexMono_500Medium', fontSize: 8 },
  scoreLine: { marginTop: spacing.sm, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  scoreLabel: { color: colors.textDim, fontFamily: 'IBMPlexMono_500Medium', fontSize: 8.5, letterSpacing: 0.5 },
  scoreValue: { flexShrink: 1, color: colors.gold, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, textAlign: 'right', fontVariant: ['tabular-nums'] },
  gateRow: { minHeight: 44, paddingHorizontal: 13, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  gateLabel: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  gateText: { flexShrink: 1, color: colors.textMuted, fontFamily: 'IBMPlexMono_500Medium', fontSize: 9.5 },
  gateGo: { color: colors.accent, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 9.5 },
  openScorecard: { flex: 1, color: colors.accent, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 9.5, textAlign: 'right' },
  upcomingList: { marginHorizontal: spacing.lg, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  upcomingCard: { minHeight: 74, paddingHorizontal: spacing.md, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  upcomingIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  upcomingMain: { flex: 1, minWidth: 0 },
  upcomingMeta: { color: colors.textDim, fontFamily: 'IBMPlexMono_500Medium', fontSize: 7.5, lineHeight: 11 },
  upcomingTeams: { marginTop: 3, color: colors.text, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12.5, lineHeight: 17 },
  venueLine: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 3 },
  upcomingVenue: { flex: 1, color: colors.textDim, fontFamily: 'Inter_400Regular', fontSize: 9.5 },
  upcomingTime: { alignItems: 'flex-end', gap: 2 },
  upcomingDay: { color: colors.gold, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 9 },
  upcomingClock: { color: colors.textMuted, fontFamily: 'IBMPlexMono_400Regular', fontSize: 9 },
  followPrompt: { marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  promptIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  promptTitle: { color: colors.text, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12.5 },
  promptCopy: { marginTop: 2, color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 10.5, lineHeight: 15 },
  promptAction: { color: colors.accent, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 9 },
  upcomingEmpty: { marginHorizontal: spacing.lg, minHeight: 82, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  loadingLine: { marginHorizontal: spacing.lg, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loadingNetwork: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11 },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.74 },
});
