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
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {
  FadeIn,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { GesturePad, PadAction } from '@/components/wricket/scoring/GesturePad';
import { colors, palette } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import {
  getMatch,
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
import { ballSymbol, batsmanLineFor, bowlerLineFor } from '@/lib/wricket/domain/stats';
import {
  CloudScoringSyncState,
  flushScoringEvents,
  queueCloudBall,
  queueCloudScoringEvent,
  subscribeToCloudScoringSync,
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [match, setMatch] = useState<Match | null>(null);
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  const [innings, setInnings] = useState<Innings | null>(null);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [adjustments, setAdjustments] = useState<ScoreAdjustment[]>([]);
  const [retirements, setRetirements] = useState<BatterRetirement[]>([]);
  const [xiBatting, setXiBatting] = useState<MatchXIPlayer[]>([]);
  const [xiBowling, setXiBowling] = useState<MatchXIPlayer[]>([]);
  const [live, setLive] = useState<LiveState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // sheets
  const [openersOpen, setOpenersOpen] = useState(false);
  const [bowlerOpen, setBowlerOpen] = useState(false);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [retirementOpen, setRetirementOpen] = useState(false);
  const [pickBatterOpen, setPickBatterOpen] = useState(false);
  const [pendingNewBatterSlot, setPendingNewBatterSlot] = useState<'striker' | 'nonStriker' | null>(null);
  const [inningsSettingsOpen, setInningsSettingsOpen] = useState(false);
  const [cloudSync, setCloudSync] = useState<CloudScoringSyncState>({
    status: 'LIVE',
    pending: 0,
  });
  const lastShownSyncErrorRef = useRef<string | null>(null);
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
    flashColor.current = color;
    scoreFlash.value = withSequence(
      withTiming(0.35, { duration: 80 }),
      withTiming(0, { duration: 500 }),
    );
  }, [scoreFlash]);

  // Full load from DB — only on mount, innings transition, or undo
  const loadFromDb = useCallback(async () => {
    setLoadError(null);
    try {
    if (!id) throw new Error('The match ID is missing from this route.');
    let m = await getMatch(id);
    if (!m) {
      await hydrateScoringMatch(id);
      m = await getMatch(id);
      if (!m) throw new Error('The cloud match could not be restored to the scoring cache.');
    }
    setMatch(m);

    const [a, b] = await Promise.all([getTeam(m.teamAId), getTeam(m.teamBId)]);
    if (!a || !b) throw new Error('One or both teams are missing from the local scoring cache.');
    setTeamA(a);
    setTeamB(b);

    let innList = await listInningsForMatch(m.id);
    // Tournament sync can create the local match shell before downloading its
    // scoring history. Restore the authoritative innings/XI/event log when a
    // scorer opens that shell on another device.
    if (innList.length === 0 && isUuid(m.id) && ['IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION'].includes(m.status)) {
      await hydrateScoringMatch(m.id);
      innList = await listInningsForMatch(m.id);
    }
    let open = innList.find(i => !i.isClosed);
    if (!open && m.status === 'INNINGS_BREAK') {
      const step = await planNextStep(m.id);
      if (step.kind === 'NEXT_INNINGS' && step.next) {
        await startNextInnings(m.id, step.next);
        innList = await listInningsForMatch(m.id);
        open = innList.find(i => !i.isClosed);
      }
    }
    if (!open) {
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
    setBalls(ballList);
    setAdjustments(adjustmentList);
    setRetirements(retirementList);

    let xiBatList = await getMatchXI(m.id, open.battingTeamId);
    let xiBowlList = await getMatchXI(m.id, open.bowlingTeamId);
    if ((xiBatList.length === 0 || xiBowlList.length === 0) && isUuid(m.id)) {
      await hydrateScoringMatch(m.id);
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
  }, [id, router]);

  const persistSession = useCallback(async (
    state: LiveState,
    pendingPrompt: 'NEXT_BATTER' | 'NEXT_BOWLER' | null = null,
    pendingPlayerId: string | null = null,
    eventSequence = balls.length + adjustments.length + retirements.length,
  ) => {
    if (!match || !innings) return;
    await saveScoringSession({
      matchId: match.id,
      inningsId: innings.id,
      strikerId: state.strikerId ?? undefined,
      nonStrikerId: state.nonStrikerId ?? undefined,
      bowlerId: state.bowlerId ?? undefined,
      pendingPrompt,
      pendingPlayerId: pendingPlayerId ?? undefined,
      completedOver: pendingPrompt === 'NEXT_BOWLER' ? state.overNo - 1 : undefined,
      lastCommittedEventSequence: eventSequence,
    });
  }, [adjustments.length, balls.length, innings, match, retirements.length]);

  useEffect(() => { loadFromDb(); }, [loadFromDb]);
  useEffect(() => {
    if (id && isUuid(id)) void flushScoringEvents(id);
  }, [id]);
  useEffect(() => {
    if (!id || !isUuid(id)) return;
    return subscribeToCloudScoringSync(id, setCloudSync);
  }, [id]);
  useEffect(() => {
    if (cloudSync.status !== 'ERROR' || !cloudSync.error) {
      if (cloudSync.status === 'LIVE') lastShownSyncErrorRef.current = null;
      return;
    }
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

  const striker = live?.strikerId ? xiBatting.find(p => p.userId === live.strikerId) : null;
  const nonStriker = live?.nonStrikerId ? xiBatting.find(p => p.userId === live.nonStrikerId) : null;
  const bowler = live?.bowlerId ? xiBowling.find(p => p.userId === live.bowlerId) : null;

  const thisOverBalls = useMemo(() => {
    if (!live) return [];
    return balls.filter(b => b.overNo === live.overNo);
  }, [balls, live]);

  const recordBall = useCallback(
    async (event: {
      runs: number;
      extra: ExtraKind;
      isWicket: boolean;
      dismissalKind?: DismissalKind;
      outPlayerId?: string;
      fielderId?: string;
      assistantFielderId?: string;
    }) => {
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
        isLegal: result.ball.isLegal,
        isWicket: result.ball.isWicket,
        dismissalKind: event.dismissalKind,
        outPlayerId: event.outPlayerId,
        fielderId: event.fielderId,
        assistantFielderId: event.assistantFielderId,
      });
      await updateInningsTotals(innings.id, {
        runs: result.next.totalRuns,
        wickets: result.next.totalWickets,
        balls: result.next.legalBalls,
      });
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
            is_legal: newBall.isLegal,
            is_wicket: newBall.isWicket,
            dismissal_kind: event.dismissalKind,
            out_player_id: outPlayerCloudId,
            fielder_id: fielderCloudId,
            assistant_fielder_id: assistantFielderCloudId,
          },
        });
      }

      // Animate
      if (event.isWicket) {
        triggerFlash(colors.wicket);
      } else if (event.runs === 4 && !event.extra) {
        triggerFlash(colors.boundary);
      } else if (event.runs === 6 && !event.extra) {
        triggerFlash(colors.six);
      }

      // Update state incrementally — NO full refresh
      setBalls(prev => [...prev, newBall]);
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
        await clearScoringSession(match!.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const step = await closeAndAdvance(match!.id, innings.id);
        if (step.kind === 'COMPLETED') {
          router.replace({
            pathname: '/wricket/match/[id]/scorecard',
            params: { id: match!.id },
          });
          return;
        }
        if (step.kind === 'FOLLOW_ON_DECISION') {
          Alert.alert('Follow-on', 'Trail exceeds threshold. Enforce follow-on?', [
            {
              text: 'Decline',
              onPress: async () => {
                const innList = await listInningsForMatch(match!.id);
                await startNextInnings(match!.id, {
                  sequence: 3,
                  battingTeamId: innList[0].battingTeamId,
                  bowlingTeamId: innList[1].battingTeamId,
                });
                loadFromDb();
              },
            },
            {
              text: 'Enforce',
              style: 'destructive',
              onPress: async () => {
                const innList = await listInningsForMatch(match!.id);
                await startNextInnings(match!.id, {
                  sequence: 3,
                  battingTeamId: innList[1].battingTeamId,
                  bowlingTeamId: innList[0].battingTeamId,
                  isFollowOn: true,
                });
                loadFromDb();
              },
            },
          ], { cancelable: false });
          return;
        }
        if (step.kind === 'NEXT_INNINGS' && step.next) {
          await startNextInnings(match!.id, step.next);
          loadFromDb();
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
          setPendingNewBatterSlot('striker');
          nextLive.strikerId = null;
        } else if (outId === nextLive.nonStrikerId) {
          setPendingNewBatterSlot('nonStriker');
          nextLive.nonStrikerId = null;
        } else if (outId === live.strikerId) {
          setPendingNewBatterSlot('striker');
          nextLive.strikerId = null;
        } else {
          setPendingNewBatterSlot('nonStriker');
          nextLive.nonStrikerId = null;
        }
        setLive(nextLive);
        await persistSession(
          nextLive,
          'NEXT_BATTER',
          outId,
          balls.length + adjustments.length + retirements.length + 1,
        );
        setPickBatterOpen(true);
        return;
      }

      // End of over -> prompt new bowler.
      if (overJustEnded) {
        nextLive.bowlerId = null;
        setLive(nextLive);
        await persistSession(
          nextLive,
          'NEXT_BOWLER',
          null,
          balls.length + adjustments.length + retirements.length + 1,
        );
        setBowlerOpen(true);
        return;
      }

      setLive(nextLive);
      await persistSession(
        nextLive,
        null,
        null,
        balls.length + adjustments.length + retirements.length + 1,
      );
    },
    [adjustments.length, balls.length, innings, live, loadFromDb, match, persistSession, retirements.length, router, triggerFlash, xiBatting, xiBowling],
  );

  const recordScoreAdjustment = useCallback(
    async (kind: ScoreAdjustmentKind, runs: number) => {
      if (!innings || !live || runs <= 0) return;
      const adjustment = await insertScoreAdjustment({
        inningsId: innings.id,
        kind,
        runs,
      });
      const nextLive = { ...live, totalRuns: live.totalRuns + runs };
      await updateInningsTotals(innings.id, {
        runs: nextLive.totalRuns,
        wickets: nextLive.totalWickets,
        balls: nextLive.legalBalls,
      });
      setAdjustments(prev => [...prev, adjustment]);
      setLive(nextLive);
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
        });
      }
      await persistSession(
        nextLive,
        null,
        null,
        balls.length + adjustments.length + retirements.length + 1,
      );
      triggerFlash(kind === 'PENALTY' ? colors.extra : colors.boundary);

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
        await clearScoringSession(match!.id);
        const step = await closeAndAdvance(match!.id, innings.id);
        if (step.kind === 'COMPLETED') {
          router.replace({
            pathname: '/wricket/match/[id]/scorecard',
            params: { id: match!.id },
          });
        }
        else if (step.kind === 'NEXT_INNINGS' && step.next) {
          await startNextInnings(match!.id, step.next);
          loadFromDb();
        }
      }
    },
    [adjustments.length, balls.length, innings, live, loadFromDb, match, persistSession, retirements.length, router, triggerFlash, xiBatting.length],
  );

  const recordRetirement = useCallback(
    async (kind: 'RETIRED_HURT' | 'RETIRED_OUT', outIsStriker: boolean) => {
      if (!innings || !live?.strikerId || !live.nonStrikerId) return;
      const playerId = outIsStriker ? live.strikerId : live.nonStrikerId;
      const retirement = await insertBatterRetirement({
        inningsId: innings.id,
        playerId,
        kind,
      });
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
      });
      setRetirements(prev => [...prev, retirement]);
      setLive(nextLive);
      const playerCloudId = [...xiBatting, ...xiBowling]
        .find(player => player.userId === playerId)?.cloudId;
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
        });
      }
      setPendingNewBatterSlot(outIsStriker ? 'striker' : 'nonStriker');
      await persistSession(
        nextLive,
        'NEXT_BATTER',
        playerId,
        balls.length + adjustments.length + retirements.length + 1,
      );
      setPickBatterOpen(true);

      const battingSideSize = xiBatting.length || match!.rules.playersPerSide;
      const ended = kind === 'RETIRED_OUT' && nextLive.totalWickets >= battingSideSize - 1;
      if (ended) {
        await clearScoringSession(match!.id);
        const step = await closeAndAdvance(match!.id, innings.id);
        if (step.kind === 'COMPLETED') {
          router.replace({
            pathname: '/wricket/match/[id]/scorecard',
            params: { id: match!.id },
          });
        }
        else if (step.kind === 'NEXT_INNINGS' && step.next) {
          await startNextInnings(match!.id, step.next);
          loadFromDb();
        }
      }
    },
    [adjustments.length, balls.length, innings, live, loadFromDb, match, persistSession, retirements.length, router, xiBatting, xiBowling],
  );

  const onPadAction = useCallback(
    async (a: PadAction) => {
      if (!live?.strikerId || !live?.nonStrikerId || !live?.bowlerId) {
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
        if (!innings) return;
        Alert.alert('Undo last ball?', undefined, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Undo',
            style: 'destructive',
            onPress: async () => {
              const deletedBall = await deleteLastBall(innings.id);
              const deletedBallHasCloudPlayers = deletedBall
                ? [deletedBall.strikerId, deletedBall.nonStrikerId, deletedBall.bowlerId]
                    .every(localId =>
                      [...xiBatting, ...xiBowling]
                        .some(player => player.userId === localId && player.cloudId),
                    )
                : false;
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
                });
              }
              const ballList = await listBalls(innings.id);
              const adjustmentList = await listScoreAdjustments(innings.id);
              const retirementList = await listBatterRetirements(innings.id);
              const state = deriveStateFromBalls(
                ballList,
                adjustmentList,
                retirementList,
              );
              await updateInningsTotals(innings.id, {
                runs: state.totalRuns,
                wickets: state.totalWickets,
                balls: state.legalBalls,
              });
              setBalls(ballList);
              setAdjustments(adjustmentList);
              setRetirements(retirementList);
              setLive(state);
              await persistSession(
                state,
                !state.strikerId || !state.nonStrikerId ? 'NEXT_BATTER' : !state.bowlerId ? 'NEXT_BOWLER' : null,
                null,
                ballList.length + adjustmentList.length + retirementList.length,
              );
              if (!state.bowlerId) setBowlerOpen(true);
            },
          },
        ]);
      }
    },
    [innings, live, match, persistSession, recordBall, xiBatting, xiBowling],
  );

  const endInningsEarly = useCallback(async () => {
    if (!match || !innings) return;
    try {
      await clearScoringSession(match.id);
      const step = await closeAndAdvance(match.id, innings.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (step.kind === 'COMPLETED') {
        router.replace({
          pathname: '/wricket/match/[id]/scorecard',
          params: { id: match.id },
        });
      } else if (step.kind === 'FOLLOW_ON_DECISION') {
        Alert.alert('Follow-on', 'Trail exceeds threshold. Enforce follow-on?', [
          {
            text: 'Decline',
            onPress: async () => {
              const innList = await listInningsForMatch(match.id);
              await startNextInnings(match.id, {
                sequence: 3,
                battingTeamId: innList[0].battingTeamId,
                bowlingTeamId: innList[1].battingTeamId,
              });
              await loadFromDb();
            },
          },
          {
            text: 'Enforce',
            style: 'destructive',
            onPress: async () => {
              const innList = await listInningsForMatch(match.id);
              await startNextInnings(match.id, {
                sequence: 3,
                battingTeamId: innList[1].battingTeamId,
                bowlingTeamId: innList[0].battingTeamId,
                isFollowOn: true,
              });
              await loadFromDb();
            },
          },
        ], { cancelable: false });
      } else if (step.kind === 'NEXT_INNINGS' && step.next) {
        await startNextInnings(match.id, step.next);
        await loadFromDb();
      }
    } catch (cause) {
      Alert.alert(
        'Could not end innings',
        cause instanceof Error ? cause.message : 'Please try again.',
      );
    }
  }, [match, innings, loadFromDb, router]);

  const finishExceptionalMatch = useCallback(async (
    resolution: MatchAbandonmentResolution,
    winnerTeamId?: string,
  ) => {
    if (!match || !innings) return;
    try {
      await clearScoringSession(match.id);
      await resolveAbandonedMatchLifecycle(match.id, innings.id, resolution, winnerTeamId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/wricket/match/[id]/scorecard', params: { id: match.id } });
    } catch (cause) {
      Alert.alert('Could not end match', cause instanceof Error ? cause.message : 'Please try again.');
    }
  }, [innings, match, router]);

  const abandonMatch = useCallback(() => {
    if (!match || !teamA || !teamB) return;
    Alert.alert('End match', 'Choose how this match should be recorded.', [
      {
        text: 'Walkover to?',
        onPress: () => Alert.alert('Walkover to?', 'Select the team that receives the win.', [
          { text: teamA.name, onPress: () => void finishExceptionalMatch('WALKOVER', teamA.id) },
          { text: teamB.name, onPress: () => void finishExceptionalMatch('WALKOVER', teamB.id) },
          { text: 'Back', style: 'cancel' },
        ]),
      },
      { text: 'No Result', onPress: () => void finishExceptionalMatch('NO_RESULT') },
      { text: 'Cancelled', style: 'destructive', onPress: () => void finishExceptionalMatch('CANCELLED') },
    ], { cancelable: true });
  }, [finishExceptionalMatch, match, teamA, teamB]);

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
            <Text tone="muted">Loading match…</Text>
          )}
        </View>
      </Screen>
    );
  }

  const strikerLine = striker ? batsmanLineFor(striker.userId, balls) : null;
  const nonStrikerLine = nonStriker ? batsmanLineFor(nonStriker.userId, balls) : null;
  const bowlerLine = bowler ? bowlerLineFor(bowler.userId, balls) : null;

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Leave scoring" onPress={confirmLeaveScoring}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} />
        </Pressable>
        <Text variant="caption" tone="muted">
          Innings {innings.sequence} · {battingTeam.shortName} batting
        </Text>
        <Pressable onPress={() => setInningsSettingsOpen(true)}>
          <MaterialCommunityIcons name="cog-outline" size={24} color={colors.text} />
        </Pressable>
      </View>

      {isUuid(match.id) && (
        <Pressable
          disabled={cloudSync.status !== 'ERROR'}
          onPress={() => void flushScoringEvents(match.id)}
          style={[
            styles.syncBanner,
            cloudSync.status === 'ERROR' && styles.syncBannerError,
          ]}
        >
          <MaterialCommunityIcons
            name={
              cloudSync.status === 'LIVE'
                ? 'access-point'
                : cloudSync.status === 'ERROR'
                  ? 'cloud-alert-outline'
                  : 'cloud-sync-outline'
            }
            size={18}
            color={cloudSync.status === 'ERROR' ? colors.danger : colors.accent}
          />
          <Text variant="caption" style={{ flex: 1 }}>
            {cloudSync.status === 'LIVE'
              ? 'Live · spectators are up to date'
              : cloudSync.status === 'ERROR'
                ? `${cloudSync.error ?? 'Cloud scoring sync failed'} · ${cloudSync.pending} update${cloudSync.pending === 1 ? '' : 's'} waiting · tap to retry`
                : `${cloudSync.pending} update${cloudSync.pending === 1 ? '' : 's'} ${cloudSync.status === 'SYNCING' ? 'syncing' : 'waiting'}`}
          </Text>
        </Pressable>
      )}

      <View style={styles.scoringWorkspace}>
        <View style={styles.scoreBlock}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, scoreFlashStyle]} />
          <Animated.View key={live.totalRuns + '-' + live.totalWickets} entering={FadeIn.duration(200)}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text variant="scoreXL">{live.totalRuns}</Text>
              <Text variant="scoreLg" tone="muted">/{live.totalWickets}</Text>
            </View>
          </Animated.View>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            {formatOver(live.legalBalls)} overs · CRR {runRate(live.totalRuns, live.legalBalls).toFixed(2)}
            {innings.target ? ` · Need ${Math.max(0, innings.target - live.totalRuns)} off ${Math.max(0, match.rules.oversPerInnings * 6 - live.legalBalls)} balls` : ''}
          </Text>
        </View>

        <View style={styles.scoringContent}>
          <Card>
            <PlayerLine
              name={striker?.name ?? 'Pick striker'}
              marker="●"
              runs={strikerLine?.runs ?? 0}
              balls={strikerLine?.balls ?? 0}
              fours={strikerLine?.fours ?? 0}
              sixes={strikerLine?.sixes ?? 0}
              onPress={() => setOpenersOpen(true)}
            />
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />
            <PlayerLine
              name={nonStriker?.name ?? 'Pick non-striker'}
              marker=""
              runs={nonStrikerLine?.runs ?? 0}
              balls={nonStrikerLine?.balls ?? 0}
              fours={nonStrikerLine?.fours ?? 0}
              sixes={nonStrikerLine?.sixes ?? 0}
              onPress={() => setOpenersOpen(true)}
            />
          </Card>

          <Card>
            <Pressable onPress={() => setBowlerOpen(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text variant="overline" tone="dim">BOWLING</Text>
                <Text variant="bodyStrong" style={{ marginTop: 2 }}>
                  {bowler?.name ?? 'Pick bowler'}
                </Text>
              </View>
              {bowlerLine && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="bodyStrong">
                    {bowlerLine.wickets}/{bowlerLine.runsConceded}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {bowlerLine.oversText} · Econ {bowlerLine.economy.toFixed(1)}
                  </Text>
                </View>
              )}
            </Pressable>
          </Card>

          <ThisOver balls={thisOverBalls} />

          <View style={styles.inputDeck}>
            <View style={styles.quickActionRail}>
              <QuickScoreButton
                label="Wide"
                icon="alpha-w-circle-outline"
                onPress={() => recordBall({ runs: 0, extra: 'WIDE', isWicket: false })}
              />
              <QuickScoreButton
                label="No ball"
                icon="alpha-n-circle-outline"
                onPress={() => recordBall({ runs: 0, extra: 'NO_BALL', isWicket: false })}
              />
              <QuickScoreButton
                label="Extras"
                icon="plus-circle-outline"
                onPress={() => setExtraOpen(true)}
              />
              <QuickScoreButton
                label="Undo"
                icon="undo-variant"
                variant="ghost"
                onPress={() => onPadAction({ kind: 'UNDO' })}
              />
            </View>
            <View style={styles.padFrame}>
              <GesturePad onAction={onPadAction} />
            </View>
          </View>

          {adjustments.length > 0 && (
            <Text variant="caption" tone="dim" style={styles.adjustmentLabel}>
              Adjustments +{totalAdjustmentRuns(adjustments)}
            </Text>
          )}
        </View>
      </View>

      <InningsSettingsPage
        visible={inningsSettingsOpen}
        inningsNumber={innings.sequence}
        battingTeamName={battingTeam.name}
        onClose={() => setInningsSettingsOpen(false)}
        onAdjustment={() => {
          setInningsSettingsOpen(false);
          setTimeout(() => setAdjustmentOpen(true), 250);
        }}
        onRetirement={() => {
          setInningsSettingsOpen(false);
          setTimeout(() => setRetirementOpen(true), 250);
        }}
        onEndInnings={() => {
          setInningsSettingsOpen(false);
          setTimeout(endInningsEarly, 250);
        }}
        onAbandon={() => {
          setInningsSettingsOpen(false);
          setTimeout(abandonMatch, 250);
        }}
        onScorecard={() => {
          setInningsSettingsOpen(false);
          router.push({
            pathname: '/wricket/match/[id]/scorecard',
            params: { id: match.id },
          });
        }}
      />

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
        visible={wicketOpen}
        onClose={() => setWicketOpen(false)}
        striker={striker?.name ?? '?'}
        nonStriker={nonStriker?.name ?? '?'}
        fielders={xiBowling}
        onConfirm={async ({ kind, outIsStriker, fielderId, assistantFielderId }) => {
          setWicketOpen(false);
          const outPlayerId = outIsStriker ? live.strikerId! : live.nonStrikerId!;
          await recordBall({
            runs: 0,
            extra: null,
            isWicket: true,
            dismissalKind: kind,
            outPlayerId,
            fielderId,
            assistantFielderId,
          });
        }}
      />

      <ScoreAdjustmentSheet
        visible={adjustmentOpen}
        onClose={() => setAdjustmentOpen(false)}
        onConfirm={async ({ kind, runs }) => {
          setAdjustmentOpen(false);
          await recordScoreAdjustment(kind, runs);
        }}
      />

      <RetirementSheet
        visible={retirementOpen}
        onClose={() => setRetirementOpen(false)}
        striker={striker?.name ?? '?'}
        nonStriker={nonStriker?.name ?? '?'}
        onConfirm={async ({ kind, outIsStriker }) => {
          setRetirementOpen(false);
          await recordRetirement(kind, outIsStriker);
        }}
      />

      <ExtrasSheet
        visible={extraOpen}
        onClose={() => setExtraOpen(false)}
        onConfirm={async ({ kind, runs }) => {
          setExtraOpen(false);
          await recordBall({ runs, extra: kind, isWicket: false });
        }}
      />
    </Screen>
  );
}

