import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { CloudLiveMatch, CloudMatchEvent, liveMatchApi } from '@/lib/supabase/liveMatchApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { DEFAULT_RULES, MatchFormat } from '@/lib/wricket/domain/types';
import { formatOver } from '@/lib/wricket/domain/scoring';

type FeedTab = 'summary' | 'commentary' | 'scorecard' | 'insights';
type CelebrationType = 'WICKET' | 'FOUR' | 'SIX' | 'MATCH_WIN';
interface Celebration {
  type: CelebrationType;
  title: string;
  subtitle: string;
}

export default function CloudLiveMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [match, setMatch] = useState<CloudLiveMatch | null>(null);
  const [tab, setTab] = useState<FeedTab>('summary');
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
    try {
      const next = await liveMatchApi.get(id);
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
      setError(cause instanceof Error ? cause.message : 'Could not load the live feed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => id ? liveMatchApi.subscribe(id, () => {
    setRealtimeError(undefined);
    void load();
  }, setRealtimeError) : undefined, [id, load]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  const scorecard = useMemo(() => match ? buildScorecard(match) : null, [match]);
  if (loading && !match) return <Screen><Text tone="muted">Loading live feed…</Text></Screen>;
  if (!match) {
    return <Screen><Stack.Screen options={{ title: 'Live match' }} /><View style={styles.centered}>
      <Text variant="h2">Match unavailable</Text><Text tone="muted">{error}</Text>
      <Pressable style={styles.retryButton} onPress={() => void load()}>
        <Text variant="bodyStrong" style={{ color: colors.accentInk }}>Try again</Text>
      </Pressable>
    </View></Screen>;
  }

  const insights = calculateInsights(match);
  const battingTeam = match.innings?.battingTeamId === match.teamA.id ? match.teamA : match.teamB;
  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: `${match.teamA.shortName} vs ${match.teamB.shortName}` }} />
      <View style={styles.stickyHeader}>
        <View style={styles.statusRow}>
          <View style={styles.liveDot} />
          <Text variant="overline" style={{ color: colors.danger }}>LIVE</Text>
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>{match.tournamentName}</Text>
          <MaterialCommunityIcons
            name={realtimeError ? 'cloud-alert-outline' : 'access-point'}
            size={20}
            color={realtimeError ? colors.danger : colors.accent}
          />
        </View>
        {(realtimeError || error) && <Card style={{ borderColor: colors.danger }}>
          <Text variant="caption">{realtimeError ?? error} Pull down to refresh.</Text>
        </Card>}

        <View style={styles.matchHeader}>
          <Text variant="h2">{match.teamA.name}</Text>
          <Text variant="caption" tone="dim">vs</Text>
          <Text variant="h2">{match.teamB.name}</Text>
          {match.venue && <Text variant="caption" tone="muted">{match.venue}</Text>}
        </View>

        <Card style={styles.hero}>
          <Text variant="overline" tone="muted">{battingTeam.shortName} · INNINGS {match.innings?.sequence ?? 1}</Text>
          <Text style={styles.score}>{match.score.runs}/{match.score.wickets}</Text>
          <Text variant="h3" tone="muted">{formatOver(match.score.legalBalls)} overs</Text>
          {match.innings?.target != null && <Text variant="bodyStrong" style={{ marginTop: spacing.sm }}>
            Target {match.innings.target} · Need {Math.max(0, match.innings.target - match.score.runs)} runs
          </Text>}
          <View style={styles.quickStats}>
            <MiniStat label="CRR" value={insights.crr.toFixed(2)} />
            <MiniStat label="RRR" value={insights.rrr == null ? '—' : insights.rrr.toFixed(2)} />
            <MiniStat label="WIN%" value={`${insights.battingWinProbability}%`} />
          </View>
        </Card>

        <View style={styles.tabs}>
          {(['summary', 'commentary', 'scorecard', 'insights'] as const).map(item => (
            <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}>
              <Text variant="caption" tone={tab === item ? 'accent' : 'muted'}>
                {item.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.feedScroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        contentContainerStyle={styles.feedContent}
      >
        {tab === 'summary' && <Summary match={match} insights={insights} />}
        {tab === 'commentary' && <Commentary match={match} />}
        {tab === 'scorecard' && scorecard && <Scorecard match={match} data={scorecard} />}
        {tab === 'insights' && <Insights match={match} insights={insights} />}
      </ScrollView>
      {celebration && (
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
  return <View style={styles.section}>
    <Card>
      <Text variant="overline" tone="muted">MATCH SITUATION</Text>
      <Text variant="h3" style={{ marginTop: spacing.sm }}>{situationText(match, insights)}</Text>
    </Card>
    <Card>
      <Text variant="overline" tone="muted">LATEST</Text>
      <Text variant="bodyStrong" style={{ marginTop: spacing.sm }}>
        {match.commentary[0]
          ? commentaryHeadline(match, match.commentary[0])
          : 'Waiting for the first delivery'}
      </Text>
    </Card>
    <Commentary match={{ ...match, commentary: match.commentary.slice(0, 6) }} />
  </View>;
}

function Commentary({ match }: { match: CloudLiveMatch }) {
  if (!match.commentary.length) return <Empty text="Commentary begins with the first scoring event." />;
  const insights = buildCommentaryInsights(match);
  return <View style={styles.section}>{match.commentary.map(event => (
    <View key={event.id} style={styles.commentaryRow}>
      <View style={[styles.ballBadge, Boolean(event.payload.is_wicket) && styles.wicketBadge]}>
        <Text variant="caption" style={{ color: event.payload.is_wicket ? colors.danger : colors.text }}>
          {ballLabel(event)}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{commentaryHeadline(match, event)}</Text>
        {insights.get(event.id)?.detail && (
          <Text variant="caption" tone="muted" style={styles.commentaryDetail}>
            {insights.get(event.id)?.detail}
          </Text>
        )}
        <Text variant="caption" tone="dim">{new Date(event.createdAt).toLocaleTimeString()}</Text>
      </View>
    </View>
  ))}</View>;
}

interface ScorecardData {
  batters: { id: string; runs: number; balls: number; fours: number; sixes: number; out: boolean }[];
  bowlers: { id: string; runs: number; balls: number; wickets: number }[];
}
function Scorecard({ match, data }: { match: CloudLiveMatch; data: ScorecardData }) {
  return <View style={styles.section}>
    <Card>
      <Text variant="h3">Batting</Text>
      <TableHeader columns={['BATTER', 'R', 'B', 'SR']} />
      {data.batters.map(row => <StatRow
        key={row.id}
        name={`${match.playerNames[row.id] ?? 'Batter'}${row.out ? ' †' : '*'}`}
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

function Insights({ match, insights }: { match: CloudLiveMatch; insights: MatchInsights }) {
  const batting = match.innings?.battingTeamId === match.teamA.id ? match.teamA : match.teamB;
  const bowling = batting.id === match.teamA.id ? match.teamB : match.teamA;
  return <View style={styles.section}>
    <View style={styles.insightGrid}>
      <InsightCard label="CURRENT RATE" value={insights.crr.toFixed(2)} />
      <InsightCard label="REQUIRED RATE" value={insights.rrr == null ? '—' : insights.rrr.toFixed(2)} />
      <InsightCard label="PROJECTED SCORE" value={String(insights.projectedScore)} />
      <InsightCard label="BALLS LEFT" value={String(insights.ballsRemaining)} />
    </View>
    <Card>
      <Text variant="h3">Win predictor</Text>
      <View style={styles.probabilityBar}>
        <View style={[styles.probabilityFill, { width: `${insights.battingWinProbability}%` }]} />
      </View>
      <View style={styles.probabilityLabels}>
        <Text variant="bodyStrong">{batting.shortName} {insights.battingWinProbability}%</Text>
        <Text variant="bodyStrong">{bowling.shortName} {100 - insights.battingWinProbability}%</Text>
      </View>
      <Text variant="caption" tone="dim" style={{ marginTop: spacing.md }}>
        Experimental estimate based on target, rates, wickets and balls remaining—not betting advice.
      </Text>
    </Card>
  </View>;
}

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
      row.out = true; batters.set(outId, row);
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
  if (event.kind === 'INNINGS_ENDED') return 'End of innings.';
  if (event.kind === 'MATCH_COMPLETED') return 'Match completed.';
  return event.kind.replaceAll('_', ' ').toLowerCase();
}

function buildCommentaryInsights(match: CloudLiveMatch): Map<string, CommentaryInsight> {
  const result = new Map<string, CommentaryInsight>();
  const batters = new Map<string, CommentaryBatterState>();

  [...match.commentary]
    .sort((left, right) => left.sequence - right.sequence)
    .forEach(event => {
      if (event.kind === 'INNINGS_STARTED') {
        batters.clear();
        return;
      }
      if (event.kind !== 'BALL_RECORDED') return;
      const payload = event.payload;
      const strikerId = stringValue(payload.striker_id);
      if (strikerId) {
        const batter = batters.get(strikerId) ?? emptyBatterState();
        const batRuns = Number(payload.runs_bat ?? 0);
        batter.runs += batRuns;
        if (payload.is_legal) batter.balls += 1;
        if (batRuns === 4) batter.fours += 1;
        if (batRuns === 6) batter.sixes += 1;
        batters.set(strikerId, batter);
      }

      if (!payload.is_wicket) return;
      const outPlayerId = stringValue(payload.out_player_id) ?? strikerId;
      const batter = outPlayerId
        ? batters.get(outPlayerId) ?? emptyBatterState()
        : emptyBatterState();
      const batterName = playerName(match, outPlayerId, 'Batter');
      const dismissal = dismissalScorecardText(match, event);
      const strikeRate = batter.balls ? (batter.runs / batter.balls) * 100 : 0;
      result.set(event.id, {
        detail: `${batterName} ${dismissal} (${batter.runs}r ${batter.balls}b ${batter.fours}x4 ${batter.sixes}x6 SR: ${strikeRate.toFixed(2)})`,
      });
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
function situationText(match: CloudLiveMatch, insights: MatchInsights) {
  if (match.innings?.target != null) {
    return `${Math.max(0, match.innings.target - match.score.runs)} runs needed from ${insights.ballsRemaining} balls`;
  }
  return `Projected score ${insights.projectedScore} at the current rate`;
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return <View style={{ flex: 1, alignItems: 'center' }}><Text variant="caption" tone="dim">{label}</Text><Text variant="h3">{value}</Text></View>;
}
function InsightCard({ label, value }: { label: string; value: string }) {
  return <Card style={{ width: '48%' }}><Text variant="caption" tone="dim">{label}</Text><Text variant="h2">{value}</Text></Card>;
}
function TableHeader({ columns }: { columns: string[] }) {
  return <View style={styles.statRow}>{columns.map((column, i) => <Text key={column} variant="caption" tone="dim" style={i ? styles.statValue : styles.statName}>{column}</Text>)}</View>;
}
function StatRow({ name, values }: { name: string; values: (string | number)[] }) {
  return <View style={styles.statRow}><Text variant="bodyStrong" style={styles.statName}>{name}</Text>{values.map((value, i) => <Text key={i} variant="body" style={styles.statValue}>{value}</Text>)}</View>;
}
function Empty({ text }: { text: string }) {
  return <Card><Text variant="body" tone="muted" style={{ textAlign: 'center' }}>{text}</Text></Card>;
}

const styles = StyleSheet.create({
  stickyHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  feedScroll: { flex: 1 },
  feedContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  retryButton: { backgroundColor: colors.accent, borderRadius: radius.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger },
  matchHeader: { alignItems: 'center', gap: spacing.xs },
  hero: { alignItems: 'center', paddingVertical: spacing.md },
  score: { fontSize: 44, lineHeight: 50, fontWeight: '800', color: colors.text },
  quickStats: { flexDirection: 'row', width: '100%', marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  section: { gap: spacing.md },
  commentaryRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  commentaryDetail: { marginTop: spacing.xs, lineHeight: 18 },
  ballBadge: { minWidth: 45, height: 34, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  wicketBadge: { borderWidth: 1, borderColor: colors.danger },
  insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  probabilityBar: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceElevated, overflow: 'hidden', marginTop: spacing.lg },
  probabilityFill: { height: '100%', backgroundColor: colors.accent },
  probabilityLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  statName: { flex: 1 },
  statValue: { width: 48, textAlign: 'right' },
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
