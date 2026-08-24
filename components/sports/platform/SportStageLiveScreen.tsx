import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportIcon } from '@/components/sports/SportIcon';
import { SportLiveActivityBadge } from '@/components/sports/platform/SportLiveActivityBadge';
import { SportAvatarButton } from '@/components/sports/scoring/SportProfileDrawer';
import { TournamentLogo } from '@/components/wricket/tournament/TournamentLogo';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import { resolveMatchFeedAccess } from '@/lib/sports/platform/matchFeedAccess';
import { appendLiveSnapshots } from '@/lib/sports/platform/livePagination';
import { RELEASED_SPORTSTAGE_SPORTS, sportStageContent } from '@/lib/sports/platform/sportLiveContent';
import {
  sportDiscoveryApi,
  type CricketTournamentInsight,
  type SportLiveCursor,
  type SportPublicLiveSnapshot,
  type SportUpcomingSnapshot,
} from '@/lib/supabase/sportDiscoveryApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const LIVE_PAGE_SIZE = 8;
const UPCOMING_LIMIT = 5;

export function SportStageLiveScreen({ following = false }: { following?: boolean }) {
  const auth = useAuth();
  const router = useRouter();
  const [liveItems, setLiveItems] = useState<SportPublicLiveSnapshot[]>([]);
  const [liveCursor, setLiveCursor] = useState<SportLiveCursor>();
  const [liveHasMore, setLiveHasMore] = useState(false);
  const [loadingMoreLive, setLoadingMoreLive] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string>();
  const [followedItems, setFollowedItems] = useState<SportPublicLiveSnapshot[]>([]);
  const [followedUpcomingItems, setFollowedUpcomingItems] = useState<SportUpcomingSnapshot[]>([]);
  const [cricketTournamentInsights, setCricketTournamentInsights] = useState<CricketTournamentInsight[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<SportUpcomingSnapshot[]>([]);
  const [selectedSport, setSelectedSport] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const isAuthenticated = Boolean(auth.session);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [generalPage, upcoming, followed, tournamentInsights] = await Promise.all([
        sportDiscoveryApi.discoverPage(undefined, LIVE_PAGE_SIZE),
        sportDiscoveryApi.upcoming(30),
        auth.session ? sportDiscoveryApi.feed(undefined, LIVE_PAGE_SIZE) : Promise.resolve([]),
        auth.session ? sportDiscoveryApi.cricketTournamentInsights() : Promise.resolve([]),
      ]);
      setLiveItems(generalPage.items.filter(isLiveSnapshot));
      setLiveCursor(generalPage.nextCursor);
      setLiveHasMore(generalPage.hasMore);
      setLoadMoreError(undefined);
      setUpcomingItems(sortUpcoming(upcoming));
      setFollowedItems(followed.filter(isLiveSnapshot));
      setFollowedUpcomingItems(auth.session ? await sportDiscoveryApi.followedUpcoming(upcoming) : []);
      setCricketTournamentInsights(tournamentInsights);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Live scores are temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, [auth.session]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const loadMoreLive = useCallback(async () => {
    if (!liveCursor || !liveHasMore || loadingMoreLive) return;
    setLoadingMoreLive(true);
    setLoadMoreError(undefined);
    try {
      const page = await sportDiscoveryApi.discoverPage(liveCursor, LIVE_PAGE_SIZE);
      setLiveItems(current => appendLiveSnapshots(current, page.items.filter(isLiveSnapshot)));
      setLiveCursor(page.nextCursor);
      setLiveHasMore(page.hasMore);
    } catch (cause) {
      setLoadMoreError(cause instanceof Error ? cause.message : 'More live matches could not be loaded.');
    } finally {
      setLoadingMoreLive(false);
    }
  }, [liveCursor, liveHasMore, loadingMoreLive]);

  const liveCounts = useMemo(() => countBySport(liveItems), [liveItems]);
  const followedKeys = useMemo(() => new Set(followedItems.map(snapshotKey)), [followedItems]);
  const filteredFollowed = filterBySport(followedItems, selectedSport);
  const filteredFollowedUpcoming = filterBySport(followedUpcomingItems, selectedSport);
  const visibleCricketInsights = !selectedSport || selectedSport === 'CRICKET' ? cricketTournamentInsights : [];
  const generalItems = liveItems.filter((item) => !isAuthenticated || !followedKeys.has(snapshotKey(item)));
  const filteredGeneral = filterBySport(sortBySportActivity(generalItems, liveCounts), selectedSport);
  const filteredUpcoming = sortUpcoming(filterBySport(upcomingItems, selectedSport)).slice(0, UPCOMING_LIMIT);
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

  const openCompetition = (sportCode: string, competitionId: string) => {
    const route = competitionRoute(sportCode, competitionId);
    if (!route) {
      Alert.alert('Tournament page unavailable', 'This match is not linked to a tournament page yet.');
      return;
    }
    if (sportCode === 'CRICKET') {
      router.push(route as Href);
      return;
    }
    if (!isAuthenticated) {
      router.push({ pathname: '/auth', params: { returnTo: route } });
      return;
    }
    if (!hasSportAccess(auth.profile?.connectedSports ?? [], sportCode)) {
      Alert.alert(`${sportStageContent(sportCode).name} app unavailable`, `Add ${sportStageContent(sportCode).name} to your SportStage account before opening this competition.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose sports', onPress: () => router.push('/apps') },
      ]);
      return;
    }
    router.push(route as Href);
  };

  const openSportApp = (sportCode: string) => {
    const route = sportHomeRoute(sportCode);
    if (!route) return;
    if (!isAuthenticated) {
      router.push({ pathname: '/auth', params: { returnTo: route } });
      return;
    }
    if (!hasSportAccess(auth.profile?.connectedSports ?? [], sportCode)) {
      Alert.alert(`${sportStageContent(sportCode).name} app unavailable`, `Add ${sportStageContent(sportCode).name} to your SportStage account first.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose sports', onPress: () => router.push('/apps') },
      ]);
      return;
    }
    router.push(route as Href);
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
          <SectionHeading label="YOUR SPORTS" />
          {loading && !followedItems.length && !followedUpcomingItems.length && !cricketTournamentInsights.length ? <LoadingLine /> : filteredFollowed.length || filteredFollowedUpcoming.length || visibleCricketInsights.length ? (<>
            {filteredFollowed.length ? <LiveMatchRail items={filteredFollowed} authenticated onOpen={openDetails} onOpenCompetition={snapshot => snapshot.competitionId ? openCompetition(snapshot.sportCode, snapshot.competitionId) : undefined} keyPrefix="followed" /> : null}
            {filteredFollowedUpcoming.length ? <View style={styles.followedUpcoming}>
              <Text style={styles.insightLabel}>NEXT FROM YOUR FOLLOWS</Text>
              <View style={styles.upcomingList}>{filteredFollowedUpcoming.slice(0, 3).map(item => <UpcomingCard key={`followed:${item.discoveryId}`} item={item} onOpen={() => openCompetition(item.sportCode, item.competitionId)} />)}</View>
            </View> : null}
            {visibleCricketInsights.length ? <TournamentInsightRail items={visibleCricketInsights} onOpen={item => openCompetition('CRICKET', item.id)} /> : null}
          </>) : (
            <FollowPrompt onExplore={() => router.push('/apps')} filtered={Boolean(selectedSport)} />
          )}
        </View>
      ) : null}

      <View style={styles.stripBlock}>
        {isAuthenticated ? <SectionHeading label="ELSEWHERE ON SPORTSTAGE" /> : null}
        <SportStrip counts={liveCounts} selected={selectedSport} onSelect={selectSport} onOpenSport={openSportApp} />
      </View>

      {filteredGeneral.length || liveHasMore ? (
        <View style={styles.sectionBlock}>
          <SectionHeading label={isAuthenticated ? 'LIVE ACROSS SPORTSTAGE' : 'LIVE NOW'} />
          {filteredGeneral.length ? <LiveMatchRail items={filteredGeneral} authenticated={isAuthenticated} onOpen={openDetails} onOpenCompetition={snapshot => snapshot.competitionId ? openCompetition(snapshot.sportCode, snapshot.competitionId) : undefined} keyPrefix="general" /> : (
            <Text style={styles.paginationHint}>No {selectedSport ? sportStageContent(selectedSport).name.toLowerCase() : 'additional'} match in this page. Check the next page for more.</Text>
          )}
          {liveHasMore ? <Pressable accessibilityRole="button" accessibilityLabel="Load more live matches" disabled={loadingMoreLive} onPress={() => void loadMoreLive()} style={({ pressed }) => [styles.loadMoreLive, pressed && styles.pressed, loadingMoreLive && styles.loadMoreDisabled]}>
            {loadingMoreLive ? <LoadingPageLabel /> : <><Text style={styles.loadMoreText}>LOAD MORE LIVE MATCHES</Text><MaterialCommunityIcons name="arrow-right" size={15} color={colors.accent} /></>}
          </Pressable> : null}
          {loadMoreError ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading more live matches" onPress={() => void loadMoreLive()}><Text style={styles.loadMoreError}>{loadMoreError} Tap to retry.</Text></Pressable> : null}
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
            {filteredUpcoming.map((item) => <UpcomingCard key={item.discoveryId} item={item} onOpen={() => openCompetition(item.sportCode, item.competitionId)} />)}
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

function SportStrip({ counts, selected, onSelect, onOpenSport }: {
  counts: ReadonlyMap<string, number>; selected?: string; onSelect: (code: string) => void; onOpenSport: (code: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sportStrip}>
      {RELEASED_SPORTSTAGE_SPORTS.map((sport) => {
        const count = counts.get(sport.code) ?? 0;
        const active = selected === sport.code;
        return (
          <View
            key={sport.code}
            style={[styles.sportChip, count > 0 && styles.sportChipLive, active && styles.sportChipSelected]}
          >
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${sport.name} app`} onPress={() => onOpenSport(sport.code)} hitSlop={5} style={({ pressed }) => [styles.sportIconRoute, pressed && styles.pressed]}>
              <SportIcon code={sport.code} size={21} color={count > 0 ? colors.text : colors.textDim} />
              <MaterialCommunityIcons name="arrow-top-right" size={10} color={colors.textDim} style={styles.sportRouteArrow} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Filter by ${sport.name}, ${count ? `${count} live` : 'none live'}`} accessibilityState={{ selected: active }} onPress={() => onSelect(sport.code)} style={({ pressed }) => [styles.sportFilter, pressed && styles.pressed]}>
              <Text style={[styles.sportChipName, !count && styles.sportChipMuted]}>{sport.name}</Text>
              <SportLiveActivityBadge count={count} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

function LiveMatchRail({ items, authenticated, onOpen, onOpenCompetition, keyPrefix }: {
  items: readonly SportPublicLiveSnapshot[];
  authenticated: boolean;
  onOpen: (snapshot: SportPublicLiveSnapshot) => void;
  onOpenCompetition: (snapshot: SportPublicLiveSnapshot) => void;
  keyPrefix: string;
}) {
  const { width } = useWindowDimensions();
  if (items.length === 1) return <View style={styles.cardList}><MatchCard snapshot={items[0]} authenticated={authenticated} onOpen={() => onOpen(items[0])} onOpenCompetition={items[0].competitionId ? () => onOpenCompetition(items[0]) : undefined} /></View>;
  const cardWidth = Math.min(420, Math.max(280, width - spacing.lg * 2 - 24));
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + spacing.md} decelerationRate="fast" contentContainerStyle={styles.liveRail}>
    {items.map(snapshot => <View key={`${keyPrefix}:${snapshotKey(snapshot)}`} style={{ width: cardWidth }}><MatchCard snapshot={snapshot} authenticated={authenticated} onOpen={() => onOpen(snapshot)} onOpenCompetition={snapshot.competitionId ? () => onOpenCompetition(snapshot) : undefined} /></View>)}
  </ScrollView>;
}

function TournamentInsightRail({ items, onOpen }: {
  items: readonly CricketTournamentInsight[];
  onOpen: (item: CricketTournamentInsight) => void;
}) {
  return <View style={styles.tournamentInsights}>
    <Text style={styles.insightLabel}>YOUR CRICKET TOURNAMENTS</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tournamentInsightRail}>
      {items.map(item => {
        const starts = new Date(item.startAt);
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open ${item.name}`} onPress={() => onOpen(item)} style={({ pressed }) => [styles.tournamentInsightCard, pressed && styles.pressed]}>
          <TournamentLogo name={item.name} uri={item.logoUrl} size={42} />
          <View style={styles.flex}><Text style={styles.tournamentInsightName} numberOfLines={2}>{item.name}</Text><Text style={styles.tournamentRelationship}>{relationshipCopy(item.relationship)}</Text><Text style={styles.tournamentInsightMeta} numberOfLines={1}>{Number.isNaN(starts.getTime()) ? 'Schedule pending' : starts.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}{item.location ? ` / ${item.location}` : ''}</Text></View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textDim} />
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

function MatchCard({ snapshot, authenticated, onOpen, onOpenCompetition }: {
  snapshot: SportPublicLiveSnapshot; authenticated: boolean; onOpen: () => void; onOpenCompetition?: () => void;
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
      <View style={styles.matchActions}>
        {onOpenCompetition ? <Pressable accessibilityRole="button" accessibilityLabel={`Open ${snapshot.competitionName}`} onPress={onOpenCompetition} style={({ pressed }) => [styles.matchAction, pressed && styles.pressed]}><MaterialCommunityIcons name="trophy-outline" size={14} color={colors.gold} /><Text style={styles.competitionAction}>TOURNAMENT</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={authenticated ? `Open live feed for ${snapshot.participantA} versus ${snapshot.participantB}` : `Sign in for ${content.guestDetailLabel}`} onPress={onOpen} style={({ pressed }) => [styles.matchAction, styles.feedAction, pressed && styles.pressed]}>{!authenticated ? <MaterialCommunityIcons name="lock-outline" size={14} color={colors.textMuted} /> : null}<Text style={styles.openScorecard}>{authenticated ? 'LIVE FEED \u2192' : 'SIGN IN \u2192'}</Text></Pressable>
      </View>
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

function UpcomingCard({ item, onOpen }: { item: SportUpcomingSnapshot; onOpen: () => void }) {
  const content = sportStageContent(item.sportCode);
  const starts = new Date(item.scheduledAt);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.competitionName}`} onPress={onOpen} style={({ pressed }) => [styles.upcomingCard, pressed && styles.pressed]}>
      <View style={styles.upcomingIcon}><SportIcon code={item.sportCode} size={18} color={colors.gold} /></View>
      <View style={styles.upcomingMain}>
        <Text style={styles.upcomingMeta}>{content.name.toUpperCase()}  /  {item.competitionName.toUpperCase()}</Text>
        <Text style={styles.upcomingTeams}>{item.participantA} vs {item.participantB}</Text>
        {item.venue ? <View style={styles.venueLine}><MaterialCommunityIcons name="map-marker-outline" size={13} color={colors.textDim} /><Text style={styles.upcomingVenue}>{item.venue}</Text></View> : null}
      </View>
      <View style={styles.upcomingTime}>
        <Text style={styles.upcomingDay}>{starts.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase()}</Text>
        <Text style={styles.upcomingClock}>{starts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textDim} />
      </View>
    </Pressable>
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
  return <SportStageLoader variant="compact" message="Finding your matches" detail="" />;
}

function LoadingNetwork() {
  return <SportStageLoader variant="section" message="Loading the live stage" detail="Scanning every sport for matches in play" />;
}

function LoadingPageLabel() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 550, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.35] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  return <View style={styles.loadingPageLabel}>
    <Animated.View style={[styles.paginationPulse, { opacity, transform: [{ scale }] }]} />
    <Text style={styles.loadMoreText}>LOADING NEXT PAGE</Text>
  </View>;
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

function sortUpcoming(items: readonly SportUpcomingSnapshot[]): SportUpcomingSnapshot[] {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.scheduledAt);
    const rightTime = Date.parse(right.scheduledAt);
    return (Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER)
      || left.discoveryId.localeCompare(right.discoveryId);
  });
}

function sportHomeRoute(sportCode: string): string | undefined {
  return ({
    CRICKET: '/wricket',
    TENNIS: '/tennis',
    BADMINTON: '/badminton',
    PADEL: '/padel',
    TABLE_TENNIS: '/table-tennis',
    PICKLEBALL: '/pickleball',
  } as Readonly<Record<string, string>>)[sportCode];
}

function competitionRoute(sportCode: string, competitionId: string): string | undefined {
  if (sportCode === 'CRICKET') return `/tournament?id=${encodeURIComponent(competitionId)}`;
  const home = sportHomeRoute(sportCode);
  return home ? `${home}/competition/${encodeURIComponent(competitionId)}?mode=view` : undefined;
}

function hasSportAccess(
  sports: readonly { code: string; status: string; accessStatus: string }[],
  sportCode: string,
): boolean {
  return sports.some(sport => sport.code === sportCode && sport.status === 'AVAILABLE' && sport.accessStatus === 'ACTIVE');
}

function relationshipCopy(relationship: CricketTournamentInsight['relationship']): string {
  return ({ OWNER: 'Organising', MY_TEAM: 'Your team is playing', TOURNAMENT_MEMBER: 'Tournament member', FOLLOWING: 'Following' })[relationship];
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
  sportChip: { minWidth: 70, minHeight: 82, paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', gap: 3 },
  sportChipLive: { borderColor: colors.live },
  sportChipSelected: { backgroundColor: colors.accentMuted },
  sportIconRoute: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
  sportRouteArrow: { position: 'absolute', top: 0, right: 1 },
  sportFilter: { alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  sportChipName: { color: colors.text, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 10.5 },
  sportChipMuted: { color: colors.textDim },
  sectionBlock: { paddingTop: spacing.xl },
  promotedUpcoming: { paddingTop: spacing.lg },
  sectionHeading: { paddingHorizontal: spacing.lg, paddingBottom: 10, gap: 4 },
  sectionLabel: { color: colors.textDim, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 9.5, letterSpacing: 0.9 },
  sectionExplanation: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  cardList: { paddingHorizontal: spacing.lg, gap: spacing.md },
  liveRail: { paddingHorizontal: spacing.lg, paddingRight: spacing.xxl, gap: spacing.md },
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
  matchActions: { minHeight: 44, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row' },
  matchAction: { flex: 1, minHeight: 44, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  feedAction: { borderLeftWidth: 1, borderLeftColor: colors.border },
  competitionAction: { color: colors.gold, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 8.5 },
  openScorecard: { color: colors.accent, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 8.5 },
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
  followedUpcoming: { marginTop: spacing.lg, gap: spacing.sm },
  insightLabel: { paddingHorizontal: spacing.lg, color: colors.gold, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 9, letterSpacing: 0.8 },
  tournamentInsights: { marginTop: spacing.lg, gap: spacing.sm },
  tournamentInsightRail: { paddingHorizontal: spacing.lg, paddingRight: spacing.xxl, gap: spacing.sm },
  tournamentInsightCard: { width: 250, minHeight: 86, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tournamentInsightName: { color: colors.text, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12.5, lineHeight: 16 },
  tournamentRelationship: { marginTop: 3, color: colors.accent, fontFamily: 'IBMPlexMono_500Medium', fontSize: 8.5 },
  tournamentInsightMeta: { marginTop: 4, color: colors.textDim, fontFamily: 'Inter_400Regular', fontSize: 9.5 },
  followPrompt: { marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  promptIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  promptTitle: { color: colors.text, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12.5 },
  promptCopy: { marginTop: 2, color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 10.5, lineHeight: 15 },
  promptAction: { color: colors.accent, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 9 },
  upcomingEmpty: { marginHorizontal: spacing.lg, minHeight: 82, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  loadingLine: { marginHorizontal: spacing.lg, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loadingNetwork: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11 },
  paginationHint: { marginHorizontal: spacing.lg, color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  loadMoreLive: { minHeight: 46, marginHorizontal: spacing.lg, marginTop: spacing.md, borderWidth: 1, borderColor: colors.accent, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadMoreDisabled: { opacity: 0.65 },
  loadMoreText: { color: colors.accent, fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 9.5, letterSpacing: 0.6 },
  loadingPageLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  paginationPulse: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.live },
  loadMoreError: { marginHorizontal: spacing.lg, marginTop: spacing.sm, color: colors.danger, fontFamily: 'Inter_400Regular', fontSize: 10.5, textAlign: 'center' },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.74 },
});
