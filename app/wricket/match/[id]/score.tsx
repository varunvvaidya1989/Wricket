import { svgDataUri } from '@/lib/wricket/presentation/svg';
import { withScoringTransaction, type ScoringDatabase } from '@/lib/wricket/db/scoringTransaction';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  BackHandler,
  AppState,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/components/providers/AuthProvider';
import { isOfflineError } from '@/lib/auth/offlineScoring';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/wricket/ui/Text';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { type PadAction } from '@/components/wricket/scoring/GesturePad';
import { ExtrasSheet, WicketSheet } from '@/components/wricket/scoring/ScoringForms';
import { MatchControls, type MatchControlCommand } from '@/components/wricket/scoring/MatchControls';
import { configuredScoringUiVersion, pinnedScoringUiVersion, type ScoringUiVersion } from '@/lib/wricket/presentation/uiRelease';
import { ScoringInputDeck } from '@/components/wricket/scoring/ScoringInputDeck';
import { createScoringGate, restoredInputMode, SCORING_INPUT_KEY, type ScoringInputMode } from '@/lib/wricket/presentation/scoringInput';
import { DesignIcon, TeamCrest } from '@/components/wricket/ui/DesignIcon';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { spacing, radius } from '@/lib/theme/spacing';
import {
  getMatch,
  setMatchStatus,
  getTeam,
  getMatchXI,
  listInningsForMatch,
  insertBall,
  listBalls,
  updateInningsTotals,
  deleteLastBall,
  insertScoreAdjustment,
  listScoreAdjustments,
  insertBatterRetirement,
  listBatterRetirements,
  getScoringSession,
  saveScoringSession,
  clearScoringSession,
  MatchXIPlayer,
} from '@/lib/wricket/db/repo';
import {
  closeAndAdvance,
  planNextStep,
  resolveAbandonedMatchLifecycle,
  MatchAbandonmentResolution,
  startNextInnings,
} from '@/lib/wricket/app/innings-flow';
import { deriveScoringStateFromHistory, restoreScoringState } from '@/lib/wricket/app/scoring-session';
import {
  Ball,
  BatterRetirement,
  DismissalKind,
  ExtraKind,
  Innings,
  Match,
  ScoreAdjustment,
  ScoreAdjustmentKind,
  Team,
} from '@/lib/wricket/domain/types';
import { applyBall, formatOver, isInningsOver, runRate } from '@/lib/wricket/domain/scoring';
import { testMatchSituation } from '@/lib/wricket/domain/test-match';
import { ballSymbol, batsmanLineFor, bowlerLineFor } from '@/lib/wricket/domain/stats';
import {
  CloudScoringSyncState,
  flushScoringEvents,
  queueCloudBall,
  queueCloudScoringEvent,
  subscribeToCloudScoringSync,
  ensureCloudScoringAccess,
  isScoringAccessDenied,
} from '@/lib/supabase/cloudScoringApi';
import { hydrateScoringMatch } from '@/lib/supabase/scoringHydration';

