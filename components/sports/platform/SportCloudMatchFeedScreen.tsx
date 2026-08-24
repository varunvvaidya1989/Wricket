import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportIcon } from '@/components/sports/SportIcon';
import { SportLiveActivityBadge } from '@/components/sports/platform/SportLiveActivityBadge';
import { AppHeader } from '@/components/ui/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import { SPORT_CONFIGS, SPORT_PRESENTATION, activePointEvents, formatLiveHeadline, replay, type ScoringSportId } from '@/lib/sports/scoring';
import { sportStageContent } from '@/lib/sports/platform/sportLiveContent';
import { buildSportMatchTimeline, splitLiveHeadline } from '@/lib/sports/platform/sportMatchTimeline';
import { sportScoringApi, type SportCloudMatchFeed } from '@/lib/supabase/sportScoringApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function SportCloudMatchFeedScreen({ sportId }: { sportId: ScoringSportId }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const liveContent = sportStageContent(presentation.catalogCode);
  const [feed, setFeed] = useState<SportCloudMatchFeed>();
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async (silent = false) => {
    if (!id) { setError('The match feed link is incomplete.'); setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const next = await sportScoringApi.feed(id);
      const connectedSport = auth.profile?.connectedSports.find((sport) => sport.code === presentation.catalogCode);
      if (!connectedSport || connectedSport.accessStatus !== 'ACTIVE' || connectedSport.id !== next.sportId) {
        throw new Error(`This match is not available with your current ${config.name} app selection.`);
      }
      setFeed(next);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this match feed.');
    } finally {
      setLoading(false);
    }
  }, [auth.profile?.connectedSports, config.name, id, presentation.catalogCode]);

  useFocusEffect(useCallback(() => {
    void load();
    if (!id) return undefined;
    return sportScoringApi.subscribe(
      id,
      () => void load(true),
      (message) => setError(message),
      setRealtimeConnected,
    );
  }, [id, load]));

  const matchView = useMemo(() => {
    if (!feed) return undefined;
    const options = feed.rulesSnapshot.options && typeof feed.rulesSnapshot.options === 'object'
      && !Array.isArray(feed.rulesSnapshot.options)
      ? feed.rulesSnapshot.options as Record<string, boolean | number | string | undefined>
      : {};
    const settings = {
      initialServer: feed.rulesSnapshot.initial_server === 1 ? 1 as const : 0 as const,
      options,
    };
    const sideNames = [feed.participantA, feed.participantB] as const;
    const points = activePointEvents(feed.events);
    const headline = formatLiveHeadline(config, replay(config, points, settings));
    return {
      sideNames,
      pointCount: points.length,
      score: splitLiveHeadline(headline),
      timeline: buildSportMatchTimeline(config, feed.events, sideNames, settings),
      unitLabel: config.root.child?.level === 'set' ? 'SETS WON' : 'GAMES WON',
    };
  }, [config, feed]);

  if (loading && !feed) return <Screen padded={false}><SportStageLoader message={`Opening ${config.name} match feed`} detail="Connecting live events and match context" accent={presentation.accent} /></Screen>;
  if (!feed || !matchView) return <Screen padded={false}><AppHeader title="Match feed" eyebrow={config.name.toUpperCase()} back /><View style={styles.center}><MaterialCommunityIcons name="scoreboard-outline" size={38} color={colors.textDim} /><Text variant="h3">Match feed unavailable</Text><Text tone="muted" style={styles.centerCopy}>{friendlyFeedError(error)}</Text></View></Screen>;

  return <Screen scroll padded={false}>
    <AppHeader title="Match feed" eyebrow={config.name.toUpperCase()} back />
    <View style={styles.content}>
      {error ? <View accessibilityRole="alert" style={styles.warning}><MaterialCommunityIcons name="cloud-alert-outline" size={18} color={colors.gold} /><Text variant="caption" style={styles.flex}>{friendlyFeedError(error)}</Text></View> : null}
      <View style={[styles.scoreCard, { borderColor: presentation.accent }]}>
        <View style={styles.competition}><View style={styles.competitionIdentity}><SportIcon code={presentation.catalogCode} size={19} color={presentation.accent} /><Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>{feed.competitionName}</Text></View>{feed.status === 'LIVE' ? <SportLiveActivityBadge count={1} appearance="card" /> : <Text variant="overline" tone="muted">{feed.status}</Text>}</View>
        <View style={styles.matchup}>
          <PlayerIdentity label={feed.matchFormat === 'SINGLES' ? 'PLAYER 1' : 'SIDE 1'} name={feed.participantA} />
          <View style={styles.versus}><Text variant="overline" tone="dim">VS</Text></View>
          <PlayerIdentity label={feed.matchFormat === 'SINGLES' ? 'PLAYER 2' : 'SIDE 2'} name={feed.participantB} right />
        </View>
        <View style={styles.scoreBreakdown}>
          <ScoreUnit label={matchView.unitLabel} value={matchView.score.match} accent={presentation.accent} />
          <View style={styles.scoreDivider} />
          <ScoreUnit label="CURRENT GAME" value={matchView.score.current} accent={presentation.accent} />
        </View>
        <View style={styles.meta}><Text variant="overline" tone="dim">{feed.matchFormat.replaceAll('_', ' ')}</Text><Text variant="overline" tone="dim">{sportId === 'pickleball' ? 'RALLY' : 'POINT'} {matchView.pointCount}</Text></View>
      </View>

      <View style={styles.sectionTitle}><Text variant="overline" tone="muted">{liveContent.timelineLabel.toUpperCase()}</Text><View style={styles.connection}><View style={[styles.connectionDot, { backgroundColor: realtimeConnected ? colors.live : colors.gold }]} /><Text variant="caption" tone="dim">{realtimeConnected ? 'Updating live' : 'Reconnecting'}</Text></View></View>
      {matchView.timeline.length ? <View style={styles.timeline}>{matchView.timeline.map((item) => <FeedEvent key={item.event.sequence} item={item} accent={presentation.accent} />)}</View> : <View style={styles.empty}><MaterialCommunityIcons name="timeline-clock-outline" size={30} color={colors.textDim} /><Text variant="bodyStrong">Waiting for the first point</Text><Text variant="caption" tone="muted">This timeline will update automatically when scoring starts.</Text></View>}
    </View>
  </Screen>;
}

