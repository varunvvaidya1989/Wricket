import type { Href } from 'expo-router';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageIntro, StageList, StageNotice, StagePage, StageRow, StageText } from '@/components/sports/platform/StageUI';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  activePointEvents,
  appendPointEvent,
  formatLiveHeadline,
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
import { supabaseErrorMessage } from '@/lib/supabase/errorMessage';
import { isScoringAccessError } from '@/lib/sports/scoring/accessError';
import { sportRulesSummary } from '@/lib/sports/scoring';
import { buildRacketScorePresentation } from '@/lib/sports/scoring/scorePresentation';
import { colors } from '@/lib/wricket/presentation/design';
import { RacketScoringBoard, RacketScoringPage, ScoringAction, ScoringReceipt } from './RacketScoringBoard';
import { RallyDetailsForm } from './RallyDetailsForm';
import type { RallyObservation } from '@/lib/sports/analytics/types';

export function SportCloudLiveScoreScreen({ sportId }: { sportId: ScoringSportId }) {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [feed, setFeed] = useState<SportCloudMatchFeed>();
  const [feedOwner, setFeedOwner] = useState<string>();
  const owner = `${auth.session?.user.id ?? ''}:${id}`;
  const [lease, setLease] = useState<SportScoringLease>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<ScoringEffect>();
  const [pendingWinner, setPendingWinner] = useState<Side>();
  const [detailedScoring, setDetailedScoring] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [accessError, setAccessError] = useState<string>();
  const [receipt, setReceipt] = useState<string>();
  const loadRequest = useRef(0);
  const leaseRequest = useRef(0);
  const savingRef = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    setReceipt(undefined); setPendingWinner(undefined); setNotice(undefined); setControlsOpen(false);
  }, [owner]);

  const load = useCallback(async (silent = false) => {
    const request = ++loadRequest.current;
    if (!id) {
      setError('The match ID is missing.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const next = await sportScoringApi.feed(id);
      if (request !== loadRequest.current) return;
      const connectedSport = auth.profile?.connectedSports.find((sport) => sport.code === presentation.catalogCode);
      if (!connectedSport || connectedSport.accessStatus !== 'ACTIVE' || connectedSport.id !== next.sportId) {
        throw new Error(`This match is not available with your current ${config.name} app selection.`);
      }
      setFeed(next);
      setFeedOwner(owner);
      setError(undefined);
    } catch (cause) {
      if (request === loadRequest.current) setError(supabaseErrorMessage(cause, 'Could not load this match.'));
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [auth.profile?.connectedSports, config.name, id, owner, presentation.catalogCode]);

  const acquireLease = useCallback(async () => {
    const request = ++leaseRequest.current;
    setLease(undefined);
    if (!id || mode === 'view') return;
    try {
      const next = await sportScoringApi.acquireLease(id);
      if (request === leaseRequest.current) {
        setLease(next); setAccessError(undefined);
        setError(current => current && isScoringAccessError({ message: current }) ? undefined : current);
      }
    } catch (cause) {
      if (request !== leaseRequest.current) return;
      setLease(undefined);
      setAccessError(supabaseErrorMessage(cause, 'Scoring access is unavailable on this device.'));
    }
  }, [id, mode]);

  useFocusEffect(useCallback(() => {
    void load();
    void acquireLease();
    if (!id) return undefined;
    const unsubscribe = sportScoringApi.subscribe(id, () => void load(true), (message) => setError(message), setRealtimeConnected);
    return () => { loadRequest.current++; leaseRequest.current++; unsubscribe(); };
  }, [acquireLease, id, load]));

  const setup = useMemo(() => {
    if (!feed || feed.id !== id || feedOwner !== owner) return undefined;
    const initialServer: Side = feed.rulesSnapshot.initial_server === 1 ? 1 : 0;
    const options = feed.rulesSnapshot.options && typeof feed.rulesSnapshot.options === 'object'
      && !Array.isArray(feed.rulesSnapshot.options)
      ? feed.rulesSnapshot.options as Record<string, boolean | number | string | undefined>
      : {};
    const sideNames = [feed.sideAPlayers.join(' / ') || 'Side A', feed.sideBPlayers.join(' / ') || 'Side B'] as const;
    const events = activePointEvents(feed.events);
    return { initialServer, options, sideNames, events };
  }, [feed, feedOwner, id, owner]);
  const state = useMemo(() => setup ? replay(config, setup.events, {
    initialServer: setup.initialServer,
    options: setup.options,
  }) : undefined, [config, setup]);
  const canScore = Boolean(lease) && mode !== 'view';

  const record = (operation: () => Promise<void>) => {
    queue.current = queue.current
      .then(operation)
      .catch((cause) => {
        setError(supabaseErrorMessage(cause, 'Could not save this rally.'));
        if (isScoringAccessError(cause)) { setLease(undefined); setAccessError(supabaseErrorMessage(cause, 'Scoring access changed.')); }
      });
  };

  const choosePointWinner = (winner: Side) => {
    if (!feed || !setup || !state || !lease || state.isComplete || submitting || savingRef.current) return;
    if (detailedScoring) setPendingWinner(winner);
    else confirmPoint('RALLY_WINNER', winner);
  };

  const confirmPoint = (selectedPointDetail: PointDetail, winner: Side | undefined = pendingWinner, observation?: RallyObservation) => {
    setPendingWinner(undefined);
    if (!feed || !setup || !state || !lease || state.isComplete || submitting || savingRef.current) return;
    if (winner === undefined) return;
    const nextEvents = appendPointEvent(setup.events, {
      type: 'POINT', sequence: feed.currentSequence + 1, winner, occurredAt: Date.now(),
    });
    const nextState = replay(config, nextEvents, { initialServer: setup.initialServer, options: setup.options });
    savingRef.current = true;
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
            ...(observation ? { analytics: observation } : {}),
            headline_score: formatLiveHeadline(config, nextState),
          },
        });
        setReceipt(`Rally ${nextState.eventCount}: ${setup.sideNames[winner]} won${formatLiveHeadline(config, nextState) === formatLiveHeadline(config, state) ? ' · Score unchanged · service changed' : ''}`);
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
        savingRef.current = false;
        setSubmitting(false);
      }
    });
  };

  const undo = () => {
    const target = feed ? lastActivePointEvent(feed.events) : undefined;
    if (!feed || !setup || !lease || !target || submitting || savingRef.current) return;
    const remainingEvents = activePointEvents(
      feed.events.filter((event) => event.clientEventId !== target.clientEventId),
    );
    const nextState = replay(config, remainingEvents, {
      initialServer: setup.initialServer,
      options: setup.options,
    });
    savingRef.current = true;
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
        setReceipt('Last rally undone');
        await load(true);
      } finally {
        savingRef.current = false;
        setSubmitting(false);
      }
    });
  };

  if (loading && (!feed || feed.id !== id)) return <StagePage focused title="Match score" eyebrow={config.name.toUpperCase()}><StageNotice>Opening your match · getting the latest score…</StageNotice></StagePage>;
  if (!feed || !setup || !state) return <StagePage focused title="Match score" eyebrow={config.name.toUpperCase()}><StageIntro title="Match unavailable." description={error ?? 'This match could not be restored.'} /><StageButton title="Try again" onPress={() => void load()} /></StagePage>;

  const undoTarget = lastActivePointEvent(feed.events);
  const openFeed = (tab = 'watch') => router.push(`/${presentation.routeSegment}/match/${feed.id}/feed?tab=${tab}` as Href);
  const restoredWinner = undoTarget?.payload.winner === 0 || undoTarget?.payload.winner === 1 ? setup.sideNames[undoTarget.payload.winner] : undefined;
  const recorded = receipt ?? (restoredWinner ? `Rally ${state.eventCount}: ${restoredWinner} won` : undefined);
  const scorePresentation = buildRacketScorePresentation(config, state, setup.events, setup.initialServer);
  return <RacketScoringPage title={`${setup.sideNames[0]} vs ${setup.sideNames[1]}`} context={state.isComplete ? `${config.name.toUpperCase()} · MATCH COMPLETE` : `${scorePresentation.context}${canScore ? '' : ' · VIEW'}`}>
    <RacketScoringBoard config={config} state={state} events={setup.events} initialServer={setup.initialServer} sideNames={setup.sideNames} sidePlayers={[feed.sideAPlayers, feed.sideBPlayers]} onPoint={canScore && !state.isComplete ? choosePointWinner : undefined} disabled={submitting} />
    {error ? <StageNotice retry={() => void load(true)}>{error}</StageNotice> : null}
    <ScoringReceipt text={submitting ? 'Saving rally…' : recorded ?? (realtimeConnected ? 'Connected · waiting for the first rally' : 'Reconnecting · last loaded score')} undo={canScore && !state.isComplete ? undo : undefined} disabled={!undoTarget || submitting} />
    {!canScore && !state.isComplete ? <>
      <StageNotice>{accessError ?? 'Spectator view. Scoring controls are available only to the authorised scorer.'}</StageNotice>
      {mode !== 'view' ? <StageButton title="Check scoring access" onPress={() => void acquireLease()} /> : null}
    </> : null}
    {notice?.type === 'SWITCH_ENDS' ? <StageNotice>Switch ends before the next rally.</StageNotice> : null}
    {state.isComplete ? <>
      <StageIntro eyebrow="MATCH WINNER" title={setup.sideNames[state.winner!]} description={`Final result · ${formatLiveHeadline(config, state)}`} />
      <StageButton title="View result" onPress={() => openFeed()} />
      <StageButton primary title="New match" onPress={() => router.replace(`/${presentation.routeSegment}/match/new` as Href)} />
    </> : null}
    <View style={{ flexDirection: 'row', gap: 8 }}>{canScore && !state.isComplete ? <ScoringAction title="Point details" icon="tune" selected={detailedScoring} disabled={submitting} onPress={() => setDetailsOpen(true)} /> : null}<ScoringAction title="Match controls" icon="dots-horizontal" onPress={() => setControlsOpen(true)} /></View>
    <Modal accessibilityLabel="Point details settings" visible={detailsOpen} transparent animationType="fade" onRequestClose={() => setDetailsOpen(false)}><View style={styles.overlay}><View style={styles.dialog}>
      <StageIntro eyebrow="RALLY DETAILS" title="Capture the whole rally." description="Enable details, then tap the winning side. Choose an outcome and optional observations, then record the point." />
      <View style={styles.scoringMode}><StageText style={styles.flex}>Add details to each point</StageText><Switch accessibilityLabel="Add details to each point" value={detailedScoring} onValueChange={setDetailedScoring} disabled={submitting} trackColor={{ false: colors.borderStrong, true: colors.accent }} thumbColor={colors.text} /></View>
      <StageButton title="Back to scoring" onPress={() => setDetailsOpen(false)} />
    </View></View></Modal>
    <Modal accessibilityLabel="Match controls" visible={controlsOpen} transparent animationType="fade" onRequestClose={() => setControlsOpen(false)}>
      <View style={styles.overlay}><View style={styles.dialog}><ScrollView contentContainerStyle={{ gap: 18 }}>
        <StageIntro eyebrow="MATCH CONTROLS" title="Manage the match." description="Tap a score card to record a rally." />
        <StageList><StageRow title="View match history" detail="Recorded rallies and corrections" symbol="↗" onPress={() => { setControlsOpen(false); openFeed('history'); }} /><StageRow title="Match information" detail="Players, venue and rules" symbol="↗" onPress={() => { setControlsOpen(false); openFeed('info'); }} /><StageRow title="View as spectator" detail="Open the match view" symbol="↗" onPress={() => { setControlsOpen(false); openFeed(); }} /></StageList>
        <StageText variant="rowTitle">Selected match rules</StageText>
        <StageText muted>{sportRulesSummary(sportId, setup.options)}</StageText>
        <StageButton title="Back to match" onPress={() => setControlsOpen(false)} />
      </ScrollView></View></View>
    </Modal>
    <Modal accessibilityLabel="Record rally details" visible={pendingWinner !== undefined} transparent animationType="fade" onRequestClose={() => setPendingWinner(undefined)}>
      <View style={styles.overlay}>{pendingWinner !== undefined ? <View style={styles.dialog}>
        <StageIntro eyebrow="RALLY DETAILS" title="Read the rally." description={`${setup.sideNames[pendingWinner]} won this rally. Add observations, then record the point.`} />
        <RallyDetailsForm key={`${feed?.id}:${feed?.currentSequence}:${pendingWinner}`} sportId={sportId} winner={pendingWinner} sideNames={setup.sideNames} playerIds={[feed?.sideAProfileIds ?? [], feed?.sideBProfileIds ?? []]} playerNames={[feed?.sideAPlayers ?? [], feed?.sideBPlayers ?? []]} onConfirm={(detail, observation) => confirmPoint(detail, pendingWinner, observation)} />
        <StageButton title="Cancel point" onPress={() => setPendingWinner(undefined)} />
      </View> : null}</View>
    </Modal>
  </RacketScoringPage>;
}

const styles = StyleSheet.create({
  scoringMode: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 13, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  overlay: { flex: 1, padding: 18, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center' },
  dialog: { width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '90%', padding: 18, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 16, backgroundColor: colors.bg, gap: 18 },
  flex: { flex: 1, minWidth: 0 },
});
