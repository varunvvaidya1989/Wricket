import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { SectionRow } from '@/components/wricket/ui/SectionRow';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { SpectatorMatchHeader } from '@/components/wricket/scoring/SpectatorMatchHeader';
import { SpectatorMatchInfo } from '@/components/wricket/scoring/SpectatorMatchInfo';
import { spectatorHistory } from '@/lib/wricket/presentation/spectatorHistory';
import { buildCompleteScorecard, type CompleteScorecardData, type CompleteInningsScorecardData } from '@/lib/wricket/presentation/spectatorScorecard';
import { spectatorResult } from '@/lib/wricket/presentation/matchShare';
import { MatchShare } from '@/components/wricket/scoring/MatchShare';
import { ChaseComparison } from '@/components/wricket/scoring/ChaseComparison';
import { matchStatus } from '@/lib/wricket/presentation/status';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Card } from '@/components/wricket/ui/Card';
import { TournamentSponsors } from '@/components/sponsors/TournamentSponsors';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/wricket/ui/Text';
import { CloudLiveMatch, CloudMatchContext, CloudMatchEvent, CloudMatchSquadPlayer, liveMatchApi } from '@/lib/supabase/liveMatchApi';
import { colors } from '@/lib/wricket/presentation/design';
import { radius, spacing } from '@/lib/theme/spacing';
import { DEFAULT_RULES, MatchFormat } from '@/lib/wricket/domain/types';
import { formatOver } from '@/lib/wricket/domain/scoring';
import { testMatchSituation } from '@/lib/wricket/domain/test-match';

type FeedTab = 'summary' | 'squads' | 'commentary' | 'scorecard' | 'insights';
const FEED_TABS: { id: FeedTab; label: string }[] = [
  { id: 'summary', label: 'Overview' },
  { id: 'commentary', label: 'Ball by ball' },
  { id: 'scorecard', label: 'Scorecard' },
];
type CelebrationType = 'WICKET' | 'FOUR' | 'SIX' | 'MATCH_WIN';
interface Celebration {
  type: CelebrationType;
  title: string;
  subtitle: string;
}

export default function CloudLiveMatchScreen() {
  const { id, tab: initialTab, share } = useLocalSearchParams<{ id: string; tab?: FeedTab; share?: string }>();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [match, setMatch] = useState<CloudLiveMatch | null>(null);
  const [context, setContext] = useState<CloudMatchContext>();
  const [contextError, setContextError] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(share === '1');
  const [historyMatch, setHistoryMatch] = useState<CloudLiveMatch | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState(false);
  const browsingHistory = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const loadVersion = useRef(0);
  const [tab, setTab] = useState<FeedTab>(
    initialTab === 'commentary' || initialTab === 'scorecard' ? initialTab : 'summary',
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [realtimeError, setRealtimeError] = useState<string>();
  const [celebration, setCelebration] = useState<Celebration>();
  const initializedRef = useRef(false);
  const latestSequenceRef = useRef(0);
  const statusRef = useRef<string | undefined>(undefined);
  const clearCelebration = useCallback(() => setCelebration(undefined), []);

  const load = useCallback(async () => {
    if (!id) return;
    const version = ++loadVersion.current;
    try {
      const raw = await liveMatchApi.get(id);
      if (version !== loadVersion.current) return;
      const next = raw ? { ...raw, commentary: spectatorHistory(raw.commentary) } : null;
      if (!browsingHistory.current) { setHistoryMatch(next); setPendingUpdates(false); }
      else if (next && next.score.latestSequence > latestSequenceRef.current) setPendingUpdates(true);
      if (next && initializedRef.current) {
        const completedNow = next.status === 'COMPLETED' && statusRef.current !== 'COMPLETED';
        if (completedNow) {
          setCelebration(matchWinCelebration(next));
        } else {
          const newest = next.commentary.find(event => event.sequence > latestSequenceRef.current);
          const nextCelebration = newest ? celebrationForEvent(newest) : undefined;
          if (nextCelebration) setCelebration(nextCelebration);
        }
      }
      if (next) {
        initializedRef.current = true;
        latestSequenceRef.current = Math.max(latestSequenceRef.current, next.score.latestSequence);
        statusRef.current = next.status;
      }
      setMatch(next);
      setError(next ? undefined : 'This match is unavailable');
    } catch (cause) {
      if (version === loadVersion.current) setError(cause instanceof Error ? cause.message : 'Could not load the live feed');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const requests = loadVersion;
    setMatch(null); setHistoryMatch(null); setLoading(true); setPendingUpdates(false);
    browsingHistory.current = false; initializedRef.current = false;
    latestSequenceRef.current = 0; statusRef.current = undefined;
    void load();
    return () => { requests.current++; };
  }, [load]);
  useEffect(() => { setTab(initialTab === 'commentary' || initialTab === 'scorecard' ? initialTab : 'summary'); }, [initialTab]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    setContext(undefined);
    setContextError(false);
    void liveMatchApi.getContext(id).then(next => { if (active) setContext(next); }).catch(() => { if (active) setContextError(true); });
    return () => { active = false; };
  }, [id]);
  useEffect(() => id ? liveMatchApi.subscribe(id, () => {
    setRealtimeError(undefined);
    void load();
  }, setRealtimeError) : undefined, [id, load]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    // Recover missed updates after a socket reconnect, without clearing cached play.
    const recovery = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 15000);
    return () => { subscription.remove(); clearInterval(recovery); };
  }, [load]);

  const scorecard = useMemo(() => match ? buildCompleteScorecard(match) : null, [match]);
  if (loading && !match) return <Screen padded={false}><Stack.Screen options={{ headerShown: false }} /><WricketHeader title="Match" backTo="/wricket/live" /><SportStageLoader message="Connecting to the live feed" detail="Tuning into score, commentary, and match signals" /></Screen>;
  if (!match) {
    return <Screen><Stack.Screen options={{ headerShown: false }} /><WricketHeader title="Match" backTo="/wricket/live" /><View style={styles.centered}>
      <Text variant="h2">Match unavailable</Text><Text tone="muted">{error}</Text>
      <Pressable style={styles.retryButton} onPress={() => void load()}>
        <Text variant="bodyStrong" style={{ color: colors.accentInk }}>Try again</Text>
      </Pressable>
    </View></Screen>;
  }

  const insights = calculateInsights(match);

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: false }} /><WricketHeader title={`${match.teamA.shortName} vs ${match.teamB.shortName}`} backTo="/wricket/live">
        <Pressable accessibilityRole="button" accessibilityLabel="Share match" onPress={() => setShareOpen(true)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><DesignIcon name="share" /></Pressable>
      </WricketHeader>
      <SpectatorMatchHeader match={match} result={spectatorResult(match)} />
      <View style={styles.stickyHeader}>
        {(realtimeError || error) && <Card style={{ borderColor: colors.danger }}>
          <Text variant="caption" accessibilityRole="alert">Updates interrupted. Showing the last received score.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry live updates" onPress={() => void load()} style={{ minHeight: 44, justifyContent: 'center' }}><Text tone="accent">Retry live updates</Text></Pressable>
        </Card>}

        <SectionRow label="Match sections" items={FEED_TABS} selected={tab}
          onSelect={next => { browsingHistory.current = false; setHistoryMatch(match); setPendingUpdates(false); router.setParams({ tab: next }); scrollRef.current?.scrollTo({ y: 0, animated: false }); }} />
      </View>

      {tab === 'commentary' && pendingUpdates ? <Pressable accessibilityRole="button" accessibilityLabel="New updates" onPress={() => { browsingHistory.current = false; setHistoryMatch(match); setPendingUpdates(false); scrollRef.current?.scrollTo({ y: 0, animated: !reducedMotion }); }} style={{ padding: 12, backgroundColor: colors.accentMuted }}><Text tone="accent">New updates · Show latest</Text></Pressable> : null}
      <ScrollView ref={scrollRef} testID="spectator-history" scrollEventThrottle={100}
        onScroll={event => { browsingHistory.current = tab === 'commentary' && (event.nativeEvent.contentOffset.y > 100 || pendingUpdates); }}
        style={styles.feedScroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        contentContainerStyle={styles.feedContent}
      >
        {match.tournamentId ? <TournamentSponsors key={match.tournamentId} parent={{ kind: 'cricket', id: match.tournamentId }} placement="match" /> : null}
        {tab === 'summary' && <><View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}><Pressable accessibilityRole="button" accessibilityLabel="Match info" onPress={() => setInfoOpen(true)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text variant="caption" tone="accent">Match info</Text><DesignIcon name="arrow" size={14} color={colors.accent} /></Pressable></View><Summary match={match} insights={insights} /></>}
        {tab === 'squads' && <SquadsAndH2H match={match} context={context} failed={contextError} onMeetingPress={matchId => router.push({ pathname: '/wricket/match/[id]/live', params: { id: matchId } })} />}
        {tab === 'commentary' && <Commentary match={historyMatch ?? match} />}
        {tab === 'scorecard' && scorecard && <CompleteScorecard match={match} data={scorecard} squads={context?.squads ?? []} />}
        {tab === 'insights' && <Insights match={match} insights={insights} context={context} />}
      </ScrollView>
      {infoOpen ? <SpectatorMatchInfo visible onClose={() => setInfoOpen(false)} match={match} context={context} failed={contextError}
        onRetry={() => { setContextError(false); void liveMatchApi.getContext(match.id).then(setContext).catch(() => setContextError(true)); }}
        onTournament={() => { setInfoOpen(false); router.push({ pathname: '/tournament', params: { id: match.tournamentId! } }); }} /> : null}
      {shareOpen ? <MatchShare match={match} onClose={() => setShareOpen(false)} /> : null}
      {celebration && !reducedMotion && (
        <ViewerCelebration celebration={celebration} onDone={clearCelebration} />
      )}
    </Screen>
  );
}