function FeedEvent({ item, accent }: { item: ReturnType<typeof buildSportMatchTimeline>[number]; accent: string }) {
  const event = item.event;
  return <View style={styles.event}>
    <View style={[styles.sequence, { borderColor: accent }]}><Text variant="mono" style={{ color: accent }}>{item.marker}</Text></View>
    <View style={styles.flex}><Text variant="bodyStrong">{item.title}</Text><Text variant="caption" tone="muted">{item.description}</Text><Text variant="overline" tone="dim" style={styles.eventTime}>{formatEventTime(event.createdAt, item.elapsedMs)}</Text></View>
  </View>;
}

function PlayerIdentity({ label, name, right = false }: { label: string; name: string; right?: boolean }) {
  return <View style={[styles.playerIdentity, right && styles.playerIdentityRight]}><Text variant="overline" tone="dim">{label}</Text><Text variant="h3" numberOfLines={2} style={right ? styles.sideRight : undefined}>{name}</Text></View>;
}

function ScoreUnit({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <View style={styles.scoreUnit}><Text variant="overline" tone="dim">{label}</Text><Text variant="scoreLg" style={{ color: accent }}>{value}</Text></View>;
}

function formatEventTime(value: string, elapsedMs?: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  const clock = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (elapsedMs === undefined) return clock;
  const elapsed = elapsedMs < 1000 ? `${elapsedMs} ms` : `${(elapsedMs / 1000).toFixed(1)} s`;
  return `${clock} · +${elapsed}`;
}

function friendlyFeedError(error?: string) {
  if (!error) return 'This match may have ended, moved, or no longer be available to your account.';
  if (/row|result|json|single/i.test(error)) return 'This match is unavailable or you do not have permission to view its detailed feed.';
  return error;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  centerCopy: { maxWidth: 480, textAlign: 'center', lineHeight: 21 },
  warning: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.goldMuted, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scoreCard: { padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, backgroundColor: '#111D17', gap: spacing.lg },
  competition: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  competitionIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  matchup: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  playerIdentity: { flex: 1, minWidth: 0, gap: 5 },
  playerIdentityRight: { alignItems: 'flex-end' },
  sideRight: { textAlign: 'right' },
  versus: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  scoreBreakdown: { minHeight: 88, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center' },
  scoreUnit: { flex: 1, alignItems: 'center', gap: spacing.xs },
  scoreDivider: { width: 1, height: 48, backgroundColor: colors.border },
  meta: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  sectionTitle: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  connectionDot: { width: 6, height: 6, borderRadius: 3 },
  timeline: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  event: { minHeight: 78, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sequence: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  eventTime: { marginTop: spacing.xs },
  empty: { minHeight: 220, padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
});
