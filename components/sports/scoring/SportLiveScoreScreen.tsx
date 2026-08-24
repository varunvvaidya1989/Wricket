import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SportIcon } from '@/components/sports/SportIcon';
import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  appendPointEvent,
  canScoreSession,
  getSportCompetition,
  getScoringSession,
  removeScoringSession,
  replay,
  saveScoringSession,
  undoLastPoint,
  withSessionEvents,
  type ScoringEffect,
  type ScoringSessionRecord,
  type ScoringSportId,
  type Side,
} from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { RacquetScorePanel } from './RacquetScorePanel';
import { TwoZonePointPad } from './TwoZonePointPad';

export function SportLiveScoreScreen({ sportId }: { sportId: ScoringSportId }) {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const appRoute = `/${presentation.routeSegment}` as Href;
  const newMatchRoute = `/${presentation.routeSegment}/match/new` as Href;
  const [session, setSession] = useState<ScoringSessionRecord>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<ScoringEffect>();
  const [canScore, setCanScore] = useState(false);
  const sessionRef = useRef<ScoringSessionRecord | undefined>(undefined);
  const persistence = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    if (!id) {
      setError('The local match ID is missing.');
      setLoading(false);
      return () => { active = false; };
    }
    void getScoringSession(id).then(async (stored) => {
      if (!active) return;
      if (!stored || stored.sportId !== sportId) {
        setError(`This ${config.name} match could not be found.`);
      } else {
        const competition = stored.competitionId
          ? await getSportCompetition(stored.competitionId)
          : undefined;
        const authorized = mode !== 'view'
          && canScoreSession(stored, auth.session?.user.id, competition);
        sessionRef.current = stored;
        setSession(stored);
        setCanScore(authorized);
      }
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load this match.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [auth.session?.user.id, config.name, id, mode, sportId]);

  const state = useMemo(() => session ? replay(config, session.events, {
    initialServer: session.initialServer,
    options: session.options,
  }) : undefined, [config, session]);

  const persist = (next: ScoringSessionRecord) => {
    sessionRef.current = next;
    setSession(next);
    persistence.current = persistence.current
      .then(() => saveScoringSession(next))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not save this rally.'));
  };

  const pointTo = (winner: Side) => {
    const current = sessionRef.current;
    if (!current || !canScore) return;
    const currentState = replay(config, current.events, {
      initialServer: current.initialServer,
      options: current.options,
    });
    if (currentState.isComplete) return;
    const previousSequence = current.events.at(-1)?.sequence ?? 0;
    const events = appendPointEvent(current.events, {
      type: 'POINT',
      sequence: previousSequence + 1,
      winner,
      occurredAt: Date.now(),
    });
    const nextState = replay(config, events, {
      initialServer: current.initialServer,
      options: current.options,
    });
    setNotice(nextState.effectsByEvent.at(-1)?.[0]);
    persist(withSessionEvents(current, events));
  };

  const undo = () => {
    const current = sessionRef.current;
    if (!current || !canScore || current.events.length === 0) return;
    const result = undoLastPoint(config, current.events, {
      initialServer: current.initialServer,
      options: current.options,
    });
    setNotice(undefined);
    persist(withSessionEvents(current, result.events));
  };

  const reset = () => {
    const current = sessionRef.current;
    if (!current || !canScore) return;
    Alert.alert('Reset this match?', 'Every recorded rally will be removed. Player names and rules stay the same.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => { setNotice(undefined); persist(withSessionEvents(current, [])); } },
    ]);
  };

  const deleteMatch = () => {
    const current = sessionRef.current;
    if (!current || !canScore) return;
    Alert.alert('Delete local match?', 'This rally log cannot be recovered after it is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void persistence.current
          .then(() => removeScoringSession(current.id))
          .then(() => router.replace(appRoute)),
      },
    ]);
  };

  if (loading) {
    return <Screen padded={false}><SportStageLoader message="Replaying the rally log" detail="Reconstructing every point in sequence" accent={presentation.accent} /></Screen>;
  }
  if (!session || !state) {
    return (
      <Screen padded={false}>
        <AppHeader title={`${config.name} score`} back />
        <View style={styles.center}>
          <MaterialCommunityIcons name="scoreboard-outline" size={38} color={colors.textDim} />
          <Text variant="h3">Match unavailable</Text>
          <Text tone="muted" style={styles.centerText}>{error ?? 'This match could not be restored.'}</Text>
          <Button title={`Back to ${config.name}`} onPress={() => router.replace(appRoute)} />
        </View>
      </Screen>
    );
  }

  const switchCount = state.effects.filter((effect) => effect.type === 'SWITCH_ENDS').length;
  const padOrder: readonly [Side, Side] = switchCount % 2 === 1 ? [1, 0] : [0, 1];

  return (
    <Screen padded={false} edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader
        title={config.name}
        eyebrow={canScore ? 'LIVE SCORING' : 'SPECTATOR VIEW'}
        back
        right={canScore ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Delete match" onPress={deleteMatch} style={styles.headerAction}>
            <MaterialCommunityIcons name="trash-can-outline" size={21} color={colors.textMuted} />
          </Pressable>
        ) : undefined}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.matchIdentity}>
          <View style={[styles.sportIcon, { backgroundColor: `${presentation.accent}16` }]}>
            <SportIcon code={presentation.catalogCode} color={presentation.accent} size={21} />
          </View>
          <Text variant="caption" tone="muted" style={styles.flex} numberOfLines={1}>
            {session.sideNames[0]} vs {session.sideNames[1]}
          </Text>
          <View style={[styles.rulePill, { borderColor: presentation.accent }]}>
            <Text variant="overline" style={{ color: presentation.accent }}>{session.matchFormat}</Text>
          </View>
          {presentation.option && session.options[presentation.option.key] === true ? (
            <View style={[styles.rulePill, { borderColor: presentation.accent }]}>
              <Text variant="overline" style={{ color: presentation.accent }}>{presentation.option.label}</Text>
            </View>
          ) : null}
          <Text variant="overline" style={{ color: error ? colors.danger : presentation.accent }}>
            {error ? 'SAVE ERROR' : canScore ? 'AUTO-SAVED' : 'VIEW ONLY'}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="cloud-alert-outline" size={18} color={colors.danger} />
            <Text variant="caption" tone="danger" style={styles.flex}>{error}</Text>
            <Pressable onPress={() => setError(undefined)}><MaterialCommunityIcons name="close" size={18} color={colors.textMuted} /></Pressable>
          </View>
        ) : null}

        {session.matchFormat === 'DOUBLES' ? (
          <View style={styles.lineupCard}>
            {([0, 1] as const).map((side) => (
              <View key={side} style={styles.lineupSide}>
                <Text variant="overline" tone="dim">SIDE {side === 0 ? 'A' : 'B'}</Text>
                <Text variant="caption" numberOfLines={2}>{session.sidePlayers[side].join(' · ')}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {!canScore ? (
          <View style={[styles.viewerBanner, { borderColor: presentation.accent }]}>
            <MaterialCommunityIcons name="eye-outline" size={22} color={presentation.accent} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">Spectator view</Text>
              <Text variant="caption" tone="muted">Only the competition creator or an assigned match official can record points.</Text>
            </View>
          </View>
        ) : null}

        {notice?.type === 'SWITCH_ENDS' ? (
          <View style={[styles.switchBanner, { borderColor: presentation.accent }]}>
            <MaterialCommunityIcons name="swap-horizontal-bold" size={24} color={presentation.accent} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">Switch ends</Text>
              <Text variant="caption" tone="muted">The scoring zones have swapped to match the court.</Text>
            </View>
            <Pressable accessibilityLabel="Dismiss" onPress={() => setNotice(undefined)}>
              <MaterialCommunityIcons name="close" size={19} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        <RacquetScorePanel config={config} state={state} sideNames={session.sideNames} accent={presentation.accent} />

        {state.isComplete ? (
          <View style={[styles.completeCard, { borderColor: presentation.accent }]}>
            <MaterialCommunityIcons name="trophy-outline" size={34} color={presentation.accent} />
            <Text variant="overline" style={{ color: presentation.accent }}>MATCH WINNER</Text>
            <Text variant="h1" style={styles.winner}>{session.sideNames[state.winner!]}</Text>
            <Text variant="caption" tone="muted">Final score {state.root.score[0]}–{state.root.score[1]}</Text>
            {canScore ? <View style={styles.completeActions}><Button title="Score correction" variant="secondary" onPress={undo} /><Button title="New match" onPress={() => router.replace(newMatchRoute)} style={{ backgroundColor: presentation.accent }} /></View> : null}
          </View>
        ) : canScore ? (
          <TwoZonePointPad
            sideNames={session.sideNames}
            sideOrder={padOrder}
            servingSide={state.serve.servingSide}
            accent={presentation.accent}
            onPoint={pointTo}
          />
        ) : null}

        {!state.isComplete && canScore ? (
          <View style={styles.controls}>
            <Button title="Undo last rally" variant="secondary" disabled={session.events.length === 0} onPress={undo} style={styles.flexButton} />
            <Button title="Reset" variant="ghost" disabled={session.events.length === 0} onPress={reset} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  centerText: { textAlign: 'center' },
  headerAction: { width: 40, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  matchIdentity: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sportIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rulePill: { maxWidth: 110, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderRadius: radius.pill },
  errorBanner: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: 'rgba(224,57,75,0.10)', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineupCard: { padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.sm },
  lineupSide: { flex: 1, minWidth: 0, gap: 3 },
  switchBanner: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  viewerBanner: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  completeCard: { padding: spacing.xl, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center', gap: spacing.sm },
  winner: { textAlign: 'center' },
  completeActions: { marginTop: spacing.sm, flexDirection: 'row', gap: spacing.sm },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flexButton: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
});
