import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportIcon } from '@/components/sports/SportIcon';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  activePointEvents,
  appendPointEvent,
  formatLiveHeadline,
  pointDetailChoiceLabel,
  pointDetailOptions,
  type PointDetail,
  lastActivePointEvent,
  replay,
  type ScoringEffect,
  type ScoringSportId,
  type Side,
} from '@/lib/sports/scoring';
import {
  createSportScoringClientEventId,
  sportScoringApi,
  type SportCloudMatchFeed,
  type SportScoringLease,
} from '@/lib/supabase/sportScoringApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { RacquetScorePanel } from './RacquetScorePanel';
import { TwoZonePointPad } from './TwoZonePointPad';

export function SportCloudLiveScoreScreen({ sportId }: { sportId: ScoringSportId }) {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [feed, setFeed] = useState<SportCloudMatchFeed>();
  const [lease, setLease] = useState<SportScoringLease>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<ScoringEffect>();
  const [pendingWinner, setPendingWinner] = useState<Side>();
  const queue = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(async (silent = false) => {
    if (!id) {
      setError('The match ID is missing.');
      setLoading(false);
      return;
    }
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
      setError(cause instanceof Error ? cause.message : 'Could not load this match.');
    } finally {
      setLoading(false);
    }
  }, [auth.profile?.connectedSports, config.name, id, presentation.catalogCode]);

  const acquireLease = useCallback(async () => {
    if (!id || mode === 'view') return;
    try {
      setLease(await sportScoringApi.acquireLease(id));
    } catch (cause) {
      setLease(undefined);
      const message = cause instanceof Error ? cause.message : 'Only the assigned scorer can record points.';
      if (!/only an assigned|another scoring device/i.test(message)) setError(message);
    }
  }, [id, mode]);

  useFocusEffect(useCallback(() => {
    void load();
    void acquireLease();
    if (!id) return undefined;
    return sportScoringApi.subscribe(id, () => void load(true), (message) => setError(message));
  }, [acquireLease, id, load]));

  const setup = useMemo(() => {
    if (!feed) return undefined;
    const initialServer: Side = feed.rulesSnapshot.initial_server === 1 ? 1 : 0;
    const options = feed.rulesSnapshot.options && typeof feed.rulesSnapshot.options === 'object'
      && !Array.isArray(feed.rulesSnapshot.options)
      ? feed.rulesSnapshot.options as Record<string, boolean | number | string | undefined>
      : {};
    const sideNames = [feed.sideAPlayers.join(' / ') || 'Side A', feed.sideBPlayers.join(' / ') || 'Side B'] as const;
    const events = activePointEvents(feed.events);
    return { initialServer, options, sideNames, events };
  }, [feed]);
  const state = useMemo(() => setup ? replay(config, setup.events, {
    initialServer: setup.initialServer,
    options: setup.options,
  }) : undefined, [config, setup]);
  const canScore = Boolean(lease) && mode !== 'view' && !submitting;

  const record = (operation: () => Promise<void>) => {
    queue.current = queue.current
      .then(operation)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not save this rally.'));
  };

  const choosePointWinner = (winner: Side) => {
    if (!feed || !setup || !state || !lease || state.isComplete || submitting) return;
    setPendingWinner(winner);
  };

  const confirmPoint = (selectedPointDetail: PointDetail) => {
    const winner = pendingWinner;
    setPendingWinner(undefined);
    if (!feed || !setup || !state || !lease || state.isComplete || submitting) return;
    if (winner === undefined) return;
    const nextEvents = appendPointEvent(setup.events, {
      type: 'POINT', sequence: feed.currentSequence + 1, winner, occurredAt: Date.now(),
    });
    const nextState = replay(config, nextEvents, { initialServer: setup.initialServer, options: setup.options });
    setSubmitting(true);
    record(async () => {
      try {
        const point = await sportScoringApi.append({
          scoringMatchId: feed.id,
          clientEventId: createSportScoringClientEventId(),
          expectedSequence: feed.currentSequence,
          leaseToken: lease.leaseToken,
          kind: 'POINT',
          payload: {
            winner,
            point_type: selectedPointDetail,
            headline_score: formatLiveHeadline(config, nextState),
          },
        });
        if (nextState.isComplete && nextState.winner !== undefined) {
          await sportScoringApi.append({
            scoringMatchId: feed.id,
            clientEventId: createSportScoringClientEventId(),
            expectedSequence: point.sequence,
            leaseToken: lease.leaseToken,
            kind: 'COMPLETED',
            payload: {
              winner_side: nextState.winner,
              winner_entry_id: nextState.winner === 0 ? feed.entrantAId : feed.entrantBId,
              headline_score: formatLiveHeadline(config, nextState),
            },
          });
        }
        setNotice(nextState.effectsByEvent.at(-1)?.[0]);
        await load(true);
      } finally {
        setSubmitting(false);
      }
    });
  };

  const undo = () => {
    const target = feed ? lastActivePointEvent(feed.events) : undefined;
    if (!feed || !setup || !lease || !target || submitting) return;
    const remainingEvents = activePointEvents(
      feed.events.filter((event) => event.clientEventId !== target.clientEventId),
    );
    const nextState = replay(config, remainingEvents, {
      initialServer: setup.initialServer,
      options: setup.options,
    });
    setSubmitting(true);
    record(async () => {
      try {
        await sportScoringApi.append({
          scoringMatchId: feed.id,
          clientEventId: createSportScoringClientEventId(),
          expectedSequence: feed.currentSequence,
          leaseToken: lease.leaseToken,
          kind: 'UNDO',
          payload: {
            reversed_client_event_id: target.clientEventId,
            headline_score: formatLiveHeadline(config, nextState),
          },
          reversesClientEventId: target.clientEventId,
        });
        setNotice(undefined);
        await load(true);
      } finally {
        setSubmitting(false);
      }
    });
  };

  if (loading && !feed) {
    return <Screen padded={false}><SportStageLoader message="Opening synchronized scorecard" detail="Connecting scorer lease and live event stream" accent={presentation.accent} /></Screen>;
  }
  if (!feed || !setup || !state) {
    return <Screen padded={false}><AppHeader title={`${config.name} score`} back /><View style={styles.center}><MaterialCommunityIcons name="scoreboard-outline" size={38} color={colors.textDim} /><Text variant="h3">Match unavailable</Text><Text tone="muted" style={styles.centerText}>{error ?? 'This match could not be restored.'}</Text></View></Screen>;
  }

  const switchCount = state.effects.filter((effect) => effect.type === 'SWITCH_ENDS').length;
  const padOrder: readonly [Side, Side] = switchCount % 2 === 1 ? [1, 0] : [0, 1];
  const undoTarget = lastActivePointEvent(feed.events);
  const doubles = feed.matchFormat !== 'SINGLES';

  return (
    <Screen padded={false} edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader title={config.name} eyebrow={canScore ? 'LIVE SCORING' : 'SPECTATOR VIEW'} back />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.matchIdentity}>
          <View style={[styles.sportIcon, { backgroundColor: `${presentation.accent}16` }]}><SportIcon code={presentation.catalogCode} color={presentation.accent} size={21} /></View>
          <Text variant="caption" tone="muted" style={styles.flex} numberOfLines={1}>{setup.sideNames[0]} vs {setup.sideNames[1]}</Text>
          <View style={[styles.rulePill, { borderColor: presentation.accent }]}><Text variant="overline" style={{ color: presentation.accent }}>{feed.matchFormat}</Text></View>
          <Text variant="overline" style={{ color: error ? colors.danger : presentation.accent }}>{error ? 'SYNC ERROR' : submitting ? 'SAVING' : 'SYNCED'}</Text>
        </View>

        {error ? <View style={styles.errorBanner}><MaterialCommunityIcons name="cloud-alert-outline" size={18} color={colors.danger} /><Text variant="caption" tone="danger" style={styles.flex}>{error}</Text><Pressable onPress={() => setError(undefined)}><MaterialCommunityIcons name="close" size={18} color={colors.textMuted} /></Pressable></View> : null}

        {doubles ? <View style={styles.lineupCard}>{([0, 1] as const).map((side) => <View key={side} style={styles.lineupSide}><Text variant="overline" tone="dim">SIDE {side === 0 ? 'A' : 'B'}</Text><Text variant="caption" numberOfLines={2}>{side === 0 ? feed.sideAPlayers.join(' / ') : feed.sideBPlayers.join(' / ')}</Text></View>)}</View> : null}

        {!canScore && !state.isComplete ? <View style={[styles.viewerBanner, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="eye-outline" size={22} color={presentation.accent} /><View style={styles.flex}><Text variant="bodyStrong">Spectator view</Text><Text variant="caption" tone="muted">Only the assigned scorer can record points from this device.</Text></View></View> : null}

        {notice?.type === 'SWITCH_ENDS' ? <View style={[styles.switchBanner, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="swap-horizontal-bold" size={24} color={presentation.accent} /><View style={styles.flex}><Text variant="bodyStrong">Switch ends</Text><Text variant="caption" tone="muted">The scoring zones have swapped to match the court.</Text></View><Pressable accessibilityLabel="Dismiss" onPress={() => setNotice(undefined)}><MaterialCommunityIcons name="close" size={19} color={colors.textMuted} /></Pressable></View> : null}

        <RacquetScorePanel config={config} state={state} sideNames={setup.sideNames} accent={presentation.accent} />

        {state.isComplete ? <View style={[styles.completeCard, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="trophy-outline" size={34} color={presentation.accent} /><Text variant="overline" style={{ color: presentation.accent }}>MATCH WINNER</Text><Text variant="h1" style={styles.winner}>{setup.sideNames[state.winner!]}</Text><Text variant="caption" tone="muted">Final score {state.root.score[0]}-{state.root.score[1]}</Text><Button title="New match" onPress={() => router.replace(`/${presentation.routeSegment}/match/new` as Href)} style={{ backgroundColor: presentation.accent }} /></View> : canScore ? <TwoZonePointPad sideNames={setup.sideNames} sideOrder={padOrder} servingSide={state.serve.servingSide} accent={presentation.accent} onPoint={choosePointWinner} /> : null}

        {!state.isComplete && canScore ? <View style={styles.controls}><Button title="Undo last rally" variant="secondary" disabled={!undoTarget} loading={submitting} onPress={undo} style={styles.flexButton} /></View> : null}
      </ScrollView>
      <Modal visible={pendingWinner !== undefined} transparent animationType="fade" onRequestClose={() => setPendingWinner(undefined)}>
        <View style={styles.detailOverlay}>
          {pendingWinner !== undefined ? <View style={styles.detailDialog}>
            <View style={styles.detailHeader}>
              <View style={styles.flex}>
                <Text variant="overline" style={{ color: presentation.accent }}>POINT TO</Text>
                <Text variant="h2" numberOfLines={2}>{setup.sideNames[pendingWinner]}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel point" onPress={() => setPendingWinner(undefined)} style={styles.detailClose}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text variant="body" tone="muted">How was the point decided?</Text>
            <View style={styles.detailOptions}>
              {pointDetailOptions(sportId).map((option) => <Pressable key={option.value} accessibilityRole="button" onPress={() => confirmPoint(option.value)} style={({ pressed }) => [styles.detailOption, pressed && { borderColor: presentation.accent, backgroundColor: `${presentation.accent}14` }]}>
                <Text variant="bodyStrong" style={styles.flex}>{pointDetailChoiceLabel(option.value, pendingWinner, setup.sideNames)}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={presentation.accent} />
              </Pressable>)}
            </View>
            <Button title="Cancel" variant="secondary" onPress={() => setPendingWinner(undefined)} fullWidth />
          </View> : null}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  centerText: { textAlign: 'center' },
  matchIdentity: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sportIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rulePill: { maxWidth: 110, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderRadius: radius.pill },
  errorBanner: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: 'rgba(224,57,75,0.10)', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineupCard: { padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.sm },
  lineupSide: { flex: 1, minWidth: 0, gap: 3 },
  detailOverlay: { flex: 1, padding: spacing.md, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center' },
  detailDialog: { maxHeight: '90%', padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.md },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  detailClose: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  detailOptions: { gap: spacing.sm },
  detailOption: { minHeight: 48, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switchBanner: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  viewerBanner: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  completeCard: { padding: spacing.xl, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center', gap: spacing.sm },
  winner: { textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flexButton: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
});
