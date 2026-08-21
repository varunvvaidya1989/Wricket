import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportIcon } from '@/components/sports/SportIcon';
import { AppHeader } from '@/components/ui/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import { sportStageContent } from '@/lib/sports/platform/sportLiveContent';
import { sportScoringApi, type SportCloudMatchFeed, type SportCloudScoringEvent } from '@/lib/supabase/sportScoringApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const REFRESH_INTERVAL_MS = 5000;

export function SportCloudMatchFeedScreen({ sportId }: { sportId: ScoringSportId }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const liveContent = sportStageContent(presentation.catalogCode);
  const [feed, setFeed] = useState<SportCloudMatchFeed>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async (silent = false) => {
    if (!id) { setError('The match feed link is incomplete.'); setLoading(false); return; }
    if (silent) setRefreshing(true);
    else setLoading(true);
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
      setRefreshing(false);
    }
  }, [auth.profile?.connectedSports, config.name, id, presentation.catalogCode]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => void load(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]));

  if (loading && !feed) return <Screen><View style={styles.center}><ActivityIndicator color={presentation.accent} /><Text tone="muted">Opening match feed...</Text></View></Screen>;
  if (!feed) return <Screen padded={false}><AppHeader title="Match feed" eyebrow={config.name.toUpperCase()} back /><View style={styles.center}><MaterialCommunityIcons name="scoreboard-outline" size={38} color={colors.textDim} /><Text variant="h3">Match feed unavailable</Text><Text tone="muted" style={styles.centerCopy}>{friendlyFeedError(error)}</Text></View></Screen>;

  return <Screen scroll padded={false}>
    <AppHeader title="Match feed" eyebrow={`${config.name.toUpperCase()} - ${feed.status}`} back right={<Pressable accessibilityRole="button" accessibilityLabel="Refresh match feed" onPress={() => void load(true)} style={styles.headerAction}>{refreshing ? <ActivityIndicator size="small" color={presentation.accent} /> : <MaterialCommunityIcons name="refresh" size={21} color={colors.text} />}</Pressable>} />
    <View style={styles.content}>
      {error ? <View accessibilityRole="alert" style={styles.warning}><MaterialCommunityIcons name="cloud-alert-outline" size={18} color={colors.gold} /><Text variant="caption" style={styles.flex}>{friendlyFeedError(error)}</Text></View> : null}
      <View style={[styles.scoreCard, { borderColor: presentation.accent }]}>
        <View style={styles.competition}><SportIcon code={presentation.catalogCode} size={19} color={presentation.accent} /><Text variant="overline" style={{ color: presentation.accent }}>{feed.competitionName}</Text></View>
        <View style={styles.matchup}><Text variant="h2" numberOfLines={2} style={styles.side}>{feed.participantA}</Text><Text variant="scoreLg" style={[styles.score, { color: presentation.accent }]}>{feed.headlineScore}</Text><Text variant="h2" numberOfLines={2} style={[styles.side, styles.sideRight]}>{feed.participantB}</Text></View>
        <View style={styles.meta}><Text variant="overline" tone="dim">{feed.matchFormat.replaceAll('_', ' ')}</Text><Text variant="overline" tone="dim">EVENT {feed.currentSequence}</Text><Text variant="overline" style={{ color: feed.status === 'LIVE' ? colors.live : colors.textMuted }}>{feed.status}</Text></View>
      </View>

      <View style={styles.sectionTitle}><Text variant="overline" tone="muted">{liveContent.timelineLabel.toUpperCase()}</Text><Text variant="caption" tone="dim">Newest first - refreshes every 5s</Text></View>
      {feed.events.length ? <View style={styles.timeline}>{feed.events.map((event) => <FeedEvent key={event.sequence} event={event} accent={presentation.accent} />)}</View> : <View style={styles.empty}><MaterialCommunityIcons name="timeline-clock-outline" size={30} color={colors.textDim} /><Text variant="bodyStrong">Waiting for the first event</Text><Text variant="caption" tone="muted">The feed will update automatically when scoring starts.</Text></View>}
    </View>
  </Screen>;
}

function FeedEvent({ event, accent }: { event: SportCloudScoringEvent; accent: string }) {
  return <View style={styles.event}>
    <View style={[styles.sequence, { borderColor: accent }]}><Text variant="mono" style={{ color: accent }}>{event.sequence}</Text></View>
    <View style={styles.flex}><Text variant="bodyStrong">{eventTitle(event)}</Text><Text variant="caption" tone="muted">{eventDescription(event)}</Text><Text variant="overline" tone="dim" style={styles.eventTime}>{new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></View>
  </View>;
}

function eventTitle(event: SportCloudScoringEvent) {
  return event.kind.replaceAll('_', ' ').toLowerCase().replace(/^./, (value) => value.toUpperCase());
}

function eventDescription(event: SportCloudScoringEvent) {
  const headline = event.payload.headline_score;
  if (typeof headline === 'string') return `Score ${headline}`;
  const side = event.payload.side ?? event.payload.winner;
  if (side === 0 || side === 'A') return 'Event awarded to side A';
  if (side === 1 || side === 'B') return 'Event awarded to side B';
  return event.kind === 'COMPLETED' ? 'The final result is confirmed.' : 'The official scoring log was updated.';
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
  headerAction: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  warning: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.goldMuted, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scoreCard: { padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, backgroundColor: '#111D17', gap: spacing.lg },
  competition: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  matchup: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  side: { flex: 1, minWidth: 0 },
  sideRight: { textAlign: 'right' },
  score: { minWidth: 96, textAlign: 'center' },
  meta: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  sectionTitle: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  timeline: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  event: { minHeight: 78, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sequence: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  eventTime: { marginTop: spacing.xs },
  empty: { minHeight: 220, padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
});