function ViewerCelebration({ celebration, onDone }: { celebration: Celebration; onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const hold = celebration.type === 'MATCH_WIN' ? 2800 : 1500;
    Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }),
      Animated.delay(hold),
      Animated.timing(progress, {
        toValue: 0,
        duration: 280,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => { if (finished) onDone(); });
    return () => progress.stopAnimation();
  }, [celebration.type, onDone, progress]);
  const theme = celebrationTheme(celebration.type);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.celebration,
        { backgroundColor: theme.background },
        {
          opacity: progress,
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) },
            { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '0deg'] }) },
          ],
        },
      ]}
    >
      <View style={[styles.celebrationRing, { borderColor: theme.accent }]} />
      <View style={[styles.celebrationRing, styles.celebrationRingLarge, { borderColor: theme.accent }]} />
      <MaterialCommunityIcons name={theme.icon} size={72} color={theme.accent} />
      <Text style={[styles.celebrationTitle, { color: theme.accent }]}>{celebration.title}</Text>
      <Text variant="h3" style={styles.celebrationSubtitle}>{celebration.subtitle}</Text>
      {celebration.type === 'SIX' && (
        <View style={styles.sixDots}>
          {Array.from({ length: 6 }, (_, index) => <View key={index} style={[styles.sixDot, { backgroundColor: theme.accent }]} />)}
        </View>
      )}
      {celebration.type === 'MATCH_WIN' && (
        <Text variant="overline" style={{ color: theme.accent, marginTop: spacing.xl }}>MATCH COMPLETE</Text>
      )}
    </Animated.View>
  );
}

function celebrationForEvent(event: CloudMatchEvent): Celebration | undefined {
  if (event.kind !== 'BALL_RECORDED') return undefined;
  if (event.payload.is_wicket) {
    return {
      type: 'WICKET',
      title: 'WICKET!',
      subtitle: String(event.payload.dismissal_kind ?? 'Batter dismissed').replaceAll('_', ' '),
    };
  }
  const runs = Number(event.payload.runs_bat ?? 0);
  if (runs === 6) return { type: 'SIX', title: 'SIX!', subtitle: 'Into the crowd' };
  if (runs === 4) return { type: 'FOUR', title: 'FOUR!', subtitle: 'Races to the boundary' };
  return undefined;
}

function matchWinCelebration(match: CloudLiveMatch): Celebration {
  const winnerId = typeof match.result?.winnerTeamId === 'string'
    ? match.result.winnerTeamId
    : typeof match.result?.winner_team_id === 'string'
      ? match.result.winner_team_id
      : undefined;
  const winner = winnerId === match.teamA.id ? match.teamA.name
    : winnerId === match.teamB.id ? match.teamB.name
      : 'Match complete';
  const margin = match.result?.margin;
  const unit = match.result?.marginUnit ?? match.result?.margin_unit;
  return {
    type: 'MATCH_WIN',
    title: 'VICTORY',
    subtitle: margin && unit ? `${winner} won by ${margin} ${String(unit).toLowerCase()}` : winner,
  };
}

function celebrationTheme(type: CelebrationType): {
  background: string;
  accent: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
} {
  if (type === 'WICKET') return { background: '#28070D', accent: colors.wicket, icon: 'cricket' };
  if (type === 'FOUR') return { background: '#032425', accent: colors.boundary, icon: 'run-fast' };
  if (type === 'SIX') return { background: '#2B1208', accent: colors.six, icon: 'motion' };
  return { background: '#09230E', accent: colors.accent, icon: 'trophy-award' };
}