interface LiveState {
  totalRuns: number;
  totalWickets: number;
  legalBalls: number;
  overNo: number;
  legalBallInOver: number;
  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function deriveStateFromBalls(
  ballList: Ball[],
  adjustmentList: ScoreAdjustment[] = [],
  retirementList: BatterRetirement[] = [],
): LiveState {
  const state = deriveScoringStateFromHistory(
    ballList,
    adjustmentList,
    retirementList,
  );
  return {
    totalRuns: state.totalRuns,
    totalWickets: state.totalWickets,
    legalBalls: state.legalBalls,
    overNo: state.overNo,
    legalBallInOver: state.legalBallInOver,
    strikerId: state.strikerId,
    nonStrikerId: state.nonStrikerId,
    bowlerId: state.bowlerId,
  };
}

export default function ScoreScreen() {
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [match, setMatch] = useState<Match | null>(null);
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  const [innings, setInnings] = useState<Innings | null>(null);
  const [matchInnings, setMatchInnings] = useState<Innings[]>([]);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [adjustments, setAdjustments] = useState<ScoreAdjustment[]>([]);
  const [retirements, setRetirements] = useState<BatterRetirement[]>([]);
  const [xiBatting, setXiBatting] = useState<MatchXIPlayer[]>([]);
  const [xiBowling, setXiBowling] = useState<MatchXIPlayer[]>([]);
  const [live, setLive] = useState<LiveState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [followOnDecisionSaving, setFollowOnDecisionSaving] = useState(false);
  const [followOnDecisionError, setFollowOnDecisionError] = useState<string>();
  const followOnDecisionLock = useRef(false);
  const [uiVersion, setUiVersion] = useState<ScoringUiVersion>(configuredScoringUiVersion);
  const [inputMode, setInputMode] = useState<ScoringInputMode>('numbers');
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [deliveryReceipt, setDeliveryReceipt] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [scoringGate] = useState(createScoringGate);
  const insertedDelivery = useRef(false);
  const inputModeSelected = useRef(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(SCORING_INPUT_KEY).then(value => {
      if (active && !inputModeSelected.current) setInputMode(restoredInputMode(value));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const selectInputMode = (mode: ScoringInputMode) => {
    if (scoringGate.busy) return;
    inputModeSelected.current = true;
    setInputMode(mode);
    void AsyncStorage.setItem(SCORING_INPUT_KEY, mode).catch(() => undefined);
  };

  // sheets
  const [openersOpen, setOpenersOpen] = useState(false);
  const [bowlerOpen, setBowlerOpen] = useState(false);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [pickBatterOpen, setPickBatterOpen] = useState(false);
  const [pendingNewBatterSlot, setPendingNewBatterSlot] = useState<'striker' | 'nonStriker' | null>(null);
  const [inningsSettingsOpen, setInningsSettingsOpen] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [cloudSync, setCloudSync] = useState<CloudScoringSyncState>({
    status: 'LIVE',
    pending: 0,
  });
  const scoringAccessBlocked = isScoringAccessDenied(cloudSync.error);
  const lastShownSyncErrorRef = useRef<string | null>(null);
  const lastFollowOnPromptRef = useRef<string | null>(null);
  const confirmLeaveScoring = useCallback(() => {
    const leave = () => router.back();
    if (Platform.OS === 'web') {
      if (globalThis.confirm('Leave scoring?\n\nYour recorded deliveries are saved and you can return from the Live tab.')) leave();
      return;
    }
    Alert.alert('Leave scoring?', 'Your recorded deliveries are saved and you can return from the Live tab.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: leave },
    ]);
  }, [router]);

  // score flash animation
  const scoreFlash = useSharedValue(0);
  const flashColor = useRef<string>(colors.accent);
  const scoreFlashStyle = useAnimatedStyle(() => ({
    opacity: scoreFlash.value,
    backgroundColor: flashColor.current,
  }));

  const triggerFlash = useCallback((color: string) => {
    if (reducedMotion) return;
    flashColor.current = color;
    scoreFlash.value = withSequence(
      withTiming(0.35, { duration: 80 }),
      withTiming(0, { duration: 500 }),
    );
  }, [reducedMotion, scoreFlash]);

  // Full load from DB — only on mount, innings transition, or undo
  const loadFromDb = useCallback(async () => {
    if (auth.loading) return;
    setLoadError(null);
    try {
    if (!id) throw new Error('The match ID is missing from this route.');
    const restoreIfScorable = async (matchId: string) => {
      if (await hydrateScoringMatch(matchId) !== 'TERMINAL') return true;
      setInnings(null); setLive(null);
      router.replace({ pathname: '/wricket/match/[id]/scorecard', params: { id: matchId } });
      return false;
    };
    let m = await getMatch(id);
    if (!m) {
      if (!await restoreIfScorable(id)) return;
      m = await getMatch(id);
      if (!m) throw new Error('The cloud match could not be restored to the scoring cache.');
    }
    setMatch(m);
    if (m.status === 'COMPLETED' || m.status === 'ABANDONED') {
      setInnings(null);
      setLive(null);
      router.replace({ pathname: '/wricket/match/[id]/scorecard', params: { id: m.id } });
      return;
    }

    if (isUuid(m.id)) await ensureCloudScoringAccess(m.id);
    const [a, b] = await Promise.all([getTeam(m.teamAId), getTeam(m.teamBId)]);
    if (!a || !b) throw new Error('One or both teams are missing from the local scoring cache.');
    setTeamA(a);
    setTeamB(b);

    let innList = await listInningsForMatch(m.id);
    // Tournament sync can create the local match shell before downloading its
    // scoring history. Restore the authoritative innings/XI/event log when a
    // scorer opens that shell on another device.
    if (innList.length === 0 && isUuid(m.id) && ['IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION'].includes(m.status)) {
      if (!await restoreIfScorable(m.id)) return;
      innList = await listInningsForMatch(m.id);
    }
    let open = innList.find(i => !i.isClosed);
    if (!open && m.status === 'INNINGS_BREAK') {
      const step = await planNextStep(m.id);
      if (step.kind === 'NEXT_INNINGS' && step.next) {
        await startNextInnings(m.id, step.next);
        innList = await listInningsForMatch(m.id);
        open = innList.find(i => !i.isClosed);
      } else if (step.kind === 'FOLLOW_ON_DECISION') {
        // Cloud INNINGS_CLOSED records an innings break. Recover the pending
        // decision from the authoritative innings/rules on a fresh device.
        await setMatchStatus(m.id, 'FOLLOW_ON_DECISION');
        m = { ...m, status: 'FOLLOW_ON_DECISION' };
        setMatch(m);
      } else if (step.kind === 'COMPLETED' && innList.length) {
        // Replay stable lifecycle IDs if the final acknowledgement was lost.
        await closeAndAdvance(m.id, innList[innList.length - 1].id);
        m = await getMatch(m.id) ?? m;
        setMatch(m);
      }
    }
    setMatchInnings(innList);
    if (!open) {
      if (m.status === 'FOLLOW_ON_DECISION') {
        setInnings(null);
        setLive(null);
        return;
      }
      router.replace({
        pathname: '/wricket/match/[id]/scorecard',
        params: { id: m.id },
      });
      return;
    }
    setInnings(open);

    const [ballList, adjustmentList, retirementList, session] = await Promise.all([
      listBalls(open.id),
      listScoreAdjustments(open.id),
      listBatterRetirements(open.id),
      getScoringSession(m.id),
    ]);
    setUiVersion(pinnedScoringUiVersion(session?.uiVersion, configuredScoringUiVersion()));
    setBalls(ballList);
    setAdjustments(adjustmentList);
    setRetirements(retirementList);

    let xiBatList = await getMatchXI(m.id, open.battingTeamId);
    let xiBowlList = await getMatchXI(m.id, open.bowlingTeamId);
    if ((xiBatList.length === 0 || xiBowlList.length === 0) && isUuid(m.id)) {
      if (!await restoreIfScorable(m.id)) return;
      xiBatList = await getMatchXI(m.id, open.battingTeamId);
      xiBowlList = await getMatchXI(m.id, open.bowlingTeamId);
    }
    if (xiBatList.length === 0 || xiBowlList.length === 0) {
      throw new Error('The playing XI is missing for this match.');
    }
    setXiBatting(xiBatList);
    setXiBowling(xiBowlList);

    const restoredState = restoreScoringState({
      inningsId: open.id,
      balls: ballList,
      adjustments: adjustmentList,
      retirements: retirementList,
      session,
    });
    const state: LiveState = {
      totalRuns: restoredState.totalRuns,
      totalWickets: restoredState.totalWickets,
      legalBalls: restoredState.legalBalls,
      overNo: restoredState.overNo,
      legalBallInOver: restoredState.legalBallInOver,
      strikerId: restoredState.strikerId,
      nonStrikerId: restoredState.nonStrikerId,
      bowlerId: restoredState.bowlerId,
    };
    setLive(state);

    if (restoredState.pendingPrompt === 'NEXT_BATTER') {
      setPendingNewBatterSlot(!state.strikerId ? 'striker' : 'nonStriker');
      setPickBatterOpen(true);
    } else if (restoredState.pendingPrompt === 'NEXT_BOWLER') {
      setBowlerOpen(true);
    } else if (ballList.length === 0) {
      if (!state.strikerId || !state.nonStrikerId) setOpenersOpen(true);
      else if (!state.bowlerId) setBowlerOpen(true);
    } else if (!state.bowlerId) {
      setBowlerOpen(true);
    }
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Could not restore this match.');
    }
  }, [auth.loading, id, router]);

  const persistSession = useCallback(async (
    state: LiveState,
    pendingPrompt: 'NEXT_BATTER' | 'NEXT_BOWLER' | null = null,
    pendingPlayerId: string | null = null,
    eventSequence = balls.length + adjustments.length + retirements.length,
    connection?: ScoringDatabase,
  ) => {
    if (!match || !innings) return;
    await saveScoringSession({
      uiVersion,
      matchId: match.id,
      inningsId: innings.id,
      strikerId: state.strikerId ?? undefined,
      nonStrikerId: state.nonStrikerId ?? undefined,
      bowlerId: state.bowlerId ?? undefined,
      pendingPrompt,
      pendingPlayerId: pendingPlayerId ?? undefined,
      completedOver: pendingPrompt === 'NEXT_BOWLER' ? state.overNo - 1 : undefined,
      lastCommittedEventSequence: eventSequence,
    }, connection);
  }, [adjustments.length, balls.length, innings, match, retirements.length, uiVersion]);

  useEffect(() => { loadFromDb(); }, [loadFromDb]);
  useEffect(() => {
    if (!auth.loading && id && isUuid(id)) void flushScoringEvents(id);
  }, [auth.loading, id]);
  useEffect(() => {
    if (!id || !isUuid(id)) return;
    return subscribeToCloudScoringSync(id, setCloudSync);
  }, [id]);
  useEffect(() => {
    if (cloudSync.status !== 'ERROR' || !cloudSync.error) {
      if (cloudSync.status === 'LIVE') lastShownSyncErrorRef.current = null;
      return;
    }
    // Accepted offline deliveries stay usable; the connection banner owns
    // recovery. A network interruption must not cover the input with a dialog.
    if (isOfflineError(cloudSync.error)) return;
    if (lastShownSyncErrorRef.current === cloudSync.error) return;
    lastShownSyncErrorRef.current = cloudSync.error;
    Alert.alert(
      'Scoring sync failed',
      cloudSync.error,
      [
        { text: 'Dismiss', style: 'cancel' },
        {
          text: 'Retry',
          onPress: () => {
            if (id && isUuid(id)) void flushScoringEvents(id);
          },
        },
      ],
    );
  }, [cloudSync.error, cloudSync.status, id]);
  useEffect(() => {
    if (!id || !isUuid(id)) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void flushScoringEvents(id);
    });
    return () => subscription.remove();
  }, [id]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmLeaveScoring();
      return true;
    });
    return () => sub.remove();
  }, [confirmLeaveScoring]);

  const battingTeam = innings && (innings.battingTeamId === teamA?.id ? teamA : teamB);
  const bowlingTeam = innings && (innings.bowlingTeamId === teamA?.id ? teamA : teamB);
  const testSituation = match && innings && live && teamA && teamB
    ? testMatchSituation({
        format: match.format,
        followOnEnabled: match.rules.followOnEnabled,
        oversPerInnings: match.rules.oversPerInnings,
        currentInnings: innings,
        currentRuns: live.totalRuns,
        innings: matchInnings,
        teamName: teamId => teamId === teamA.id ? teamA.name : teamB.name,
      })
    : {};

  const striker = live?.strikerId ? xiBatting.find(p => p.userId === live.strikerId) : null;
  const nonStriker = live?.nonStrikerId ? xiBatting.find(p => p.userId === live.nonStrikerId) : null;
  const bowler = live?.bowlerId ? xiBowling.find(p => p.userId === live.bowlerId) : null;

  const thisOverBalls = useMemo(() => {
    if (!live) return [];
    return balls.filter(b => b.overNo === live.overNo);
  }, [balls, live]);

  const persistDelivery = useCallback(
    async (event: {
      runs: number;
      extra: ExtraKind;
      isWicket: boolean;
      dismissalKind?: DismissalKind;
      outPlayerId?: string;
      fielderId?: string;
      assistantFielderId?: string;
      rotateStrike?: boolean;
    }) => { return withScoringTransaction(async transaction => {
      if (!innings || !live || !live.strikerId || !live.nonStrikerId || !live.bowlerId) return;

      const result = applyBall(
        {
          totalRuns: live.totalRuns,
          totalWickets: live.totalWickets,
          legalBalls: live.legalBalls,
          overNo: live.overNo,
          legalBallInOver: live.legalBallInOver,
          strikerId: live.strikerId,
          nonStrikerId: live.nonStrikerId,
          bowlerId: live.bowlerId,
        },
        event,
      );

      const newBall = await insertBall({
        inningsId: innings.id,
        overNo: result.ball.overNo,
        ballInOver: result.ball.ballInOver,
        legalBallInOver: result.ball.legalBallInOver,
        strikerId: result.ball.strikerId,
        nonStrikerId: result.ball.nonStrikerId,
        bowlerId: result.ball.bowlerId,
        runsBat: result.ball.runsBat,
        runsExtra: result.ball.runsExtra,
        extraKind: result.ball.extraKind,
        rotateStrike: result.ball.rotateStrike,
        isLegal: result.ball.isLegal,
        isWicket: result.ball.isWicket,
        dismissalKind: event.dismissalKind,
        outPlayerId: event.outPlayerId,
        fielderId: event.fielderId,
        assistantFielderId: event.assistantFielderId,
      }, transaction.db);
      transaction.afterCommit(() => { insertedDelivery.current = true; });
      await updateInningsTotals(innings.id, {
        runs: result.next.totalRuns,
        wickets: result.next.totalWickets,
        balls: result.next.legalBalls,
      }, transaction.db);
      const playerCloudId = (localId: string) =>
        [...xiBatting, ...xiBowling].find(player => player.userId === localId)?.cloudId;
      const strikerCloudId = playerCloudId(newBall.strikerId);
      const nonStrikerCloudId = playerCloudId(newBall.nonStrikerId);
      const bowlerCloudId = playerCloudId(newBall.bowlerId);
      const outPlayerCloudId = event.outPlayerId ? playerCloudId(event.outPlayerId) : undefined;
      const fielderCloudId = event.fielderId ? playerCloudId(event.fielderId) : undefined;
      const assistantFielderCloudId = event.assistantFielderId
        ? playerCloudId(event.assistantFielderId)
        : undefined;
      if (match && isUuid(match.id) && isUuid(innings.id)
        && (!strikerCloudId || !nonStrikerCloudId || !bowlerCloudId
          || (event.outPlayerId && !outPlayerCloudId) || (event.fielderId && !fielderCloudId)
          || (event.assistantFielderId && !assistantFielderCloudId))) {
        throw new Error('A selected player has not finished syncing. Reload the match before recording this delivery.');
      }
      if (
        match &&
        isUuid(match.id) &&
        isUuid(innings.id) &&
        strikerCloudId &&
        nonStrikerCloudId &&
        bowlerCloudId
      ) {
        await queueCloudBall({
          clientEventId: newBall.id,
          matchId: match.id,
          inningsId: innings.id,
          payload: {
            innings_id: innings.id,
            over_no: newBall.overNo,
            ball_in_over: newBall.ballInOver,
            legal_ball_in_over: newBall.legalBallInOver,
            striker_id: strikerCloudId,
            non_striker_id: nonStrikerCloudId,
            bowler_id: bowlerCloudId,
            runs_bat: newBall.runsBat,
            runs_extra: newBall.runsExtra,
            extra_kind: newBall.extraKind,
            rotate_strike: newBall.rotateStrike,
            is_legal: newBall.isLegal,
            is_wicket: newBall.isWicket,
            dismissal_kind: event.dismissalKind,
            out_player_id: outPlayerCloudId,
            fielder_id: fielderCloudId,
            assistant_fielder_id: assistantFielderCloudId,
          },
        }, transaction);
      }


      // Update state incrementally — NO full refresh
      transaction.afterCommit(() => { setBalls(prev => [...prev, newBall]); });
      const nextLive: LiveState = {
        totalRuns: result.next.totalRuns,
        totalWickets: result.next.totalWickets,
        legalBalls: result.next.legalBalls,
        overNo: result.next.overNo,
        legalBallInOver: result.next.legalBallInOver,
        strikerId: result.next.strikerId,
        nonStrikerId: result.next.nonStrikerId,
        bowlerId: result.next.bowlerId,
      };

      // Check innings end
      const ended = isInningsOver(
        result.next,
        match!.rules.oversPerInnings,
        xiBatting.length || match!.rules.playersPerSide,
        innings.target,
      );
      if (ended) {
        await clearScoringSession(match!.id, transaction.db);
        const step = await closeAndAdvance(match!.id, innings.id, transaction);
        if (step.kind === 'COMPLETED') {
          transaction.afterCommit(() => { router.replace({
            pathname: '/wricket/match/[id]/scorecard',
            params: { id: match!.id },
          }); });
          return;
        }
        if (step.kind === 'FOLLOW_ON_DECISION') {
          transaction.afterCommit(loadFromDb);
          return;
        }
        if (step.kind === 'NEXT_INNINGS' && step.next) {
          await startNextInnings(match!.id, step.next, transaction);
          transaction.afterCommit(loadFromDb);
          return;
        }
      }

      // Wicket → pick next batter
      const overJustEnded = result.next.overNo > live.overNo;
      if (event.isWicket) {
        const outId = event.outPlayerId ?? live.strikerId;
        if (overJustEnded) {
          nextLive.bowlerId = null;
        }
        if (outId === nextLive.strikerId) {
          transaction.afterCommit(() => { setPendingNewBatterSlot('striker'); });
          nextLive.strikerId = null;
        } else if (outId === nextLive.nonStrikerId) {
          transaction.afterCommit(() => { setPendingNewBatterSlot('nonStriker'); });
          nextLive.nonStrikerId = null;
        } else if (outId === live.strikerId) {
          transaction.afterCommit(() => { setPendingNewBatterSlot('striker'); });
          nextLive.strikerId = null;
        } else {
          transaction.afterCommit(() => { setPendingNewBatterSlot('nonStriker'); });
          nextLive.nonStrikerId = null;
        }
        transaction.afterCommit(() => { setLive(nextLive); });
        await persistSession(
          nextLive,
          'NEXT_BATTER',
          outId,
          balls.length + adjustments.length + retirements.length + 1, transaction.db
        );
        transaction.afterCommit(() => { setPickBatterOpen(true); });
        return;
      }

      // End of over -> prompt new bowler.
      if (overJustEnded) {
        nextLive.bowlerId = null;
        transaction.afterCommit(() => { setLive(nextLive); });
        await persistSession(
          nextLive,
          'NEXT_BOWLER',
          null,
          balls.length + adjustments.length + retirements.length + 1, transaction.db
        );
        transaction.afterCommit(() => { setBowlerOpen(true); });
        return;
      }

      transaction.afterCommit(() => { setLive(nextLive); });
      await persistSession(
        nextLive,
        null,
        null,
        balls.length + adjustments.length + retirements.length + 1, transaction.db
      );
    }); },
    [adjustments.length, balls.length, innings, live, loadFromDb, match, persistSession, retirements.length, router, xiBatting, xiBowling],
  );

  const recordBall = useCallback(async (event: Parameters<typeof persistDelivery>[0]): Promise<boolean> => {
    if (deliveryError || scoringAccessBlocked || !live?.strikerId || !live.nonStrikerId || !live.bowlerId) return false;
    const result = await scoringGate.run(async () => {
      setDeliverySaving(true);
      setDeliveryReceipt(null);
      insertedDelivery.current = false;
      try {
        await persistDelivery(event);
        const label = event.isWicket ? 'Wicket' : event.extra
          ? `${event.extra.replaceAll('_', ' ').toLowerCase()} · ${event.runs} additional runs`
          : `${event.runs} ${event.runs === 1 ? 'run' : 'runs'}`;
        setDeliveryReceipt(`Recorded · ${label}`);
        if (event.isWicket) triggerFlash(colors.wicket);
        else if (!event.extra && event.runs >= 4) triggerFlash(colors.accent);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        return true;
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : 'Could not finish saving this delivery.';
        setDeliveryError(insertedDelivery.current
          ? `Delivery is in local history, but setup or sync failed. Review the scorecard before continuing. ${detail}`
          : `Delivery was not saved. ${detail}`);
        return false;
      } finally { setDeliverySaving(false); }
    });
    return result.accepted && result.value;
  }, [deliveryError, scoringAccessBlocked, live, persistDelivery, scoringGate, triggerFlash]);

  const recordScoreAdjustment = useCallback(
    async (kind: ScoreAdjustmentKind, runs: number) => { return withScoringTransaction(async transaction => {
      if (!innings || !live || runs <= 0) return;
      const adjustment = await insertScoreAdjustment({
        inningsId: innings.id,
        kind,
        runs,
      }, transaction.db);
      const nextLive = { ...live, totalRuns: live.totalRuns + runs };
      await updateInningsTotals(innings.id, {
        runs: nextLive.totalRuns,
        wickets: nextLive.totalWickets,
        balls: nextLive.legalBalls,
      }, transaction.db);
      transaction.afterCommit(() => { setAdjustments(prev => [...prev, adjustment]); });
      transaction.afterCommit(() => { setLive(nextLive); });
      if (match && isUuid(match.id) && isUuid(innings.id)) {
        await queueCloudScoringEvent({
          clientEventId: adjustment.id,
          matchId: match.id,
          inningsId: innings.id,
          kind: 'SCORE_ADJUSTED',
          payload: {
            innings_id: innings.id,
            runs,
            adjustment_kind: kind,
          },
        }, transaction);
      }
      await persistSession(
        nextLive,
        null,
        null,
        balls.length + adjustments.length + retirements.length + 1, transaction.db
      );

      const ended = isInningsOver(
        {
          totalRuns: nextLive.totalRuns,
          totalWickets: nextLive.totalWickets,
          legalBalls: nextLive.legalBalls,
          overNo: nextLive.overNo,
          legalBallInOver: nextLive.legalBallInOver,
          strikerId: nextLive.strikerId ?? '',
          nonStrikerId: nextLive.nonStrikerId ?? '',
          bowlerId: nextLive.bowlerId ?? '',
        },
        match!.rules.oversPerInnings,
        xiBatting.length || match!.rules.playersPerSide,
        innings.target,
      );
      if (ended) {
        await clearScoringSession(match!.id, transaction.db);
        const step = await closeAndAdvance(match!.id, innings.id, transaction);
        if (step.kind === 'COMPLETED') {
          transaction.afterCommit(() => { router.replace({
            pathname: '/wricket/match/[id]/scorecard',
            params: { id: match!.id },
          }); });
        }
        else if (step.kind === 'NEXT_INNINGS' && step.next) {
          await startNextInnings(match!.id, step.next, transaction);
          transaction.afterCommit(loadFromDb);
        }
        else if (step.kind === 'FOLLOW_ON_DECISION') {
          await transaction.afterCommit(loadFromDb);
        }
      }
    }); },
    [adjustments.length, balls.length, innings, live, loadFromDb, match, persistSession, retirements.length, router, xiBatting.length],
  );

  const recordRetirement = useCallback(
    async (kind: 'RETIRED_HURT' | 'RETIRED_OUT', outIsStriker: boolean) => { return withScoringTransaction(async transaction => {
      if (!innings || !live?.strikerId || !live.nonStrikerId) return;
      const playerId = outIsStriker ? live.strikerId : live.nonStrikerId;
      const retirement = await insertBatterRetirement({
        inningsId: innings.id,
        playerId,
        kind,
      }, transaction.db);
      const nextLive = {
        ...live,
        totalWickets: live.totalWickets + (kind === 'RETIRED_OUT' ? 1 : 0),
        strikerId: outIsStriker ? null : live.strikerId,
        nonStrikerId: outIsStriker ? live.nonStrikerId : null,
      };
      await updateInningsTotals(innings.id, {
        runs: nextLive.totalRuns,
        wickets: nextLive.totalWickets,
        balls: nextLive.legalBalls,
      }, transaction.db);
      transaction.afterCommit(() => { setRetirements(prev => [...prev, retirement]); });
      transaction.afterCommit(() => { setLive(nextLive); });
      const playerCloudId = [...xiBatting, ...xiBowling]
        .find(player => player.userId === playerId)?.cloudId;
      if (match && isUuid(match.id) && isUuid(innings.id) && !playerCloudId) {
        throw new Error('This batter has not finished syncing. Reload the match before recording a retirement.');
      }
      if (match && isUuid(match.id) && isUuid(innings.id) && playerCloudId) {
        await queueCloudScoringEvent({
          clientEventId: retirement.id,
          matchId: match.id,
          inningsId: innings.id,
          kind: 'BATTER_RETIRED',
          payload: {
            innings_id: innings.id,
            player_id: playerCloudId,
            retirement_kind: kind,
          },
        }, transaction);
      }
      transaction.afterCommit(() => { setPendingNewBatterSlot(outIsStriker ? 'striker' : 'nonStriker'); });
      await persistSession(
        nextLive,
        'NEXT_BATTER',
        playerId,
        balls.length + adjustments.length + retirements.length + 1, transaction.db
      );

      const battingSideSize = xiBatting.length || match!.rules.playersPerSide;
      const ended = kind === 'RETIRED_OUT' && nextLive.totalWickets >= battingSideSize - 1;
      if (!ended) transaction.afterCommit(() => { setPickBatterOpen(true); });
      if (ended) {
        await clearScoringSession(match!.id, transaction.db);
        const step = await closeAndAdvance(match!.id, innings.id, transaction);
        if (step.kind === 'COMPLETED') {
          transaction.afterCommit(() => { router.replace({
            pathname: '/wricket/match/[id]/scorecard',
            params: { id: match!.id },
          }); });
        }
        else if (step.kind === 'NEXT_INNINGS' && step.next) {
          await startNextInnings(match!.id, step.next, transaction);
          await transaction.afterCommit(loadFromDb);
        }
        else if (step.kind === 'FOLLOW_ON_DECISION') {
          await transaction.afterCommit(loadFromDb);
        }
      }
    }); },
    [adjustments.length, balls.length, innings, live, loadFromDb, match, persistSession, retirements.length, router, xiBatting, xiBowling],
  );

  const onPadAction = useCallback(
    async (a: PadAction) => {
      if (scoringGate.busy || deliveryError || scoringAccessBlocked) return;
      if (a.kind !== 'UNDO' && (!live?.strikerId || !live?.nonStrikerId || !live?.bowlerId)) {
        if (!live?.strikerId || !live?.nonStrikerId) {
          setOpenersOpen(true);
        } else {
          setBowlerOpen(true);
        }
        return;
      }
      if (a.kind === 'RUNS') {
        await recordBall({ runs: a.runs, extra: null, isWicket: false });
      } else if (a.kind === 'WICKET') {
        setWicketOpen(true);
      } else if (a.kind === 'UNDO') {
        if (!innings || !balls.length) return;
        const undo = async () => {
          await scoringGate.run(async () => {
            setDeliverySaving(true);
            setDeliveryReceipt(null);
            try {
 await withScoringTransaction(async transaction => {
              const deletedBall = await deleteLastBall(innings.id, transaction.db);
              const deletedBallHasCloudPlayers = deletedBall
                ? [deletedBall.strikerId, deletedBall.nonStrikerId, deletedBall.bowlerId]
                    .every(localId =>
                      [...xiBatting, ...xiBowling]
                        .some(player => player.userId === localId && player.cloudId),
                    )
                : false;
              if (deletedBall && match && isUuid(match.id) && isUuid(innings.id) && !deletedBallHasCloudPlayers) {
                throw new Error('This delivery’s players have not finished syncing. Reload the match before Undo.');
              }
              if (
                deletedBall &&
                deletedBallHasCloudPlayers &&
                match &&
                isUuid(match.id) &&
                isUuid(innings.id)
              ) {
                await queueCloudScoringEvent({
                  clientEventId: `undo-${deletedBall.id}-${Date.now()}`,
                  matchId: match.id,
                  inningsId: innings.id,
                  kind: 'BALL_CORRECTED',
                  payload: {
                    innings_id: innings.id,
                    target_client_event_id: deletedBall.id,
                    correction: 'UNDO',
                  },
                }, transaction);
              }
              const ballList = await listBalls(innings.id, transaction.db);
              const adjustmentList = await listScoreAdjustments(innings.id, transaction.db);
              const retirementList = await listBatterRetirements(innings.id, transaction.db);
              const state = deriveStateFromBalls(
                ballList,
                adjustmentList,
                retirementList,
              );
              if (!ballList.length && !retirementList.length && deletedBall) {
                state.strikerId = deletedBall.strikerId;
                state.nonStrikerId = deletedBall.nonStrikerId;
                state.bowlerId = deletedBall.bowlerId;
              }
              await updateInningsTotals(innings.id, {
                runs: state.totalRuns,
                wickets: state.totalWickets,
                balls: state.legalBalls,
              }, transaction.db);
              transaction.afterCommit(() => { setBalls(ballList); });
              transaction.afterCommit(() => { setAdjustments(adjustmentList); });
              transaction.afterCommit(() => { setRetirements(retirementList); });
              transaction.afterCommit(() => { setLive(state); });
              await persistSession(
                state,
                !state.strikerId || !state.nonStrikerId ? 'NEXT_BATTER' : !state.bowlerId ? 'NEXT_BOWLER' : null,
                null,
                ballList.length + adjustmentList.length + retirementList.length, transaction.db
              );
              if (!state.bowlerId) transaction.afterCommit(() => { setBowlerOpen(true); });
              transaction.afterCommit(() => { setDeliveryReceipt('Last delivery undone'); });

 });
} catch (cause) {
              setDeliveryError(`Could not complete Undo. Review the scorecard before continuing. ${cause instanceof Error ? cause.message : ''}`);
            } finally { setDeliverySaving(false); }
          });
        };
        if (Platform.OS === 'web') {
          if (globalThis.confirm('Undo last ball?')) await undo();
        } else {
          Alert.alert('Undo last ball?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Undo', style: 'destructive', onPress: () => void undo() },
          ]);
        }
      }
    },
    [balls.length, deliveryError, scoringAccessBlocked, innings, live, match, persistSession, recordBall, scoringGate, xiBatting, xiBowling],
  );

  const endInningsEarly = useCallback(async () => {
    if (!match || !innings) throw new Error('No active innings is available.');
    const step = await withScoringTransaction(async transaction => {
      const next = await closeAndAdvance(match.id, innings.id, transaction);
      if (next.kind === 'NEXT_INNINGS' && next.next) await startNextInnings(match.id, next.next, transaction);
      return next;
    });
    if (step.kind === 'COMPLETED') {
      router.replace({ pathname: '/wricket/match/[id]/scorecard', params: { id: match.id } });
    } else {
      await loadFromDb();
    }
  }, [match, innings, loadFromDb, router]);

  const resolveFollowOnDecision = useCallback(async (enforce: boolean) => {
    if (!match || followOnDecisionLock.current) return;
    followOnDecisionLock.current = true;
    setFollowOnDecisionSaving(true); setFollowOnDecisionError(undefined);
    try {
      const innList = await listInningsForMatch(match.id);
      const firstInnings = innList.find(item => item.sequence === 1);
      const secondInnings = innList.find(item => item.sequence === 2);
      if (!firstInnings || !secondInnings) throw new Error('Both first innings are required before deciding the follow-on.');
      await startNextInnings(match.id, {
        sequence: 3,
        battingTeamId: enforce ? secondInnings.battingTeamId : firstInnings.battingTeamId,
        bowlingTeamId: enforce ? firstInnings.battingTeamId : secondInnings.battingTeamId,
        isFollowOn: enforce,
      });
      await loadFromDb();
    } catch (cause) {
      setFollowOnDecisionError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      followOnDecisionLock.current = false;
      setFollowOnDecisionSaving(false);
    }
  }, [loadFromDb, match]);

  const finishExceptionalMatch = useCallback(async (
    resolution: MatchAbandonmentResolution, winnerTeamId?: string,
  ) => {
    if (!match || !innings) throw new Error('No active innings is available.');
    if (resolution === 'WALKOVER' && ![match.teamAId, match.teamBId].includes(winnerTeamId ?? '')) throw new Error('Choose a participating team for the walkover.');
    await resolveAbandonedMatchLifecycle(match.id, innings.id, resolution, winnerTeamId);
    router.replace({ pathname: '/wricket/match/[id]/scorecard', params: { id: match.id } });
  }, [innings, match, router]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (match?.status !== 'FOLLOW_ON_DECISION') {
      lastFollowOnPromptRef.current = null;
      return;
    }
    const firstInnings = matchInnings.find(item => item.sequence === 1);
    const secondInnings = matchInnings.find(item => item.sequence === 2);
    if (!firstInnings || !secondInnings || !teamA || !teamB) return;
    const promptKey = `${match.id}:${secondInnings.id}`;
    if (lastFollowOnPromptRef.current === promptKey) return;
    lastFollowOnPromptRef.current = promptKey;

    const enforcingTeam = firstInnings.battingTeamId === teamA.id ? teamA : teamB;
    const followingTeam = secondInnings.battingTeamId === teamA.id ? teamA : teamB;
    const deficit = firstInnings.totalRuns - secondInnings.totalRuns;
    Alert.alert(
      'Follow-on available',
      `${followingTeam.name} trail ${enforcingTeam.name} by ${deficit} runs. Enforce the follow-on?`,
      [
        {
          text: `Decline — ${enforcingTeam.name} bat`,
          onPress: () => void resolveFollowOnDecision(false),
        },
        {
          text: `Enforce on ${followingTeam.name}`,
          style: 'destructive',
          onPress: () => void resolveFollowOnDecision(true),
        },
      ],
      { cancelable: false },
    );
  }, [match, matchInnings, resolveFollowOnDecision, teamA, teamB]);

  const confirmControl = async (command: MatchControlCommand): Promise<boolean> => {
    if (scoringAccessBlocked) { setControlError('Scoring access is unavailable. ' + cloudSync.error); return false; }
    if (deliveryError || controlError || !match || !innings || !live || innings.isClosed) return false;
    const result = await scoringGate.run(async () => {
      setDeliverySaving(true);
      setDeliveryReceipt(null);
      try {
        if (command.type === 'ADJUST') {
          if (!Number.isInteger(command.runs) || command.runs < 1 || command.runs > 6) throw new Error('Choose between 1 and 6 runs.');
          await recordScoreAdjustment(command.kind, command.runs);
          setDeliveryReceipt(`Recorded · +${command.runs} ${command.kind.toLowerCase()} runs`);
        } else if (command.type === 'RETIRE') {
          if (!live.strikerId || !live.nonStrikerId) throw new Error('Select both active batters first.');
          await recordRetirement(command.kind, command.outIsStriker);
          setDeliveryReceipt(`Recorded · ${command.kind === 'RETIRED_HURT' ? 'Retired hurt' : 'Retired out'}`);
        } else if (command.type === 'END_INNINGS') {
          await endInningsEarly();
        } else {
          await finishExceptionalMatch(command.resolution, command.winnerTeamId);
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        return true;
      } catch (cause) {
        const message = `Could not finish this action. Reload the saved match before continuing. ${cause instanceof Error ? cause.message : ''}`;
        setControlError(message);
        setDeliveryError(message);
        return false;
      } finally { setDeliverySaving(false); }
    });
    return result.accepted && result.value;
  };

  if (match?.status === 'FOLLOW_ON_DECISION' && teamA && teamB) {
    const firstInnings = matchInnings.find(item => item.sequence === 1);
    const secondInnings = matchInnings.find(item => item.sequence === 2);
    const enforcingTeam = firstInnings?.battingTeamId === teamA.id ? teamA : teamB;
    const followingTeam = secondInnings?.battingTeamId === teamA.id ? teamA : teamB;
    const deficit = firstInnings && secondInnings ? firstInnings.totalRuns - secondInnings.totalRuns : undefined;

    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadState}>
          <MaterialCommunityIcons name="swap-vertical-bold" size={48} color={colors.accent} />
          <Text variant="h2">Follow-on decision</Text>
          <Text tone="muted" style={styles.loadErrorText}>
            {followingTeam.name} trail {enforcingTeam.name}{deficit !== undefined ? ` by ${deficit} runs` : ''}. Choose who bats in the third innings.
          </Text>
          {followOnDecisionError ? <Text accessibilityRole="alert" tone="danger">Could not apply this decision. {followOnDecisionError}</Text> : null}
          <View style={styles.loadActions}>
            <Button title={`Enforce on ${followingTeam.name}`} disabled={followOnDecisionSaving} onPress={() => void resolveFollowOnDecision(true)} />
            <Button title={`Decline — ${enforcingTeam.name} bat`} variant="secondary" disabled={followOnDecisionSaving} onPress={() => void resolveFollowOnDecision(false)} />
          </View>
        </View>
      </Screen>
    );
  }

  if (!match || !innings || !live || !battingTeam || !bowlingTeam) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadState}>
          {loadError ? (
            <>
              <MaterialCommunityIcons name="alert-circle-outline" size={42} color={colors.danger} />
              <Text variant="h3">Could not resume scoring</Text>
              <Text tone="muted" style={styles.loadErrorText}>{loadError}</Text>
              <View style={styles.loadActions}>
                <Button title="Try again" onPress={() => void loadFromDb()} />
                <Button title="Go back" variant="secondary" onPress={() => router.back()} />
              </View>
            </>
          ) : (
            <SportStageLoader variant="section" message="Preparing the scorer" detail="Restoring the innings, playing XI, and live session" />
          )}
        </View>
      </Screen>
    );
  }

  const strikerLine = striker ? batsmanLineFor(striker.userId, balls) : null;
  const nonStrikerLine = nonStriker ? batsmanLineFor(nonStriker.userId, balls) : null;
  const bowlerLine = bowler ? bowlerLineFor(bowler.userId, balls) : null;

  return (
    <Screen padded={false} style={{ backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Leave scoring" disabled={deliverySaving} onPress={confirmLeaveScoring}>
          <DesignIcon name="back" />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 16 }}><Text variant="overline" tone="muted">{match.format} · SCORING</Text><Text variant="h3" numberOfLines={1}>{teamA?.shortName} vs {teamB?.shortName}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Match controls" disabled={deliverySaving} onPress={() => setInningsSettingsOpen(true)}>
          <DesignIcon name="settings" />
        </Pressable>
      </View>



        <View style={styles.scoreBlock}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, scoreFlashStyle]} />
          <Image pointerEvents="none" style={StyleSheet.absoluteFill} contentFit="fill" source={{ uri: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#1e2c20"/><stop offset="1" stop-color="#0e1811"/></linearGradient></defs><path fill="url(#g)" d="M0 0h400v200H0z"/></svg>') }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text variant="overline" tone="accent">● LIVE</Text>
            <Text variant="overline" tone="muted">INNINGS {innings.sequence} · {match.rules.oversPerInnings} OVERS</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text variant="caption" style={{ flex: 1 }}>{battingTeam.name}</Text><TeamCrest name={battingTeam.name} /></View>
          <Animated.View key={live.totalRuns + '-' + live.totalWickets} entering={reducedMotion ? undefined : FadeIn.duration(200)}>
            <View accessibilityLabel={`Score ${live.totalRuns} for ${live.totalWickets}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 43, lineHeight: 49.45, letterSpacing: -3 }}>{live.totalRuns}</Text>
              <Text style={{ fontFamily: fonts.display, fontSize: 29, lineHeight: 36, color: '#9baf94', marginLeft: -8 }}>/{live.totalWickets}</Text>
              <Text variant="mono" tone="muted">{formatOver(live.legalBalls)} / {match.rules.oversPerInnings} ov</Text>
            </View>
          </Animated.View>
          <Text variant="caption" tone={innings.target ? 'accent' : 'muted'} style={{ marginTop: 4 }}>
            {innings.target ? `Need ${Math.max(0, innings.target - live.totalRuns)} from ${Math.max(0, match.rules.oversPerInnings * 6 - live.legalBalls)} balls` : `${formatOver(live.legalBalls)} overs · CRR ${runRate(live.totalRuns, live.legalBalls).toFixed(2)}`}
          </Text>
          {testSituation.positionText && <Text variant="bodyStrong" style={{ marginTop: spacing.xs }}>
            {testSituation.positionText}
          </Text>}
          {testSituation.followOnText && <Text variant="caption" tone="accent" style={{ marginTop: 2 }}>
            {testSituation.followOnText}
          </Text>}
        </View>

      <ScrollView style={styles.scoringWorkspace} contentContainerStyle={{ paddingBottom: 18 }} keyboardShouldPersistTaps="handled">
        <View style={styles.scoringContent}>
      {isUuid(match.id) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cloudSync.status === 'ERROR' ? 'Reconnect scoring updates' : 'Connection status'}
          onPress={() => {
            if (cloudSync.status === 'ERROR') { void flushScoringEvents(match.id); return; }
            const message = cloudSync.status === 'LIVE' ? 'All recorded updates have been sent.' : `${cloudSync.pending} updates waiting to sync.`;
            if (Platform.OS === 'web') globalThis.alert(message);
            else Alert.alert('Connection', message);
          }}
          style={[
            styles.syncBanner,
            cloudSync.status === 'ERROR' && styles.syncBannerError,
          ]}
        >
          <Text style={{ fontSize: 7, color: cloudSync.status === 'ERROR' ? colors.danger : '#819679' }}>●</Text>
          <Text variant="caption" style={{ flex: 1, fontFamily: fonts.mono, fontSize: 8, color: '#a6bba0' }}>
            {cloudSync.status === 'LIVE'
              ? 'Saved · updates sent'
              : cloudSync.status === 'ERROR'
                ? `${cloudSync.error ?? 'Cloud scoring sync failed'} · ${cloudSync.pending} update${cloudSync.pending === 1 ? '' : 's'} waiting · tap to retry`
                : `${cloudSync.pending} update${cloudSync.pending === 1 ? '' : 's'} ${cloudSync.status === 'SYNCING' ? 'syncing' : 'waiting'}`}
          </Text>
          <Text variant="caption" tone="accent">{cloudSync.status === 'ERROR' ? 'Reconnect' : 'Connection'}</Text>
        </Pressable>
      )}
          <Card style={{ paddingVertical: 3, paddingHorizontal: 12 }}>
            <PlayerLine
              name={striker?.name ?? 'Pick striker'}
              marker="●"
              runs={strikerLine?.runs ?? 0}
              balls={strikerLine?.balls ?? 0}
              fours={strikerLine?.fours ?? 0}
              sixes={strikerLine?.sixes ?? 0}
              onPress={() => { if (!scoringGate.busy) setOpenersOpen(true); }}
            />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <PlayerLine
              name={nonStriker?.name ?? 'Pick non-striker'}
              marker=""
              runs={nonStrikerLine?.runs ?? 0}
              balls={nonStrikerLine?.balls ?? 0}
              fours={nonStrikerLine?.fours ?? 0}
              sixes={nonStrikerLine?.sixes ?? 0}
              onPress={() => { if (!scoringGate.busy) setOpenersOpen(true); }}
            />
          </Card>

          <Pressable disabled={deliverySaving} onPress={() => setBowlerOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 24, gap: 8 }}>
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>Bowling <Text variant="caption">{bowler?.name ?? 'Pick bowler'}</Text></Text>
            {bowlerLine ? <Text variant="mono">{bowlerLine.wickets}/{bowlerLine.runsConceded} <Text variant="caption" tone="muted">({bowlerLine.oversText})</Text></Text> : null}
          </Pressable>

          <ThisOver balls={thisOverBalls} />

          <ScoringInputDeck uiVersion={uiVersion} mode={inputMode} onModeChange={selectInputMode} onAction={action => void onPadAction(action)}
            onControls={() => setInningsSettingsOpen(true)} onHistory={() => router.push({ pathname: '/wricket/match/[id]/live', params: { id: match.id, tab: 'commentary' } })}
            onExtras={() => setExtraOpen(true)} disabled={deliverySaving || Boolean(deliveryError) || scoringAccessBlocked || !live.strikerId || !live.nonStrikerId || !live.bowlerId}
            saving={deliverySaving} canUndo={balls.length > 0} receipt={deliveryReceipt} error={deliveryError} />
          {deliveryError ? <Button title="Review scorecard" variant="secondary" onPress={() => router.push({ pathname: '/wricket/match/[id]/scorecard', params: { id: match.id } })} /> : null}

          {adjustments.length > 0 && (
            <Text variant="caption" tone="dim" style={styles.adjustmentLabel}>
              Adjustments +{totalAdjustmentRuns(adjustments)}
            </Text>
          )}
        </View>
      </ScrollView>

      <MatchControls visible={inningsSettingsOpen} saving={deliverySaving} error={controlError}
        onClose={() => { if (!scoringGate.busy) setInningsSettingsOpen(false); }}
        onScorecard={() => { setInningsSettingsOpen(false); router.push({ pathname: '/wricket/match/[id]/scorecard', params: { id: match.id } }); }}
        onConfirm={confirmControl} innings={innings.sequence} teamName={battingTeam.name}
        runs={live.totalRuns} wickets={live.totalWickets} legalBalls={live.legalBalls} overs={match.rules.oversPerInnings}
        target={innings.target} striker={striker?.name ?? null} nonStriker={nonStriker?.name ?? null}
        teams={[teamA!, teamB!]} />

      <PickPlayersSheet
        visible={openersOpen}
        title="Select openers"
        players={xiBatting}
        currentIds={[live.strikerId, live.nonStrikerId].filter(Boolean) as string[]}
        slots={['Striker', 'Non-striker']}
        onClose={() => setOpenersOpen(false)}
        onConfirm={async ([s, ns]) => {
          setOpenersOpen(false);
          const nextLive = { ...live, strikerId: s, nonStrikerId: ns };
          setLive(nextLive);
          await persistSession(nextLive, !nextLive.bowlerId ? 'NEXT_BOWLER' : null);
          if (!nextLive.bowlerId) setTimeout(() => setBowlerOpen(true), 350);
        }}
      />

      <PickPlayersSheet
        visible={bowlerOpen}
        title="Select bowler"
        players={xiBowling}
        currentIds={[live.bowlerId].filter(Boolean) as string[]}
        slots={['Bowler']}
        onClose={() => setBowlerOpen(false)}
        onConfirm={async ([b]) => {
          setBowlerOpen(false);
          const nextLive = { ...live, bowlerId: b };
          setLive(nextLive);
          await persistSession(nextLive);
        }}
      />

      <PickPlayersSheet
        visible={pickBatterOpen}
        title="Next batter"
        players={xiBatting.filter(
          p =>
            p.userId !== live.strikerId &&
            p.userId !== live.nonStrikerId &&
            !balls.some(b => b.isWicket && b.dismissal?.outPlayerId === p.userId) &&
            !retirements.some(r => r.playerId === p.userId),
        )}
        currentIds={[]}
        slots={['Batter']}
        onClose={() => setPickBatterOpen(false)}
        onConfirm={async ([userId]) => {
          setPickBatterOpen(false);
          const nextLive = pendingNewBatterSlot === 'striker'
            ? { ...live, strikerId: userId }
            : pendingNewBatterSlot === 'nonStriker'
              ? { ...live, nonStrikerId: userId }
              : live;
          setLive(nextLive);
          setPendingNewBatterSlot(null);
          await persistSession(nextLive, !nextLive.bowlerId ? 'NEXT_BOWLER' : null);
          if (!nextLive.bowlerId) setTimeout(() => setBowlerOpen(true), 350);
        }}
      />

      <WicketSheet
        bowler={bowler?.name ?? 'Select bowler'}
        visible={wicketOpen}
        saving={deliverySaving}
        error={deliveryError}
        onClose={() => { if (!scoringGate.busy) setWicketOpen(false); }}
        striker={striker?.name ?? '?'}
        nonStriker={nonStriker?.name ?? '?'}
        fielders={xiBowling}
        onConfirm={async ({ kind, outIsStriker, fielderId, assistantFielderId }) => {
          const outPlayerId = outIsStriker ? live.strikerId! : live.nonStrikerId!;
          const recorded = await recordBall({
            runs: 0,
            extra: null,
            isWicket: true,
            dismissalKind: kind,
            outPlayerId,
            fielderId,
            assistantFielderId,
          });
          if (recorded) setWicketOpen(false);
        }}
      />

      <ExtrasSheet
        legalBalls={live.legalBalls}
        visible={extraOpen}
        saving={deliverySaving}
        error={deliveryError}
        onClose={() => { if (!scoringGate.busy) setExtraOpen(false); }}
        onConfirm={async ({ kind, runs, rotateStrike }) => {
          if (await recordBall({ runs, extra: kind, isWicket: false, rotateStrike })) setExtraOpen(false);
        }}
      />
    </Screen>
  );
}

function totalAdjustmentRuns(items: ScoreAdjustment[]): number {
  return items.reduce((sum, item) => sum + item.runs, 0);
}

function PlayerLine({ name, marker, runs, balls, onPress }: {
  name: string; marker: string; runs: number; balls: number; fours: number; sixes: number; onPress?: () => void;
}) {
  return <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
    {marker ? <Text style={{ color: colors.accent, fontSize: 8, marginRight: 6 }}>●</Text> : null}
    <Text variant="body" style={{ flex: 1, fontSize: 12 }} numberOfLines={1}>{name}</Text>
    <Text style={{ fontFamily: fonts.mono, fontSize: 16 }}>{runs}</Text>
    <Text style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, marginLeft: 7 }}>({balls})</Text>
  </Pressable>;
}

function ThisOver({ balls }: { balls: Ball[] }) {
  const visibleBalls = balls.slice(-8);
  return <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
    <Text variant="overline" tone="muted" style={{ marginRight: 4 }}>THIS OVER</Text>
    {visibleBalls.map(ball => <View key={ball.id} style={{ width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: ball.isWicket ? '#694437' : ball.runsBat >= 4 ? '#6b9645' : '#39493b',
      backgroundColor: ball.isWicket ? '#2c211c' : ball.runsBat >= 4 ? '#334a25' : '#1b271c' }}>
      <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: ball.isWicket ? colors.danger : colors.text }}>{ballSymbol(ball)}</Text>
    </View>)}
    {Array.from({ length: Math.max(0, 6 - visibleBalls.length) }, (_, i) => <View key={i} style={{ width: 29, height: 29, borderRadius: 15, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}><Text tone="dim">·</Text></View>)}
  </View>;
}

function PickPlayersSheet({
  visible, title, players, currentIds, slots, onClose, onConfirm,
}: {
  visible: boolean; title: string; players: MatchXIPlayer[]; currentIds: string[];
  slots: string[]; onClose: () => void; onConfirm: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { setSelected([]); }, [visible]);

  const toggle = (id: string) => {
    if (selected.includes(id)) setSelected(selected.filter(s => s !== id));
    else if (selected.length < slots.length) setSelected([...selected, id]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Animated.View entering={FadeIn.duration(200)} style={styles.modalSheet}>
          <View style={styles.sheetHeader}>
            <Text variant="h2">{title}</Text>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
            Pick {slots.length === 1 ? slots[0].toLowerCase() : `${slots.length}: ${slots.join(' & ')}`}
          </Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {players.map(p => {
              const idx = selected.indexOf(p.userId);
              const label = idx === -1 ? null : slots[idx];
              return (
                <Pressable
                  key={p.userId}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${p.name}`}
                  accessibilityState={{ selected: idx !== -1 }}
                  onPress={() => toggle(p.userId)}
                  style={[styles.pickRow, idx !== -1 && styles.pickRowActive]}
                >
                  <Text variant="bodyStrong" style={{ flex: 1 }}>{p.name}</Text>
                  {label ? (
                    <View style={styles.pickBadge}>
                      <Text variant="caption" style={{ color: colors.accentInk, fontWeight: '700' }}>{label}</Text>
                    </View>
                  ) : (
                    <Text variant="caption" tone="dim">#{p.battingOrder}</Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <Button
            title="Confirm"
            disabled={selected.length !== slots.length}
            onPress={() => onConfirm(selected)}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loadState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  loadErrorText: {
    textAlign: 'center',
  },
  loadActions: {
    width: '100%',
    maxWidth: 320,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  syncBanner: {
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  syncBannerError: {
    borderBottomWidth: 1,
    borderBottomColor: colors.danger,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingsClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  settingsDescription: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  topBar: {
    minHeight: 66,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoringWorkspace: {
    flex: 1,
    minHeight: 0,
  },
  scoringContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: spacing.sm,
    gap: 11,
  },
  scoreBlock: {
    paddingHorizontal: 18,
    paddingTop: 13,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    overflow: 'hidden',
  },
  thisOver: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thisOverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  thisOverBalls: {
    minHeight: 28,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  inputDeck: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  padFrame: {
    flex: 1,
    aspectRatio: 1,
    width: '100%',
    maxHeight: '100%',
    maxWidth: 440,
  },
  quickActionRail: {
    width: '100%',
    maxWidth: 440,
    height: 46,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  quickAction: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.extra,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  quickActionGhost: {
    borderColor: colors.border,
  },
  quickActionPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.97 }],
  },
  quickActionLabel: {
    fontWeight: '700',
    textAlign: 'center',
  },
  adjustmentLabel: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
  },
  ballChip: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: spacing.xs,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ballChipExtra: {
    borderWidth: 1,
    borderColor: colors.extra,
    borderStyle: 'dashed',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickRowActive: {
    backgroundColor: colors.surface,
  },
  pickBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  fielderPicker: {
    marginBottom: spacing.lg,
  },
  fielderOptions: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  fielderOption: {
    minWidth: 112,
    maxWidth: 180,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  runChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  runChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
