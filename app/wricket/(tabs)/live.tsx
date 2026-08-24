import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { SportStageBannerAd } from '../../../components/ads/SportStageBannerAd';
import { useAuth } from '@/components/providers/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Text } from '@/components/ui/Text';
import { CloudLiveMatch, LiveMatchCursor, liveMatchApi } from '@/lib/supabase/liveMatchApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { listTournaments } from '@/lib/wricket/db/repo';
import { Tournament } from '@/lib/wricket/domain/types';
import { tournamentDiscoveryApi } from '@/lib/supabase/tournamentDiscoveryApi';
import { PersonalStats, personalStatsApi } from '@/lib/supabase/personalStatsApi';
import { PerformanceSnapshot } from '@/components/wricket/performance/PerformanceSnapshot';
import { WricketAvatarButton } from '@/components/wricket/navigation/WricketProfileDrawer';

export default function HomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const [matches, setMatches] = useState<CloudLiveMatch[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [performance, setPerformance] = useState<PersonalStats>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<LiveMatchCursor>();
  const [error, setError] = useState<string>();
  const pageRequestRef = useRef(false);
  const updateTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [livePage, local, relevantIds, personalPerformance] = await Promise.all([
        liveMatchApi.listPage(),
        listTournaments(),
        auth.session ? tournamentDiscoveryApi.listRelevantIds() : Promise.resolve<Set<string> | null>(null),
        auth.session ? personalStatsApi.get(auth.session.user.id).catch(() => undefined) : Promise.resolve(undefined),
      ]);
      setMatches(livePage.matches);
      setNextCursor(livePage.nextCursor);
      setHasMore(livePage.hasMore);
      setTournaments(relevantIds ? local.filter(item => !item.cloudId || relevantIds.has(item.cloudId)) : local);
      setPerformance(personalPerformance);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh Home');
      const local = await listTournaments();
      setTournaments(auth.session ? local.filter(item => !item.cloudId) : local);
    } finally { setLoading(false); }
  }, [auth.session]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || pageRequestRef.current) return;
    pageRequestRef.current = true;
    setLoadingMore(true);
    try {
      const page = await liveMatchApi.listPage(nextCursor);
      setMatches(current => {
        const existing = new Set(current.map(match => match.id));
        return [...current, ...page.matches.filter(match => !existing.has(match.id))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load more live matches');
    } finally {
      pageRequestRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor]);

  const refreshLoadedMatch = useCallback((matchId: string) => {
    const existingTimer = updateTimersRef.current.get(matchId);
    if (existingTimer) clearTimeout(existingTimer);
    updateTimersRef.current.set(matchId, setTimeout(() => {
      updateTimersRef.current.delete(matchId);
      void liveMatchApi.getSummary(matchId).then(updated => {
        setMatches(current => updated
          ? current.map(match => match.id === matchId ? { ...updated, eligibilityReason: match.eligibilityReason } : match)
          : current.filter(match => match.id !== matchId));
      });
    }, 150));
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const loadedMatchIds = useMemo(() => matches.map(match => match.id), [matches]);
  const loadedMatchIdsKey = loadedMatchIds.join(',');
  useEffect(() => liveMatchApi.subscribeLoaded(loadedMatchIds, refreshLoadedMatch), [loadedMatchIdsKey, refreshLoadedMatch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    updateTimersRef.current.forEach(timer => clearTimeout(timer));
    updateTimersRef.current.clear();
  }, []);
  const liveCardWidth = Math.max(300, windowWidth - spacing.lg * 2 - spacing.xl);
  const name = auth.profile?.displayName?.split(' ')[0] ?? 'cricketer';
  const greeting = useMemo(() => new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening', []);

  return <Screen padded={false}>
    <View style={styles.topBar}>
      <View style={styles.brand}>
        <View style={styles.brandMark}><MaterialCommunityIcons name="cricket" size={20} color={colors.accentInk} /></View>
        <Text variant="bodyStrong">Wricket</Text>
      </View>
      <WricketAvatarButton />
    </View>
    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} contentContainerStyle={styles.content}>
      <Text variant="overline" tone="dim">{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date())}</Text>
      <Text variant="h2" style={styles.greeting}>{greeting}, {name}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start a friendly cricket match"
        onPress={() => auth.session ? router.push('/wricket/match/new') : router.push('/account')}
        style={({ pressed }) => [styles.startMatchBanner, pressed && styles.startMatchBannerPressed]}
      >
        <View style={styles.startMatchIcon}>
          <MaterialCommunityIcons name="cricket" size={26} color={colors.accentInk} />
        </View>
        <View style={styles.flex}>
          <Text variant="overline" style={{ color: colors.accentInk }}>QUICK MATCH</Text>
          <Text variant="h3" style={{ color: colors.accentInk }}>Start a match</Text>
          <Text variant="caption" style={styles.startMatchCopy}>
            Pick teams you play for or have faced. No tournament needed.
          </Text>
        </View>
        <MaterialCommunityIcons name="arrow-right" size={24} color={colors.accentInk} />
      </Pressable>

      <View style={styles.section}><SectionLabel live>Live now</SectionLabel>{matches.length > 0 ? <Text variant="caption" tone="muted">{matches.length} MATCH{matches.length === 1 ? '' : 'ES'}</Text> : null}</View>
      {loading && matches.length === 0 ? <SportStageLoader variant="section" message="Finding live cricket" detail="Connecting scores, tournaments, and commentary" /> : matches.length > 0 ? (
        <LiveMatchesCarousel
          matches={matches}
          cardWidth={liveCardWidth}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
          onOpen={id => router.push({ pathname: '/wricket/match/[id]/live', params: { id } })}
          onScorecard={id => router.push({ pathname: '/wricket/match/[id]/scorecard', params: { id } })}
        />
      ) : (
        <Card style={styles.empty}><MaterialCommunityIcons name="weather-night" size={26} color={colors.textDim} /><View style={styles.flex}><Text variant="h3">No match is live</Text><Text variant="caption" tone="muted">The next live match will appear here automatically.</Text></View></Card>
      )}
      {error ? <Pressable onPress={() => void load()}><Text variant="caption" tone="danger" style={styles.error}>{error} · Tap to retry</Text></Pressable> : null}

      <SportStageBannerAd />

      {auth.session && performance ? <>
        <View style={styles.section}><SectionLabel>Your performance</SectionLabel></View>
        <PerformanceSnapshot
          name={auth.profile?.displayName ?? auth.session.user.email?.split('@')[0] ?? 'Player'}
          stats={performance}
          onPress={() => router.navigate({ pathname: '/wricket/my-wricket', params: { section: 'performance' } })}
        />
      </> : null}

      <View style={styles.section}><SectionLabel>Your tournaments</SectionLabel><Pressable onPress={() => router.navigate({ pathname: '/wricket/my-wricket', params: { section: 'tournaments' } })}><Text variant="caption" tone="accent">VIEW ALL</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {tournaments.filter(item => item.status === 'ACTIVE').slice(0, 5).map(item => <Pressable key={item.id} onPress={() => router.push({ pathname: '/wricket/tournament/[id]', params: { id: item.id } })} style={styles.tournament}>
          <View style={[styles.mark, { backgroundColor: colors.goldMuted }]}><MaterialCommunityIcons name="trophy" size={20} color={colors.gold} /></View>
          <Text variant="bodyStrong" numberOfLines={2}>{item.name}</Text><Text variant="caption" tone="accent">● ACTIVE</Text>
        </Pressable>)}
        {!tournaments.some(item => item.status === 'ACTIVE') ? <Text variant="caption" tone="muted">No active tournaments yet.</Text> : null}
      </ScrollView>
    </ScrollView>
  </Screen>;
}

function LiveMatchesCarousel({ matches, cardWidth, hasMore, loadingMore, onLoadMore, onOpen, onScorecard }: {
  matches: CloudLiveMatch[];
  cardWidth: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (id: string) => void;
  onScorecard: (id: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const gap = spacing.sm;

  useEffect(() => {
    setActiveIndex(index => Math.min(index, Math.max(0, matches.length - 1)));
  }, [matches.length]);

  return <View>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + gap}
      snapToAlignment="start"
      disableIntervalMomentum
      contentContainerStyle={{ gap }}
      onMomentumScrollEnd={event => {
        const index = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + gap));
        setActiveIndex(Math.max(0, Math.min(index, matches.length - 1)));
        if (index >= matches.length - 2 && hasMore) onLoadMore();
      }}
    >
      {matches.map(match => <View key={match.id} style={{ width: cardWidth }}>
        <LiveMatchCard match={match} onOpen={() => onOpen(match.id)} onScorecard={() => onScorecard(match.id)} />
      </View>)}
      {loadingMore ? <View style={[styles.lazyPanel, { width: cardWidth }]}><ActivityIndicator color={colors.accent} /><Text variant="caption" tone="muted">Loading more live matches…</Text></View> : null}
    </ScrollView>
    {matches.length > 1 ? <View style={styles.carouselDots} accessibilityLabel={`Live match ${activeIndex + 1} of ${matches.length}`}>
      {matches.map((match, index) => <View key={match.id} style={[styles.carouselDot, index === activeIndex && styles.carouselDotActive]} />)}
    </View> : null}
  </View>;
}

function LiveMatchCard({ match, onOpen, onScorecard }: { match: CloudLiveMatch; onOpen: () => void; onScorecard: () => void }) {
  const batting = match.innings?.battingTeamId === match.teamB.id ? match.teamB : match.teamA;
  const overs = `${Math.floor(match.score.legalBalls / 6)}.${match.score.legalBalls % 6}`;
  return <Card style={styles.liveCard}>
    <View pointerEvents="none" style={styles.glowTop} />
    <View pointerEvents="none" style={styles.glowBottom} />
    <View style={styles.liveTop}>
      <View style={styles.livePill}><View style={styles.liveDot} /><Text variant="overline" style={{ color: colors.live }}>LIVE NOW</Text></View>
      <View style={styles.formatPill}><Text variant="overline" tone="muted">{match.format}</Text></View>
    </View>
    <Text variant="caption" tone="dim" numberOfLines={1} style={styles.tournamentName}>{match.tournamentName}{match.venue ? `  ·  ${match.venue}` : ''}</Text>

    <View style={styles.matchup}>
      <TeamBadge name={match.teamA.shortName} active={batting.id === match.teamA.id} />
      <View style={styles.scoreHero}>
        <Text variant="overline" tone="muted">{batting.shortName} BATTING</Text>
        <Text style={styles.scoreText}>{match.score.runs}<Text style={styles.wicketScore}>/{match.score.wickets}</Text></Text>
        <View style={styles.overPill}><MaterialCommunityIcons name="cricket" size={13} color={colors.accent} /><Text variant="caption" tone="accent">{overs} OV</Text></View>
      </View>
      <TeamBadge name={match.teamB.shortName} active={batting.id === match.teamB.id} />
    </View>

    {match.innings?.target ? <View style={styles.chaseBanner}><MaterialCommunityIcons name="target" size={14} color={colors.gold} /><Text variant="caption" style={{ color: colors.gold }}>TARGET {match.innings.target}</Text></View> : null}
    <View style={styles.insights}><Insight label="RUN RATE" value={match.score.legalBalls ? (match.score.runs / match.score.legalBalls * 6).toFixed(2) : '0.00'} /><Insight label="INNINGS" value={String(match.innings?.sequence ?? 1)} /><Insight label="BALL" value={String(match.score.legalBalls % 6 + 1)} /></View>
    {match.status === 'IN_PROGRESS' && match.innings ? <NextBallIndicator match={match} /> : null}
    <View style={styles.actions}>
      <Pressable onPress={onScorecard} style={styles.secondaryAction}><MaterialCommunityIcons name="view-list-outline" size={16} color={colors.textMuted} /><Text variant="caption" tone="muted">SCORECARD</Text></Pressable>
      <Pressable onPress={onOpen} style={styles.primaryAction}><Text variant="caption" style={{ color: colors.accentInk }}>OPEN LIVE</Text><MaterialCommunityIcons name="arrow-right" size={16} color={colors.accentInk} /></Pressable>
    </View>
  </Card>;
}

function TeamBadge({ name, active }: { name: string; active: boolean }) {
  return <View style={styles.teamColumn}>
    <View style={[styles.teamBadge, active && styles.teamBadgeActive]}>
      <Text variant="bodyStrong" style={active ? styles.teamBadgeTextActive : undefined}>{name.slice(0, 3).toUpperCase()}</Text>
    </View>
    {active ? <View style={styles.battingTag}><Text variant="overline" style={{ color: colors.accentInk }}>BAT</Text></View> : <Text variant="overline" tone="dim">FIELD</Text>}
  </View>;
}

function NextBallIndicator({ match }: { match: CloudLiveMatch }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const currentOver = Math.floor(match.score.legalBalls / 6);
  const completedBalls = match.score.legalBalls % 6;
  const events = match.commentary.filter(event =>
    event.kind === 'BALL_RECORDED'
    && event.payload.innings_id === match.innings?.id
    && Number(event.payload.over_no) === currentOver,
  );

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.2, duration: 550, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <View style={styles.over} accessibilityLabel={`Next ball ${completedBalls + 1} of over`}>
    <View style={styles.overHeading}><Text variant="overline" tone="dim">THIS OVER</Text><Text variant="caption" tone="muted">NEXT {completedBalls + 1}</Text></View>
    <View style={styles.ballTrack}>
      {events.map(event => {
        const wicket = Boolean(event.payload.is_wicket);
        return <View key={event.id} style={[styles.ball, wicket && styles.wicketBall]}>
          <Text variant="caption" style={wicket ? styles.wicketText : undefined}>{formatBallEvent(event.payload)}</Text>
        </View>;
      })}
      <View style={styles.ball}><Animated.View style={[styles.nextBall, { opacity }]} /></View>
    </View>
  </View>;
}

function formatBallEvent(payload: Record<string, unknown>): string {
  if (payload.is_wicket) return 'W';
  const bat = Number(payload.runs_bat ?? 0);
  const extras = Number(payload.runs_extra ?? 0);
  switch (payload.extra_kind) {
    case 'WIDE': return extras > 1 ? `${extras}wd` : 'wd';
    case 'NO_BALL': return bat > 0 ? `${bat}nb` : extras > 1 ? `${extras}nb` : 'nb';
    case 'BYE': return `${extras}b`;
    case 'LEG_BYE': return `${extras}lb`;
    default: return bat + extras > 0 ? String(bat + extras) : '•';
  }
}
function Insight({ label, value }: { label: string; value: string }) { return <View style={styles.insight}><Text variant="h3">{value}</Text><Text variant="overline" tone="dim">{label}</Text></View>; }

const styles = StyleSheet.create({
  topBar: { minHeight: 58, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  content: { padding: spacing.lg, paddingBottom: 112 }, greeting: { marginTop: spacing.xs }, flex: { flex: 1 },
  startMatchBanner: { marginTop: spacing.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.accent },
  startMatchBannerPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  startMatchIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.1)' },
  startMatchCopy: { color: 'rgba(0, 0, 0, 0.68)', marginTop: 2 },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveCard: { padding: 0, overflow: 'hidden', borderColor: 'rgba(95, 227, 138, 0.28)', backgroundColor: '#111713' },
  glowTop: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(95, 227, 138, 0.08)', top: -110, right: -55 },
  glowBottom: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(61, 217, 214, 0.05)', bottom: -115, left: -45 },
  liveTop: { paddingHorizontal: spacing.md, paddingTop: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  livePill: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255, 93, 104, 0.35)', backgroundColor: 'rgba(255, 93, 104, 0.09)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live },
  formatPill: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  tournamentName: { paddingHorizontal: spacing.md, marginTop: spacing.sm },
  matchup: { paddingHorizontal: spacing.md, paddingVertical: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamColumn: { width: 64, alignItems: 'center', gap: 6 },
  teamBadge: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-3deg' }] },
  teamBadgeActive: { backgroundColor: colors.accent, borderColor: colors.accent, transform: [{ rotate: '3deg' }] },
  teamBadgeTextActive: { color: colors.accentInk },
  battingTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.accent },
  scoreHero: { flex: 1, alignItems: 'center' },
  scoreText: { color: colors.text, fontSize: 42, lineHeight: 48, fontWeight: '800', letterSpacing: -2 },
  wicketScore: { color: colors.textMuted, fontSize: 24, fontWeight: '600', letterSpacing: -1 },
  overPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chaseBanner: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: spacing.md, borderRadius: 999, backgroundColor: colors.goldMuted },
  insights: { marginHorizontal: spacing.md, flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: 'rgba(10, 12, 11, 0.55)', overflow: 'hidden' },
  insight: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  over: { margin: spacing.md, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(10, 12, 11, 0.5)', gap: spacing.sm },
  overHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ballTrack: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  ball: { minWidth: 28, height: 28, paddingHorizontal: 5, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  wicketBall: { borderColor: colors.danger, backgroundColor: 'rgba(224, 57, 75, 0.14)' },
  wicketText: { color: colors.danger },
  nextBall: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.live },
  carouselDots: { minHeight: 24, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  carouselDotActive: { width: 18, backgroundColor: colors.accent },
  lazyPanel: { minHeight: 260, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  secondaryAction: { flex: 1, minHeight: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  primaryAction: { flex: 1, minHeight: 42, borderRadius: radius.md, backgroundColor: colors.accent, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, error: { marginTop: spacing.sm }, rail: { gap: spacing.sm, paddingRight: spacing.lg },
  tournament: { width: 148, minHeight: 126, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.sm }, mark: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