function Summary({ match, insights }: { match: CloudLiveMatch; insights: MatchInsights }) {
  if (matchStatus(match.status).terminal && !match.commentary.some(event => event.kind === 'BALL_RECORDED')) return <EmptyState icon="cricket" title="No deliveries recorded" detail="Match information and the official outcome remain available above." />;
  if (!matchStatus(match.status).terminal && (match.status === 'SETUP' || (!match.commentary.length && match.score.legalBalls === 0))) {
    return <EmptyState icon="cricket" title="Ready for the first ball" detail="The match story will build here as play begins." />;
  }
  if (matchStatus(match.status).terminal) {
    const card = buildCompleteScorecard(match);
    const batters = card.flatMap(innings => innings.batters);
    const bowlers = card.flatMap(innings => innings.bowlers);
    const topBatter = [...batters].sort((a, b) => b.runs - a.runs)[0];
    const topBowler = [...bowlers].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0];
    const moments = match.commentary.filter(event => event.kind === 'BALL_RECORDED' && (event.payload.is_wicket || Number(event.payload.runs_bat) >= 6)).slice(0, 3);
    return <View style={styles.section}>
      <View style={styles.recapLead}>
        <Text variant="overline" tone="muted">THE STORY</Text>
        <Text variant="h2" style={{ marginTop: spacing.sm }}>
          Recorded performances
        </Text>
      </View>
      <View style={styles.performerGrid}>
        <PerformerCard icon="cricket" label="TOP BATTER" name={topBatter ? playerName(match, topBatter.id, 'Batter') : 'Not available'} stat={topBatter ? `${topBatter.runs} off ${topBatter.balls}` : '—'} />
        <PerformerCard icon="target" label="TOP BOWLER" name={topBowler ? playerName(match, topBowler.id, 'Bowler') : 'Not available'} stat={topBowler ? `${topBowler.wickets}/${topBowler.runs}` : '—'} />
      </View>
      <Card>
        <Text variant="overline" tone="muted">KEY MOMENTS</Text>
        {moments.length ? moments.map((event, index) => <View key={event.id} style={styles.momentLine}>
          <Text variant="caption" tone="accent">{String(index + 1).padStart(2, '0')}</Text>
          <Text variant="body" style={{ flex: 1 }}>{ballLabel(event)} · {commentaryHeadline(match, event)}</Text>
        </View>) : <Text tone="muted" style={{ marginTop: spacing.md }}>No defining delivery was recorded.</Text>}
      </Card>
    </View>;
  }
  const balls = match.commentary.filter(event => event.kind === 'BALL_RECORDED' && event.payload.innings_id === match.innings?.id);
  const latest = balls[0];
  const card = buildCompleteScorecard(match).find(item => item.inningsId === match.innings?.id);
  const pair = latest ? [latest.payload.striker_id, latest.payload.non_striker_id].filter((value): value is string => typeof value === 'string') : [];
  const active = pair.filter(id => { const row = card?.batters.find(batter => batter.id === id); return !row?.out && row?.dismissal !== 'retired hurt'; });
  const partnership = currentPartnership(match);
  return <View style={styles.section}>
    <Text variant="overline" tone="muted">AT THE CREASE</Text>
    {active.length ? active.map(id => {
      const batter = card?.batters.find(row => row.id === id);
      return <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border }}><Text style={{ flex: 1 }}>{playerName(match, id, 'Batter')}</Text><Text variant="h3">{batter?.runs ?? 0}</Text><Text variant="mono" tone="muted">({batter?.balls ?? 0})</Text></View>;
    }) : <Text tone="muted">Waiting for the next batting pair.</Text>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text variant="caption" tone="muted">CURRENT PARTNERSHIP</Text><Text variant="mono">{partnership.runs} from {partnership.balls}</Text></View>
    <ChaseComparison match={match} />
    {latest ? <View style={styles.storyline}><DesignIcon name="info" color={colors.accent} /><View style={{ flex: 1 }}><Text variant="bodyStrong">{ballLabel(latest)} · {commentaryHeadline(match, latest)}</Text><Text variant="caption" tone="muted">{liveStoryline(match, insights)}</Text></View></View> : null}
  </View>;
}

function Commentary({ match }: { match: CloudLiveMatch }) {
  if (!match.commentary.length) return <EmptyState icon="message-text-outline" title="No commentary yet" detail="Deliveries and match events will appear here once scoring begins." />;
  const insights = buildCommentaryInsights(match);
  return <View style={styles.section}>{match.commentary.map((event, index) => {
    const innings = match.allInnings.find(item => item.id === event.payload.innings_id);
    const previous = match.commentary[index - 1];
    const heading = innings && (!previous || previous.payload.innings_id !== event.payload.innings_id);
    const team = innings?.battingTeamId === match.teamB.id ? match.teamB : match.teamA;
    const label = event.kind === 'BALL_RECORDED' ? event.payload.is_wicket ? 'W' : Number(event.payload.runs_extra) > 0 ? 'EX' : String(Number(event.payload.runs_bat ?? 0)) : 'i';
    return <View key={event.id}>
      {heading ? <Text variant="overline" tone="muted" style={{ paddingVertical: 14 }}>INNINGS {innings.sequence} · {team.name}</Text> : null}
      <View style={[styles.commentaryRow, event.kind !== 'BALL_RECORDED' && styles.systemEvent]}>
        {event.kind === 'BALL_RECORDED' ? <Text variant="mono" tone="muted" style={{ width: 32 }}>{ballLabel(event)}</Text> : null}
        <View style={[styles.ballBadge, outcomeBadgeStyle(event)]}><Text variant="mono" style={{ color: outcomeColor(event) }}>{label}</Text></View>
        <View style={{ flex: 1 }}><Text variant="bodyStrong">{commentaryHeadline(match, event)}</Text>
          {insights.get(event.id)?.detail ? <Text variant="caption" tone="muted" style={styles.commentaryDetail}>{insights.get(event.id)?.detail}</Text> : null}
          <Text variant="caption" tone="dim">{formatEventTime(event.createdAt)}</Text>
        </View>
      </View>
    </View>;
  })}</View>;
}