function totalAdjustmentRuns(items: ScoreAdjustment[]): number {
  return items.reduce((sum, item) => sum + item.runs, 0);
}

function PlayerLine({
  name, marker, runs, balls, fours, sixes, onPress,
}: {
  name: string; marker: string; runs: number; balls: number; fours: number; sixes: number; onPress?: () => void;
}) {
  const sr = balls > 0 ? ((runs / balls) * 100).toFixed(0) : '—';
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text variant="bodyStrong" style={{ width: 18 }}>{marker}</Text>
      <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{name}</Text>
      <Text variant="bodyStrong">{runs}</Text>
      <Text variant="caption" tone="muted" style={{ marginLeft: spacing.sm }}>({balls})</Text>
      <Text variant="caption" tone="dim" style={{ marginLeft: spacing.sm, width: 36, textAlign: 'right' }}>
        SR {sr}
      </Text>
    </Pressable>
  );
}

function InningsSettingsPage({
  visible,
  inningsNumber,
  battingTeamName,
  onClose,
  onAdjustment,
  onRetirement,
  onEndInnings,
  onAbandon,
  onScorecard,
}: {
  visible: boolean;
  inningsNumber: number;
  battingTeamName: string;
  onClose: () => void;
  onAdjustment: () => void;
  onRetirement: () => void;
  onEndInnings: () => void;
  onAbandon: () => void;
  onScorecard: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <Screen padded={false}>
        <View style={styles.settingsHeader}>
          <Pressable onPress={onClose} style={styles.settingsClose}>
            <MaterialCommunityIcons name="close" size={26} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="overline" tone="muted">INNINGS {inningsNumber}</Text>
            <Text variant="h2">Innings settings</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.settingsContent}>
          <Text variant="body" tone="muted">
            Manage exceptional scoring actions for {battingTeamName}. Regular deliveries stay on the scoring pad.
          </Text>

          <Card>
            <Text variant="h3">Score corrections</Text>
            <Text variant="caption" tone="muted" style={styles.settingsDescription}>
              Add umpire penalties or manual bonus runs without recording a delivery.
            </Text>
            <Button title="Penalty / bonus runs" variant="secondary" onPress={onAdjustment} fullWidth />
          </Card>

          <Card>
            <Text variant="h3">Batter status</Text>
            <Text variant="caption" tone="muted" style={styles.settingsDescription}>
              Mark the striker or non-striker as retired hurt or retired out.
            </Text>
            <Button title="Retire batter" variant="secondary" onPress={onRetirement} fullWidth />
          </Card>

          <Card>
            <Text variant="h3">Innings control</Text>
            <Text variant="caption" tone="muted" style={styles.settingsDescription}>
              Review the scorecard or close the current innings before its automatic limit.
            </Text>
            <View style={{ gap: spacing.sm }}>
              <Button title="View scorecard" variant="secondary" onPress={onScorecard} fullWidth />
              <Button title="End innings" variant="danger" onPress={onEndInnings} fullWidth />
            </View>
          </Card>

          <Card>
            <Text variant="h3">Match control</Text>
            <Text variant="caption" tone="muted" style={styles.settingsDescription}>
              End the match by walkover, no result, or cancellation. This cannot be undone.
            </Text>
            <Button title="Abandon match" variant="danger" onPress={onAbandon} fullWidth />
          </Card>
        </ScrollView>
      </Screen>
    </Modal>
  );
}