function SquadsAndH2H({ match, context, failed, onMeetingPress }: { match: CloudLiveMatch; context?: CloudMatchContext; failed: boolean; onMeetingPress: (id: string) => void }) {
  const [section, setSection] = useState<'squads' | 'h2h'>('squads');
  if (failed) return <EmptyState icon="cloud-alert-outline" title="Squads unavailable" detail="Pull to refresh and try loading the match details again." />;
  if (!context) return <View style={styles.section}><SkeletonRows /><SkeletonRows /></View>;
  const cards = buildCompleteScorecard(match);
  const winsA = context.meetings.filter(item => item.winnerTeamId === match.teamA.id).length;
  const winsB = context.meetings.filter(item => item.winnerTeamId === match.teamB.id).length;
  const decided = Math.max(1, winsA + winsB);
  const standout = [...context.meetings].sort((a, b) => Math.max(b.teamARuns, b.teamBRuns) - Math.max(a.teamARuns, a.teamBRuns))[0];
  return <View style={styles.section}>
    <View style={styles.squadSubTabs}>
      <Pressable onPress={() => setSection('squads')} style={[styles.squadSubTab, section === 'squads' && styles.squadSubTabActive]}><MaterialCommunityIcons name="account-group-outline" size={17} color={section === 'squads' ? colors.accent : colors.textMuted} /><Text variant="caption" tone={section === 'squads' ? 'accent' : 'muted'}>PLAYING XIS</Text></Pressable>
      <Pressable onPress={() => setSection('h2h')} style={[styles.squadSubTab, section === 'h2h' && styles.squadSubTabActive]}><MaterialCommunityIcons name="swap-horizontal" size={17} color={section === 'h2h' ? colors.accent : colors.textMuted} /><Text variant="caption" tone={section === 'h2h' ? 'accent' : 'muted'}>HEAD-TO-HEAD</Text></Pressable>
    </View>
    {section === 'squads' ? <>
      <View><Text variant="h3">Playing XIs</Text><Text variant="caption" tone="muted">Roles and match status</Text></View>
      <View style={styles.squadsGrid}>{[match.teamA, match.teamB].map(team => <View key={team.id} style={styles.squadColumn}>
        <View style={styles.squadHeader}><Text variant="h3" style={{ flex: 1 }}>{team.shortName}</Text><Text variant="overline" tone="muted">XI</Text></View>
        {context.squads.filter(player => player.teamId === team.id).map((player, index) => <SquadRow key={player.id} player={player} number={player.jerseyNo ?? index + 1} status={playerMatchStatus(match, cards, player)} />)}
        {!context.squads.some(player => player.teamId === team.id) && <Text variant="caption" tone="muted" style={styles.squadEmpty}>XI not submitted</Text>}
      </View>)}</View>
    </> : <>
      <View style={styles.sectionHeading}><Text variant="h3">Head-to-head</Text><Text variant="caption" tone="muted">ALL MEETINGS</Text></View>
      {!context.meetings.length ? <EmptyState icon="handshake-outline" title="First meeting" detail="No previous meetings between these two teams." /> : <>
      <Card>
        <View style={styles.h2hTotals}><View><Text style={styles.h2hNumber}>{winsA}</Text><Text variant="caption" tone="muted">{match.teamA.shortName} WINS</Text></View><View style={{ alignItems: 'center' }}><Text style={styles.h2hNumber}>{context.meetings.length}</Text><Text variant="caption" tone="dim">PLAYED</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={styles.h2hNumber}>{winsB}</Text><Text variant="caption" tone="muted">{match.teamB.shortName} WINS</Text></View></View>
        <View style={styles.h2hBar}><View style={[styles.h2hBarA, { flex: winsA / decided }]} /><View style={[styles.h2hBarB, { flex: winsB / decided }]} /></View>
      </Card>
      <Card><Text variant="overline" tone="muted">LAST 5</Text><View style={styles.resultStrip}>{context.meetings.slice(0, 5).map(item => <Pressable key={item.id} onPress={() => onMeetingPress(item.id)} style={[styles.resultChip, { backgroundColor: item.winnerTeamId === match.teamA.id ? colors.accentMuted : colors.surfaceElevated }]}><Text variant="caption" style={{ color: item.winnerTeamId === match.teamA.id ? colors.accent : colors.textMuted }}>{item.winnerTeamId === match.teamA.id ? match.teamA.shortName : item.winnerTeamId === match.teamB.id ? match.teamB.shortName : 'TIE'}</Text></Pressable>)}</View></Card>
      {standout && <Card accentColor={colors.gold}><Text variant="overline" style={{ color: colors.gold }}>STANDOUT</Text><Text variant="h3" style={{ marginTop: spacing.sm }}>Highest total: {Math.max(standout.teamARuns, standout.teamBRuns)}</Text><Text variant="caption" tone="muted">Across recorded meetings between these sides</Text></Card>}
      </>}
    </>}
  </View>;
}

function SquadRow({ player, number, status }: { player: CloudMatchSquadPlayer; number: number; status?: string }) {
  return <View style={styles.squadRow}>
    <View style={styles.squadPlayerLine}><View style={styles.jerseyBadge}><Text variant="caption">{number}</Text></View><Text variant="bodyStrong" style={{ flex: 1, fontSize: 13 }}>{player.name}</Text></View>
    <View style={styles.squadMetaLine}><View style={styles.roleTag}><Text variant="overline" tone="muted">{player.role}</Text></View>{(player.isCaptain || player.isKeeper) && <Text variant="overline" tone="muted">{player.isCaptain ? 'C' : ''}{player.isCaptain && player.isKeeper ? ' · ' : ''}{player.isKeeper ? 'WK' : ''}</Text>}</View>
    {status && <Text variant="caption" tone={status.startsWith('BATTING NOW') ? 'accent' : 'muted'} style={styles.squadStatus}>{status}</Text>}
  </View>;
}

interface ScorecardData {
  batters: { id: string; runs: number; balls: number; fours: number; sixes: number; out: boolean; dismissal?: string }[];
  bowlers: { id: string; runs: number; balls: number; wickets: number }[];
}
// Kept temporarily for compatibility with cached development bundles.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Scorecard({ match, data }: { match: CloudLiveMatch; data: ScorecardData }) {
  return <View style={styles.section}>
    <Card>
      <Text variant="h3">Batting</Text>
      <TableHeader columns={['BATTER', 'R', 'B', 'SR']} />
      {data.batters.map(row => <StatRow
        key={row.id}
        name={`${match.playerNames[row.id] ?? 'Batter'}${row.out ? ' †' : '*'}`}
        subtitle={row.dismissal}
        values={[row.runs, row.balls, row.balls ? ((row.runs / row.balls) * 100).toFixed(1) : '0.0']}
      />)}
    </Card>
    <Card>
      <Text variant="h3">Bowling</Text>
      <TableHeader columns={['BOWLER', 'O', 'R', 'W']} />
      {data.bowlers.map(row => <StatRow
        key={row.id}
        name={match.playerNames[row.id] ?? 'Bowler'}
        values={[formatOver(row.balls), row.runs, row.wickets]}
      />)}
    </Card>
  </View>;
}

function CompleteScorecard({
  match,
  data,
  squads,
}: {
  match: CloudLiveMatch;
  data: CompleteScorecardData;
  squads: CloudMatchSquadPlayer[];
}) {
  const [selected, setSelected] = useState(Math.max(0, data.length - 1));
  useEffect(() => setSelected(Math.max(0, data.length - 1)), [data.length]);
  if (!data.length) return <EmptyState icon="view-list-outline" title="Scorecard pending" detail="Batting and bowling figures will appear after the first delivery." />;
  const innings = data[selected] ?? data[0];
  const battingTeam = innings.battingTeamId === match.teamA.id ? match.teamA : match.teamB;
  const batted = new Set(innings.batters.map(row => row.id));
  const yetToBat = squads.filter(player => player.teamId === innings.battingTeamId && !batted.has(player.id));
  const falls = match.commentary.filter(event => event.kind === 'BALL_RECORDED' && event.payload.is_wicket && String(event.payload.innings_id) === innings.inningsId).reverse();
  return <View style={styles.section}>
    <View style={styles.inningsSwitcher}>{data.map((item, index) => {
      const team = item.battingTeamId === match.teamA.id ? match.teamA : match.teamB;
      return <Pressable key={item.inningsId} accessibilityRole="tab" accessibilityLabel={`Innings ${item.sequence}: ${team.name}`} accessibilityState={{ selected: selected === index }} onPress={() => setSelected(index)} style={[styles.inningsPill, selected === index && styles.inningsPillActive]}>
        <Text variant="caption" tone={selected === index ? 'accent' : 'muted'}>{team.shortName} {item.totalRuns}/{item.totalWickets}</Text>
      </Pressable>;
    })}</View>
    <Text variant="caption" tone="muted">{battingTeam.name} · innings {innings.sequence} · {formatOver(innings.totalBalls)} ov</Text>
    <View>
      <Text variant="overline" tone="muted">BATTING</Text>
      <BattingHeader />
      {innings.batters.map(row => <BattingRow key={row.id} name={playerName(match, row.id, 'Batter')} row={row} live={!row.out && !row.dismissal && innings.inningsId === match.innings?.id && match.status === 'IN_PROGRESS'} />)}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 }}><Text variant="caption" tone="muted">Extras / adjustments</Text><Text variant="mono">{innings.totalRuns - innings.batters.reduce((sum, row) => sum + row.runs, 0)}</Text></View>
      {yetToBat.length > 0 && <Card><Text variant="overline" tone="dim">{matchStatus(match.status).terminal ? 'DID NOT BAT' : 'YET TO BAT'}</Text><Text variant="caption" tone="muted" style={{ marginTop: 8 }}>{yetToBat.map(player => player.name).join(', ')}</Text></Card>}
    </View>
    <View>
      <Text variant="overline" tone="muted">BOWLING</Text>
      <BowlingHeader />
      {innings.bowlers.map(row => <BowlingRow key={row.id} name={playerName(match, row.id, 'Bowler')} row={row} />)}
    </View>
    {falls.length > 0 && <Card><Text variant="overline" tone="muted">WICKET DELIVERIES</Text><Text variant="body" style={{ marginTop: spacing.sm }}>{falls.map(event => `${ballLabel(event)} · ${playerName(match, event.payload.out_player_id, 'Batter')}`).join('  ·  ')}</Text></Card>}
  </View>;
}