function QuickScoreButton({
  label,
  icon,
  onPress,
  variant = 'extra',
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  variant?: 'extra' | 'ghost';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        variant === 'ghost' && styles.quickActionGhost,
        pressed && styles.quickActionPressed,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={variant === 'ghost' ? colors.textMuted : colors.extra}
      />
      <Text variant="caption" style={styles.quickActionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ThisOver({ balls }: { balls: Ball[] }) {
  const visibleBalls = balls.slice(-8);
  return (
    <View style={styles.thisOver}>
      <View style={styles.thisOverHeader}>
        <Text variant="overline" tone="dim">THIS OVER</Text>
        {balls.length > visibleBalls.length && (
          <Text variant="caption" tone="dim">+{balls.length - visibleBalls.length} earlier</Text>
        )}
      </View>
      <View style={styles.thisOverBalls}>
        {balls.length === 0 && (
          <Text variant="caption" tone="dim">No balls yet</Text>
        )}
        {visibleBalls.map((b, i) => (
          <Animated.View
            key={b.id}
            entering={ZoomIn.delay(i * 30).duration(200)}
            style={[
              styles.ballChip,
              b.isWicket && { backgroundColor: colors.wicket },
              !b.isWicket && b.runsBat === 4 && { backgroundColor: colors.boundary },
              !b.isWicket && b.runsBat === 6 && { backgroundColor: colors.six },
              !b.isLegal && !b.isWicket && b.runsBat < 4 && styles.ballChipExtra,
            ]}
          >
            <Text
              variant="caption"
              style={{
                color: (b.isWicket || b.runsBat === 4 || b.runsBat === 6)
                  ? palette.black
                  : colors.text,
                fontWeight: '700',
              }}
            >
              {ballSymbol(b)}
            </Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
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

function WicketSheet({
  visible, onClose, striker, nonStriker, fielders, onConfirm,
}: {
  visible: boolean; onClose: () => void; striker: string; nonStriker: string;
  fielders: MatchXIPlayer[];
  onConfirm: (e: {
    kind: DismissalKind;
    outIsStriker: boolean;
    fielderId?: string;
    assistantFielderId?: string;
  }) => void;
}) {
  const [kind, setKind] = useState<DismissalKind>('BOWLED');
  const [outIsStriker, setOutIsStriker] = useState(true);
  const [fielderId, setFielderId] = useState<string | undefined>();
  const [assistantFielderId, setAssistantFielderId] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) return;
    setKind('BOWLED');
    setOutIsStriker(true);
    setFielderId(undefined);
    setAssistantFielderId(undefined);
  }, [visible]);

  const selectKind = (nextKind: DismissalKind) => {
    setKind(nextKind);
    setFielderId(undefined);
    setAssistantFielderId(undefined);
  };
  const needsFielder = kind === 'CAUGHT' || kind === 'STUMPED' || kind === 'RUN_OUT';
  const canSubmit = !needsFielder || (
    Boolean(fielderId) &&
    (kind !== 'RUN_OUT' || Boolean(assistantFielderId))
  );
  const fielderLabel = kind === 'CAUGHT'
    ? 'CAUGHT BY'
    : kind === 'STUMPED'
      ? 'STUMPED BY'
      : 'RUN OUT BY / WICKET BROKEN BY';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHeader}>
            <Text variant="h2">Wicket</Text>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>HOW OUT?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
            {(['BOWLED', 'CAUGHT', 'LBW', 'RUN_OUT', 'STUMPED', 'HIT_WICKET', 'RETIRED_OUT'] as DismissalKind[]).map(k => (
              <Pressable key={k} onPress={() => selectKind(k)} style={[styles.chip, kind === k && styles.chipActive]}>
                <Text variant="bodyStrong" style={kind === k ? { color: colors.accentInk } : undefined}>
                  {labelFor(k)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>WHO IS OUT?</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            <Pressable onPress={() => setOutIsStriker(true)} style={[styles.chip, { flex: 1 }, outIsStriker && styles.chipActive]}>
              <Text variant="bodyStrong" style={outIsStriker ? { color: colors.accentInk } : undefined}>
                {striker} (striker)
              </Text>
            </Pressable>
            <Pressable onPress={() => setOutIsStriker(false)} style={[styles.chip, { flex: 1 }, !outIsStriker && styles.chipActive]}>
              <Text variant="bodyStrong" style={!outIsStriker ? { color: colors.accentInk } : undefined}>
                {nonStriker}
              </Text>
            </Pressable>
          </View>

          {needsFielder && (
            <>
              <FielderPicker
                label={fielderLabel}
                players={fielders}
                selectedId={fielderId}
                onSelect={setFielderId}
              />
              {kind === 'RUN_OUT' && (
                <FielderPicker
                  label="THROWER / ASSIST (USE SAME PLAYER FOR DIRECT HIT)"
                  players={fielders}
                  selectedId={assistantFielderId}
                  onSelect={setAssistantFielderId}
                />
              )}
            </>
          )}

          <Button
            title="Record wicket"
            variant="danger"
            disabled={!canSubmit}
            onPress={() => onConfirm({ kind, outIsStriker, fielderId, assistantFielderId })}
            fullWidth
            size="lg"
          />
        </View>
      </View>
    </Modal>
  );
}

function FielderPicker({
  label,
  players,
  selectedId,
  onSelect,
}: {
  label: string;
  players: MatchXIPlayer[];
  selectedId?: string;
  onSelect: (playerId: string | undefined) => void;
}) {
  return (
    <View style={styles.fielderPicker}>
      <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.fielderOptions}
      >
        {players.map(player => {
            const selected = player.userId === selectedId;
            return (
              <Pressable
                key={player.userId}
                onPress={() => onSelect(selected ? undefined : player.userId)}
                style={[styles.fielderOption, selected && styles.chipActive]}
              >
                <Text
                  variant="bodyStrong"
                  style={selected ? { color: colors.accentInk } : undefined}
                  numberOfLines={1}
                >
                  {player.name}
                </Text>
              </Pressable>
            );
          })}
      </ScrollView>
    </View>
  );
}

function labelFor(k: DismissalKind) {
  return { BOWLED: 'Bowled', CAUGHT: 'Caught', LBW: 'LBW', RUN_OUT: 'Run out', STUMPED: 'Stumped', HIT_WICKET: 'Hit wicket', RETIRED_OUT: 'Retired out' }[k];
}

function ScoreAdjustmentSheet({
  visible, onClose, onConfirm,
}: {
  visible: boolean; onClose: () => void;
  onConfirm: (e: { kind: ScoreAdjustmentKind; runs: number }) => void;
}) {
  const [kind, setKind] = useState<ScoreAdjustmentKind>('PENALTY');
  const [runs, setRuns] = useState(5);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHeader}>
            <Text variant="h2">Penalty / bonus</Text>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>TYPE</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            {(['PENALTY', 'BONUS'] as const).map(k => (
              <Pressable key={k} onPress={() => setKind(k)} style={[styles.chip, kind === k && styles.chipActive]}>
                <Text variant="bodyStrong" style={kind === k ? { color: colors.accentInk } : undefined}>
                  {k === 'PENALTY' ? 'Penalty' : 'Bonus'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>RUNS</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            {[1, 2, 3, 4, 5, 6].map(r => (
              <Pressable key={r} onPress={() => setRuns(r)} style={[styles.runChip, runs === r && styles.runChipActive]}>
                <Text variant="bodyStrong" style={runs === r ? { color: colors.accentInk } : undefined}>{r}</Text>
              </Pressable>
            ))}
          </View>

          <Button title="Add runs" onPress={() => onConfirm({ kind, runs })} fullWidth size="lg" />
        </View>
      </View>
    </Modal>
  );
}

function RetirementSheet({
  visible, onClose, striker, nonStriker, onConfirm,
}: {
  visible: boolean; onClose: () => void; striker: string; nonStriker: string;
  onConfirm: (e: { kind: 'RETIRED_HURT' | 'RETIRED_OUT'; outIsStriker: boolean }) => void;
}) {
  const [kind, setKind] = useState<'RETIRED_HURT' | 'RETIRED_OUT'>('RETIRED_HURT');
  const [outIsStriker, setOutIsStriker] = useState(true);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHeader}>
            <Text variant="h2">Retire batter</Text>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>TYPE</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            <Pressable onPress={() => setKind('RETIRED_HURT')} style={[styles.chip, { flex: 1 }, kind === 'RETIRED_HURT' && styles.chipActive]}>
              <Text variant="bodyStrong" style={kind === 'RETIRED_HURT' ? { color: colors.accentInk } : undefined}>Retired hurt</Text>
            </Pressable>
            <Pressable onPress={() => setKind('RETIRED_OUT')} style={[styles.chip, { flex: 1 }, kind === 'RETIRED_OUT' && styles.chipActive]}>
              <Text variant="bodyStrong" style={kind === 'RETIRED_OUT' ? { color: colors.accentInk } : undefined}>Retired out</Text>
            </Pressable>
          </View>

          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>WHO?</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            <Pressable onPress={() => setOutIsStriker(true)} style={[styles.chip, { flex: 1 }, outIsStriker && styles.chipActive]}>
              <Text variant="bodyStrong" style={outIsStriker ? { color: colors.accentInk } : undefined}>{striker}</Text>
            </Pressable>
            <Pressable onPress={() => setOutIsStriker(false)} style={[styles.chip, { flex: 1 }, !outIsStriker && styles.chipActive]}>
              <Text variant="bodyStrong" style={!outIsStriker ? { color: colors.accentInk } : undefined}>{nonStriker}</Text>
            </Pressable>
          </View>

          <Button title="Confirm retirement" onPress={() => onConfirm({ kind, outIsStriker })} fullWidth size="lg" />
        </View>
      </View>
    </Modal>
  );
}

function ExtrasSheet({
  visible, onClose, onConfirm,
}: {
  visible: boolean; onClose: () => void;
  onConfirm: (e: { kind: NonNullable<ExtraKind>; runs: number }) => void;
}) {
  const [kind, setKind] = useState<NonNullable<ExtraKind>>('WIDE');
  const [runs, setRuns] = useState(0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHeader}>
            <Text variant="h2">Extras</Text>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>TYPE</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
            {(['WIDE', 'NO_BALL', 'BYE', 'LEG_BYE'] as const).map(k => (
              <Pressable key={k} onPress={() => setKind(k)} style={[styles.chip, kind === k && styles.chipActive]}>
                <Text variant="bodyStrong" style={kind === k ? { color: colors.accentInk } : undefined}>
                  {k === 'NO_BALL' ? 'No ball' : k === 'LEG_BYE' ? 'Leg bye' : k === 'WIDE' ? 'Wide' : 'Bye'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>RUNS</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            {[0, 1, 2, 3, 4, 6].map(r => (
              <Pressable key={r} onPress={() => setRuns(r)} style={[styles.runChip, runs === r && styles.runChipActive]}>
                <Text variant="bodyStrong" style={runs === r ? { color: colors.accentInk } : undefined}>{r}</Text>
              </Pressable>
            ))}
          </View>

          <Button title="Record" onPress={() => onConfirm({ kind, runs })} fullWidth size="lg" />
        </View>
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
    minHeight: 38,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceElevated,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoringWorkspace: {
    flex: 1,
    minHeight: 0,
  },
  scoringContent: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  scoreBlock: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
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