function Insights({ match, insights, context }: { match: CloudLiveMatch; insights: MatchInsights; context?: CloudMatchContext }) {
  if (!match.commentary.some(event => event.kind === 'BALL_RECORDED')) return <EmptyState icon="chart-line" title="Insights need match data" detail="Trends will appear once enough deliveries have been recorded." />;
  if (match.status === 'COMPLETED') {
    const teamATotal = matchTotal(match, match.teamA.id);
    const teamBTotal = matchTotal(match, match.teamB.id);
    const card = buildCompleteScorecard(match);
    const best = card.flatMap(item => item.batters).sort((a, b) => b.runs - a.runs)[0];
    const performer = context?.playerOfMatch;
    const turningPoint = match.commentary.find(event => event.kind === 'BALL_RECORDED' && event.payload.is_wicket)
      ?? match.commentary.find(event => event.kind === 'BALL_RECORDED' && Number(event.payload.runs_bat) === 6);
    return <View style={styles.section}>
      <Card style={styles.potmCard}>
        <View style={styles.iconDisc}><MaterialCommunityIcons name="star-four-points" size={22} color={colors.gold} /></View>
        <View style={{ flex: 1 }}><Text variant="overline" style={{ color: colors.gold }}>{performer ? 'PLAYER OF THE MATCH' : 'STANDOUT BATTER'}</Text><Text variant="h2" style={{ marginTop: spacing.xs }}>{performer?.name ?? (best ? playerName(match, best.id, 'Top performer') : 'Top performer')}</Text><Text variant="caption" tone="muted">{performer?.reason ?? (best ? `${best.runs} runs set the match's batting benchmark.` : 'Decisive contribution across the match.')}</Text></View>
      </Card>
      <Card><Text variant="overline" tone="muted">RUN-RATE COMPARISON</Text><RateComparison label={match.teamA.shortName} value={runRate(teamATotal)} max={Math.max(runRate(teamATotal), runRate(teamBTotal), 1)} /><RateComparison label={match.teamB.shortName} value={runRate(teamBTotal)} max={Math.max(runRate(teamATotal), runRate(teamBTotal), 1)} /></Card>
      <Card accentColor={colors.gold}><Text variant="overline" style={{ color: colors.gold }}>RECORDED HIGHLIGHT</Text><Text variant="h3" style={{ marginTop: spacing.sm }}>{turningPoint ? `${ballLabel(turningPoint)} · ${commentaryHeadline(match, turningPoint)}` : 'No boundary or wicket is available.'}</Text></Card>
    </View>;
  }
  const partnership = currentPartnership(match);
  const phases = phaseRates(match);
  return <View style={styles.section}>
    <View style={styles.insightGrid}><InsightCard label="PARTNERSHIP" value={`${partnership.runs} (${partnership.balls})`} /></View>
    <Card><Text variant="overline" tone="muted">PHASE RUN RATE</Text>{phases.map(phase => <RateComparison key={phase.label} label={phase.label} value={phase.rate} max={Math.max(...phases.map(item => item.rate), 1)} />)}</Card>
  </View>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildScorecard(match: CloudLiveMatch): ScorecardData {
  const batters = new Map<string, ScorecardData['batters'][number]>();
  const bowlers = new Map<string, ScorecardData['bowlers'][number]>();
  [...match.commentary].reverse().forEach(event => {
    if (event.kind !== 'BALL_RECORDED') return;
    const p = event.payload;
    const striker = String(p.striker_id ?? '');
    const bowler = String(p.bowler_id ?? '');
    const batRuns = Number(p.runs_bat ?? 0);
    const totalRuns = batRuns + Number(p.runs_extra ?? 0);
    const legal = Boolean(p.is_legal);
    if (striker) {
      const row = batters.get(striker) ?? { id: striker, runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
      row.runs += batRuns; row.balls += legal ? 1 : 0; row.fours += batRuns === 4 ? 1 : 0; row.sixes += batRuns === 6 ? 1 : 0;
      batters.set(striker, row);
    }
    if (bowler) {
      const row = bowlers.get(bowler) ?? { id: bowler, runs: 0, balls: 0, wickets: 0 };
      row.runs += totalRuns; row.balls += legal ? 1 : 0;
      row.wickets += p.is_wicket && p.dismissal_kind !== 'RUN_OUT' ? 1 : 0;
      bowlers.set(bowler, row);
    }
    const outId = typeof p.out_player_id === 'string' ? p.out_player_id : undefined;
    if (outId) {
      const row = batters.get(outId) ?? { id: outId, runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
      row.out = true; row.dismissal = dismissalScorecardText(match, event); batters.set(outId, row);
    }
  });
  return { batters: [...batters.values()], bowlers: [...bowlers.values()] };
}

interface MatchInsights {
  crr: number; rrr: number | null; projectedScore: number; ballsRemaining: number; battingWinProbability: number;
}
function calculateInsights(match: CloudLiveMatch): MatchInsights {
  const fallback = DEFAULT_RULES[match.format as MatchFormat] ?? DEFAULT_RULES.TURF;
  const overs = Number(match.rules.oversPerInnings ?? fallback.oversPerInnings);
  const totalBalls = overs * 6;
  const ballsRemaining = Math.max(0, totalBalls - match.score.legalBalls);
  const crr = match.score.legalBalls ? match.score.runs * 6 / match.score.legalBalls : 0;
  const target = match.innings?.target;
  const runsNeeded = target == null ? null : Math.max(0, target - match.score.runs);
  const rrr = runsNeeded == null || ballsRemaining === 0 ? null : runsNeeded * 6 / ballsRemaining;
  const projectedScore = Math.round(match.score.runs + crr * ballsRemaining / 6);
  let probability = 50;
  if (target != null) {
    if (runsNeeded === 0) probability = 100;
    else if (!ballsRemaining || match.score.wickets >= 10) probability = 1;
    else {
      const rateEdge = crr - (rrr ?? crr);
      probability = Math.round(50 + rateEdge * 7 - match.score.wickets * 2 + (ballsRemaining / totalBalls) * 10);
    }
  }
  return { crr, rrr, projectedScore, ballsRemaining, battingWinProbability: Math.max(1, Math.min(99, probability)) };
}

interface CommentaryBatterState {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
}

interface CommentaryInsight {
  detail?: string;
}

function commentaryHeadline(match: CloudLiveMatch, event: CloudMatchEvent): string {
  const p = event.payload;
  if (event.kind === 'BALL_RECORDED') {
    const bowler = playerName(match, p.bowler_id, 'Bowler');
    const striker = playerName(match, p.striker_id, 'Batter');
    const outcome = deliveryOutcome(match, event);
    return `${bowler} to ${striker}, ${outcome}`;
  }
  if (event.kind === 'BALL_CORRECTED') return 'Previous delivery corrected.';
  if (event.kind === 'SCORE_ADJUSTED') return `Score adjusted by ${Number(p.runs ?? 0)} runs.`;
  if (event.kind === 'BATTER_RETIRED') return 'Batter retired.';
  if (event.kind === 'INNINGS_ENDED' || event.kind === 'INNINGS_CLOSED') return 'End of innings.';
  if (event.kind === 'MATCH_COMPLETED') return 'Match completed.';
  return event.kind.replaceAll('_', ' ').toLowerCase();
}

function buildCommentaryInsights(match: CloudLiveMatch): Map<string, CommentaryInsight> {
  const result = new Map<string, CommentaryInsight>();
  const batters = new Map<string, CommentaryBatterState>();
  let activeInningsId = '';
  let inningsRuns = 0;
  let inningsWickets = 0;
  let inningsBalls = 0;

  [...match.commentary]
    .sort((left, right) => left.sequence - right.sequence)
    .forEach(event => {
      if (event.kind !== 'BALL_RECORDED') return;
      const payload = event.payload;
      const inningsId = String(payload.innings_id ?? '');
      if (inningsId !== activeInningsId) {
        activeInningsId = inningsId;
        inningsRuns = 0;
        inningsWickets = 0;
        inningsBalls = 0;
        batters.clear();
      }
      const strikerId = stringValue(payload.striker_id);
      const batter = strikerId
        ? batters.get(strikerId) ?? emptyBatterState()
        : emptyBatterState();
      const batRuns = Number(payload.runs_bat ?? 0);
      batter.runs += batRuns;
      if (payload.is_legal) batter.balls += 1;
      if (batRuns === 4) batter.fours += 1;
      if (batRuns === 6) batter.sixes += 1;
      if (strikerId) batters.set(strikerId, batter);

      inningsRuns += batRuns + Number(payload.runs_extra ?? 0);
      inningsWickets += payload.is_wicket ? 1 : 0;
      inningsBalls += payload.is_legal ? 1 : 0;
      const innings = match.allInnings.find(item => item.id === inningsId);
      const team = innings?.battingTeamId === match.teamA.id ? match.teamA : match.teamB;
      const details = [`${team.shortName} ${inningsRuns}/${inningsWickets} after ${formatOver(inningsBalls)} ov`];

      if (payload.is_wicket) {
        const outPlayerId = stringValue(payload.out_player_id) ?? strikerId;
        const dismissed = outPlayerId ? batters.get(outPlayerId) ?? emptyBatterState() : emptyBatterState();
        const batterName = playerName(match, outPlayerId, 'Batter');
        const strikeRate = dismissed.balls ? (dismissed.runs / dismissed.balls) * 100 : 0;
        details.push(`${batterName} ${dismissalScorecardText(match, event)} (${dismissed.runs}r ${dismissed.balls}b, SR ${strikeRate.toFixed(2)})`);
      } else {
        details.push(`${playerName(match, strikerId, 'Batter')} ${batter.runs} (${batter.balls})`);
      }

      if (innings) {
        const fallback = DEFAULT_RULES[match.format as MatchFormat] ?? DEFAULT_RULES.TURF;
        const situation = testMatchSituation({
          format: match.format,
          followOnEnabled: Boolean(match.rules.followOnEnabled ?? fallback.followOnEnabled),
          oversPerInnings: Number(match.rules.oversPerInnings ?? fallback.oversPerInnings),
          currentInnings: innings,
          currentRuns: inningsRuns,
          innings: match.allInnings,
          teamName: teamId => teamId === match.teamA.id ? match.teamA.name : match.teamB.name,
        });
        if (situation.positionText) details.push(situation.positionText);
        if (situation.followOnText) details.push(situation.followOnText);
      }
      result.set(event.id, { detail: details.join(' · ') });
    });

  return result;
}

function deliveryOutcome(match: CloudLiveMatch, event: CloudMatchEvent): string {
  const payload = event.payload;
  const batRuns = Number(payload.runs_bat ?? 0);
  const extras = Number(payload.runs_extra ?? 0);
  const totalRuns = batRuns + extras;
  const runText = totalRuns === 0 ? 'no run' : `${totalRuns} run${totalRuns === 1 ? '' : 's'}`;
  const extraKind = stringValue(payload.extra_kind);
  const scoringText = extraKind
    ? `${runText} (${extraKind.replaceAll('_', ' ').toLowerCase()})`
    : batRuns === 6
      ? 'SIX!'
      : batRuns === 4
        ? 'FOUR!'
        : runText;
  if (!payload.is_wicket) return scoringText;

  const wicketText = wicketNarrative(match, event);
  return totalRuns > 0
    ? `${scoringText}, OUT! ${wicketText}`
    : `OUT! ${wicketText}`;
}

function wicketNarrative(match: CloudLiveMatch, event: CloudMatchEvent): string {
  const payload = event.payload;
  const kind = stringValue(payload.dismissal_kind) ?? 'WICKET';
  const fielder = playerName(match, payload.fielder_id, 'fielder');
  const thrower = playerName(match, payload.assistant_fielder_id, fielder);
  switch (kind) {
    case 'BOWLED':
      return 'Bowled';
    case 'CAUGHT':
      return `Caught by ${fielder}`;
    case 'LBW':
      return 'LBW';
    case 'RUN_OUT':
      return `Run out, throw from ${thrower}`;
    case 'STUMPED':
      return `Stumped by ${fielder}`;
    case 'HIT_WICKET':
      return 'Hit wicket';
    case 'RETIRED_OUT':
      return 'Retired out';
    default:
      return kind.replaceAll('_', ' ').toLowerCase();
  }
}

function dismissalScorecardText(match: CloudLiveMatch, event: CloudMatchEvent): string {
  const payload = event.payload;
  const kind = stringValue(payload.dismissal_kind) ?? 'WICKET';
  const bowler = playerName(match, payload.bowler_id, 'Bowler');
  const fielder = playerName(match, payload.fielder_id, 'fielder');
  const thrower = playerName(match, payload.assistant_fielder_id, fielder);
  switch (kind) {
    case 'BOWLED':
      return `b ${bowler}`;
    case 'CAUGHT':
      return `c ${fielder} b ${bowler}`;
    case 'LBW':
      return `lbw b ${bowler}`;
    case 'RUN_OUT':
      return thrower === fielder
        ? `run out ${fielder}`
        : `run out ${thrower} / ${fielder}`;
    case 'STUMPED':
      return `st ${fielder} b ${bowler}`;
    case 'HIT_WICKET':
      return `hit wicket b ${bowler}`;
    case 'RETIRED_OUT':
      return 'retired out';
    default:
      return kind.replaceAll('_', ' ').toLowerCase();
  }
}

function playerName(match: CloudLiveMatch, value: unknown, fallback: string): string {
  const id = stringValue(value);
  return id ? match.playerNames[id] ?? fallback : fallback;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function emptyBatterState(): CommentaryBatterState {
  return { runs: 0, balls: 0, fours: 0, sixes: 0 };
}
function ballLabel(event: CloudMatchEvent) {
  if (event.kind !== 'BALL_RECORDED') return `#${event.sequence}`;
  return `${Number(event.payload.over_no ?? 0)}.${Number(event.payload.legal_ball_in_over ?? 0)}`;
}




function matchTotal(match: CloudLiveMatch, teamId: string) {
  return match.allInnings.filter(innings => innings.battingTeamId === teamId).reduce((total, innings) => ({
    runs: total.runs + innings.totalRuns,
    wickets: total.wickets + innings.totalWickets,
    balls: total.balls + innings.totalBalls,
  }), { runs: 0, wickets: 0, balls: 0 });
}

function liveStoryline(match: CloudLiveMatch, insights: MatchInsights): string {
  return match.innings?.target != null
    ? `${Math.max(0, match.innings.target - match.score.runs)} runs needed from ${insights.ballsRemaining} balls.`
    : `${match.score.runs} runs from ${formatOver(match.score.legalBalls)} overs; ${match.score.wickets} wickets recorded.`;
}
function outcomeColor(event: CloudMatchEvent): string {
  if (event.payload.is_wicket) return colors.wicket;
  if (Number(event.payload.runs_bat) === 6) return colors.six;
  if (Number(event.payload.runs_bat) === 4) return colors.boundary;
  if (Number(event.payload.runs_extra) > 0) return colors.extra;
  return colors.text;
}
function outcomeBadgeStyle(event: CloudMatchEvent) {
  const color = outcomeColor(event);
  return color === colors.text ? undefined : { borderWidth: 1, borderColor: color, backgroundColor: `${color}18` };
}
function formatEventTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function currentPartnership(match: CloudLiveMatch): { runs: number; balls: number } {
  let runs = 0;
  let balls = 0;
  for (const event of match.commentary) {
    if (event.payload.innings_id !== match.innings?.id) continue;
    if (event.kind === 'BATTER_RETIRED') break;
    if (event.kind !== 'BALL_RECORDED') continue;
    if (event.payload.is_wicket) break;
    runs += Number(event.payload.runs_bat ?? 0) + Number(event.payload.runs_extra ?? 0);
    balls += event.payload.is_legal ? 1 : 0;
  }
  return { runs, balls };
}
function phaseRates(match: CloudLiveMatch): { label: string; rate: number }[] {
  const phases = [{ label: 'POWERPLAY', from: 0, to: 36 }, { label: 'MIDDLE', from: 36, to: 90 }, { label: 'DEATH', from: 90, to: Infinity }];
  const balls = match.commentary.filter(event => event.kind === 'BALL_RECORDED' && String(event.payload.innings_id ?? '') === match.innings?.id).reverse();
  return phases.map(phase => {
    let legal = 0;
    let runs = 0;
    let position = 0;
    balls.forEach(event => {
      const isLegal = Boolean(event.payload.is_legal);
      if (position >= phase.from && position < phase.to) runs += Number(event.payload.runs_bat ?? 0) + Number(event.payload.runs_extra ?? 0);
      if (isLegal && position >= phase.from && position < phase.to) legal += 1;
      if (isLegal) position += 1;
    });
    return { label: phase.label, rate: legal ? runs * 6 / legal : 0 };
  });
}
function runRate(total: { runs: number; wickets: number; balls: number }): number {
  return total.balls ? total.runs * 6 / total.balls : 0;
}
function playerMatchStatus(match: CloudLiveMatch, cards: CompleteScorecardData, player: CloudMatchSquadPlayer): string | undefined {
  const batter = cards.flatMap(card => card.batters).find(row => row.id === player.id);
  const bowling = cards.flatMap(card => card.bowlers).filter(row => row.id === player.id).at(-1);
  if (batter?.out) return `OUT · ${batter.runs} (${batter.balls})`;
  if (batter && match.status !== 'COMPLETED') return `BATTING NOW · ${batter.runs}*`;
  if (bowling) return `${formatOver(bowling.balls)}–${bowling.runs}–${bowling.wickets}`;
  if (match.status !== 'COMPLETED' && match.innings?.battingTeamId === player.teamId) return 'YET TO BAT';
  return undefined;
}
function InsightCard({ label, value }: { label: string; value: string }) {
  return <Card style={{ width: '48%' }}><Text variant="caption" tone="dim">{label}</Text><Text variant="h2">{value}</Text></Card>;
}
function TableHeader({ columns }: { columns: string[] }) {
  return <View style={styles.statRow}>{columns.map((column, i) => <Text key={column} variant="caption" tone="dim" style={i ? styles.statValue : styles.statName}>{column}</Text>)}</View>;
}
function StatRow({ name, subtitle, values }: { name: string; subtitle?: string; values: (string | number)[] }) {
  return <View style={styles.statRow}><View style={styles.statName}><Text variant="bodyStrong">{name}</Text>{subtitle ? <Text variant="caption" tone="muted">{subtitle}</Text> : null}</View>{values.map((value, i) => <Text key={i} variant="body" style={styles.statValue}>{value}</Text>)}</View>;
}
function PerformerCard({ icon, label, name, stat }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; name: string; stat: string }) {
  return <Card style={styles.performerCard}><MaterialCommunityIcons name={icon} size={20} color={colors.accent} /><Text variant="overline" tone="muted" style={{ marginTop: spacing.md }}>{label}</Text><Text variant="bodyStrong">{name}</Text><Text variant="caption" tone="accent">{stat}</Text></Card>;
}
const tableNumberStyle = { width: 31, textAlign: 'right' as const };
function BattingHeader() {
  return <View style={[styles.tableLine, styles.tableHeader]}><Text variant="caption" tone="dim" style={{ flex: 1 }}>BATTER</Text>{['R', 'B', '4S', '6S', 'SR'].map(label => <Text key={label} variant="caption" tone="dim" style={tableNumberStyle}>{label}</Text>)}</View>;
}
function BattingRow({ name, row, live }: { name: string; row: CompleteInningsScorecardData['batters'][number]; live: boolean }) {
  return <View style={styles.tableLine}><View style={{ flex: 1, paddingRight: spacing.xs }}><Text variant="bodyStrong">{name}{live ? ' *' : ''}</Text>{row.dismissal && <Text variant="caption" tone="muted">{row.dismissal}</Text>}</View>{[row.runs, row.balls, row.fours, row.sixes, row.balls ? (row.runs * 100 / row.balls).toFixed(0) : '0'].map((value, index) => <Text key={index} variant="caption" style={tableNumberStyle}>{value}</Text>)}</View>;
}
function BowlingHeader() {
  return <View style={[styles.tableLine, styles.tableHeader]}><Text variant="caption" tone="dim" style={{ flex: 1 }}>BOWLER</Text>{['O', 'R', 'W', 'ECON'].map(label => <Text key={label} variant="caption" tone="dim" style={[tableNumberStyle, label === 'ECON' && { width: 42 }]}>{label}</Text>)}</View>;
}
function BowlingRow({ name, row }: { name: string; row: CompleteInningsScorecardData['bowlers'][number] }) {
  const economy = row.balls ? row.runs * 6 / row.balls : 0;
  return <View style={styles.tableLine}><Text variant="bodyStrong" style={{ flex: 1 }}>{name}</Text>{[formatOver(row.balls), row.runs, row.wickets, economy.toFixed(1)].map((value, index) => <Text key={index} variant="caption" style={[tableNumberStyle, index === 3 && { width: 42 }]}>{value}</Text>)}</View>;
}
function RateComparison({ label, value, max }: { label: string; value: number; max: number }) {
  return <View style={styles.rateComparison}><View style={styles.rateLabel}><Text variant="caption" tone="muted">{label}</Text><Text variant="caption">{value.toFixed(2)}</Text></View><View style={styles.rateTrack}><View style={[styles.rateFill, { width: `${Math.min(100, value / max * 100)}%` }]} /></View></View>;
}
function EmptyState({ icon, title, detail }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; detail: string }) {
  return <View style={styles.emptyState}><View style={styles.emptyIcon}><MaterialCommunityIcons name={icon} size={24} color={colors.textMuted} /></View><Text variant="h3">{title}</Text><Text tone="muted" style={{ textAlign: 'center' }}>{detail}</Text></View>;
}
function SkeletonRows() {
  return <Card><View style={styles.skeletonTitle} />{Array.from({ length: 5 }, (_, index) => <View key={index} style={styles.skeletonRow} />)}</Card>;
}

const styles = StyleSheet.create({
  stickyHeader: {
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  feedScroll: { flex: 1 },
  feedContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: spacing.xxxl,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  retryButton: { backgroundColor: colors.accent, borderRadius: radius.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  completeTag: { borderWidth: 1, borderColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  upcomingTag: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  matchHeader: { gap: spacing.sm },
  teamsLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  teamName: { flex: 1 },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 22 },
  hero: { alignItems: 'center', paddingVertical: spacing.md },
  score: { fontSize: 44, lineHeight: 50, fontWeight: '800', color: colors.text },
  quickStats: { flexDirection: 'row', width: '100%', marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  section: { gap: spacing.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  recapLead: { paddingVertical: spacing.sm },
  performerGrid: { flexDirection: 'row', gap: spacing.sm },
  performerCard: { flex: 1, minWidth: 0 },
  momentLine: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  rateRow: { flexDirection: 'row', marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  ballStrip: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  outcomeDot: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  storyline: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#20331f', borderWidth: 1, borderColor: '#3e5e34', borderRadius: 10 },
  resultCard: { alignItems: 'center', gap: spacing.sm, borderColor: colors.gold, backgroundColor: colors.goldMuted },
  commentaryRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  systemEvent: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md },
  systemIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  commentaryDetail: { marginTop: spacing.xs, lineHeight: 18 },
  ballBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  wicketBadge: { borderWidth: 1, borderColor: colors.danger },
  insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  potmCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: colors.gold },
  iconDisc: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  probabilityBar: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceElevated, overflow: 'hidden', marginTop: spacing.lg },
  probabilityFill: { height: '100%', backgroundColor: colors.accent },
  probabilityLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  statName: { flex: 1 },
  statValue: { width: 48, textAlign: 'right' },
  inningsSwitcher: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inningsPill: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  inningsPillActive: { backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent },
  scorecardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tableCard: { paddingHorizontal: spacing.md },
  tableLine: { minHeight: 45, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeader: { minHeight: 36, marginTop: spacing.sm },
  groupLabel: { marginTop: spacing.lg, marginBottom: spacing.xs },
  yetToBat: { paddingVertical: spacing.xs },
  squadSubTabs: { flexDirection: 'row', padding: spacing.xs, gap: spacing.xs, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  squadSubTab: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.sm },
  squadSubTabActive: { backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent },
  squadsGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  squadColumn: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, overflow: 'hidden' },
  squadHeader: { minHeight: 48, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  squadRow: { minHeight: 74, justifyContent: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  squadPlayerLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  squadMetaLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, paddingLeft: 30 },
  squadStatus: { marginTop: 3, paddingLeft: 30, fontSize: 10 },
  squadEmpty: { minHeight: 90, textAlign: 'center', textAlignVertical: 'center', paddingTop: spacing.xl },
  jerseyBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderStrong },
  roleTag: { minWidth: 32, paddingVertical: 2, paddingHorizontal: spacing.xs, alignItems: 'center', borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  h2hTotals: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h2hNumber: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.text },
  h2hBar: { height: 8, flexDirection: 'row', marginTop: spacing.lg, overflow: 'hidden', borderRadius: 4, backgroundColor: colors.surfaceElevated },
  h2hBarA: { backgroundColor: colors.accent },
  h2hBarB: { backgroundColor: colors.textMuted },
  resultStrip: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  resultChip: { width: 48, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  rateComparison: { marginTop: spacing.md },
  rateLabel: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  rateTrack: { height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surfaceElevated },
  rateFill: { height: '100%', backgroundColor: colors.accent },
  emptyState: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  skeletonTitle: { width: '40%', height: 16, borderRadius: 4, backgroundColor: colors.surfaceElevated, marginBottom: spacing.md },
  skeletonRow: { height: 42, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  celebration: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    overflow: 'hidden',
  },
  celebrationRing: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 2,
    opacity: 0.35,
  },
  celebrationRingLarge: {
    width: 350,
    height: 350,
    borderRadius: 175,
    borderWidth: 1,
    opacity: 0.18,
  },
  celebrationTitle: {
    marginTop: spacing.md,
    fontSize: 58,
    lineHeight: 66,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  celebrationSubtitle: {
    color: colors.text,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  sixDots: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  sixDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
});
