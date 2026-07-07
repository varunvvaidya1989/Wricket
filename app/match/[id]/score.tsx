import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  BackHandler,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { GesturePad, PadAction } from '@/components/scoring/GesturePad';
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
  MatchXIPlayer,
} from '@/lib/db/repo';
import { closeAndAdvance, startNextInnings } from '@/lib/domain/innings-flow';
import {
  Ball,
  DismissalKind,
  ExtraKind,
  Innings,
  Match,
  Team,
} from '@/lib/domain/types';
import { applyBall, formatOver, isInningsOver, runRate } from '@/lib/domain/scoring';
import { ballSymbol, batsmanLineFor, bowlerLineFor } from '@/lib/domain/stats';

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

function deriveStateFromBalls(ballList: Ball[]): LiveState {
  if (ballList.length === 0) {
    return {
      totalRuns: 0, totalWickets: 0, legalBalls: 0,
      overNo: 0, legalBallInOver: 0,
      strikerId: null, nonStrikerId: null, bowlerId: null,
    };
  }
  let totalRuns = 0, totalWickets = 0, legalBalls = 0;
  let overNo = 0, legalBallInOver = 0;
  let strikerId: string | null = null;
  let nonStrikerId: string | null = null;
  let bowlerId: string | null = null;

  for (const b of ballList) {
    strikerId = b.strikerId;
    nonStrikerId = b.nonStrikerId;
    bowlerId = b.bowlerId;

    totalRuns += b.runsBat + b.runsExtra;
    totalWickets += b.isWicket ? 1 : 0;
    if (b.isLegal) {
      legalBalls += 1;
      legalBallInOver = b.legalBallInOver;
    }

    let physical: number;
    if (b.extraKind === 'WIDE') physical = b.runsExtra - 1;
    else if (b.extraKind === 'NO_BALL') physical = b.runsBat;
    else if (b.extraKind === 'BYE' || b.extraKind === 'LEG_BYE') physical = b.runsExtra;
    else physical = b.runsBat;

    if (physical % 2 === 1) {
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
    }

    const overComplete = b.isLegal && b.legalBallInOver === 6;
    if (overComplete) {
      overNo += 1;
      legalBallInOver = 0;
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      bowlerId = null;
    }
  }

  return { totalRuns, totalWickets, legalBalls, overNo, legalBallInOver, strikerId, nonStrikerId, bowlerId };
}

export default function ScoreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [match, setMatch] = useState<Match | null>(null);
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  const [innings, setInnings] = useState<Innings | null>(null);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [xiBatting, setXiBatting] = useState<MatchXIPlayer[]>([]);
  const [xiBowling, setXiBowling] = useState<MatchXIPlayer[]>([]);
  const [live, setLive] = useState<LiveState | null>(null);

  // sheets
  const [openersOpen, setOpenersOpen] = useState(false);
  const [bowlerOpen, setBowlerOpen] = useState(false);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [pickBatterOpen, setPickBatterOpen] = useState(false);
  const [pendingNewBatterSlot, setPendingNewBatterSlot] = useState<'striker' | 'nonStriker' | null>(null);

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
    if (!id) return;
    const m = await getMatch(id);
    if (!m) return;
    setMatch(m);

    const [a, b] = await Promise.all([getTeam(m.teamAId), getTeam(m.teamBId)]);
    setTeamA(a);
    setTeamB(b);

    const innList = await listInningsForMatch(m.id);
    const open = innList.find(i => !i.isClosed);
    if (!open) {
      router.replace(`/match/${m.id}/scorecard`);
      return;
    }
    setInnings(open);

    const ballList = await listBalls(open.id);
    setBalls(ballList);

    const xiBatList = await getMatchXI(m.id, open.battingTeamId);
    const xiBowlList = await getMatchXI(m.id, open.bowlingTeamId);
    setXiBatting(xiBatList);
    setXiBowling(xiBowlList);

    const state = deriveStateFromBalls(ballList);
    setLive(state);

    if (ballList.length === 0) {
      if (!state.strikerId || !state.nonStrikerId) setOpenersOpen(true);
      else if (!state.bowlerId) setBowlerOpen(true);
    } else if (!state.bowlerId) {
      setBowlerOpen(true);
    }
  }, [id, router]);

  useEffect(() => { loadFromDb(); }, [loadFromDb]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Leave scoring?', 'You can return from the Live tab.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', onPress: () => router.back() },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [router]);

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
      });
      await updateInningsTotals(innings.id, {
        runs: result.next.totalRuns,
        wickets: result.next.totalWickets,
        balls: result.next.legalBalls,
      });

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
        match!.rules.playersPerSide,
        innings.target,
      );
      if (ended) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const step = await closeAndAdvance(match!.id, innings.id);
        if (step.kind === 'COMPLETED') {
          router.replace(`/match/${match!.id}/scorecard`);
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
      if (event.isWicket) {
        const outId = event.outPlayerId ?? live.strikerId;
        if (outId === live.strikerId) {
          setPendingNewBatterSlot('striker');
          nextLive.strikerId = null;
        } else {
          setPendingNewBatterSlot('nonStriker');
          nextLive.nonStrikerId = null;
        }
        setLive(nextLive);
        setPickBatterOpen(true);
        return;
      }

      // End of over → prompt new bowler (bowlerId already null from applyBall)
      const overJustEnded = result.next.overNo > live.overNo;
      if (overJustEnded) {
        nextLive.bowlerId = null;
        setLive(nextLive);
        setBowlerOpen(true);
        return;
      }

      setLive(nextLive);
    },
    [innings, live, match, loadFromDb, router, triggerFlash],
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
      } else if (a.kind === 'EXTRA') {
        setExtraOpen(true);
      } else if (a.kind === 'UNDO') {
        if (!innings) return;
        Alert.alert('Undo last ball?', undefined, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Undo',
            style: 'destructive',
            onPress: async () => {
              await deleteLastBall(innings.id);
              const ballList = await listBalls(innings.id);
              const state = deriveStateFromBalls(ballList);
              await updateInningsTotals(innings.id, {
                runs: state.totalRuns,
                wickets: state.totalWickets,
                balls: state.legalBalls,
              });
              setBalls(ballList);
              setLive(state);
              if (!state.bowlerId) setBowlerOpen(true);
            },
          },
        ]);
      }
    },
    [live, recordBall, innings],
  );

  const endInningsEarly = useCallback(() => {
    if (!match || !innings) return;
    Alert.alert('End innings?', 'Are you sure you want to end this innings now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End innings',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const step = await closeAndAdvance(match.id, innings.id);
          if (step.kind === 'COMPLETED') {
            router.replace(`/match/${match.id}/scorecard`);
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
                  loadFromDb();
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
                  loadFromDb();
                },
              },
            ], { cancelable: false });
          } else if (step.kind === 'NEXT_INNINGS' && step.next) {
            await startNextInnings(match.id, step.next);
            loadFromDb();
          }
        },
      },
    ]);
  }, [match, innings, loadFromDb, router]);

  const abandonMatch = useCallback(() => {
    if (!match) return;
    Alert.alert('Abandon match?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Abandon',
        style: 'destructive',
        onPress: async () => {
          const { setMatchResult } = await import('@/lib/db/repo');
          await setMatchResult(match.id, { kind: 'NO_RESULT' });
          router.replace(`/match/${match.id}/scorecard`);
        },
      },
    ]);
  }, [match, router]);

  if (!match || !innings || !live || !battingTeam || !bowlingTeam) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text tone="muted">Loading match…</Text>
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
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} />
        </Pressable>
        <Text variant="caption" tone="muted">
          Innings {innings.sequence} · {battingTeam.shortName} batting
        </Text>
        <Pressable
          onPress={() =>
            Alert.alert('Match options', undefined, [
              { text: 'End innings', onPress: endInningsEarly },
              { text: 'Abandon match', style: 'destructive', onPress: abandonMatch },
              { text: 'View scorecard', onPress: () => router.push(`/match/${match.id}/scorecard`) },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
        >
          <MaterialCommunityIcons name="dots-vertical" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
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

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
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

          <GesturePad onAction={onPadAction} />

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button title="Wide" variant="secondary" size="sm" onPress={() => recordBall({ runs: 0, extra: 'WIDE', isWicket: false })} style={{ flex: 1 }} />
            <Button title="No ball" variant="secondary" size="sm" onPress={() => recordBall({ runs: 0, extra: 'NO_BALL', isWicket: false })} style={{ flex: 1 }} />
            <Button title="Bye" variant="secondary" size="sm" onPress={() => setExtraOpen(true)} style={{ flex: 1 }} />
            <Button title="Undo" variant="ghost" size="sm" onPress={() => onPadAction({ kind: 'UNDO' })} style={{ flex: 1 }} />
          </View>
        </View>
      </ScrollView>

      <PickPlayersSheet
        visible={openersOpen}
        title="Select openers"
        players={xiBatting}
        currentIds={[live.strikerId, live.nonStrikerId].filter(Boolean) as string[]}
        slots={['Striker', 'Non-striker']}
        onClose={() => setOpenersOpen(false)}
        onConfirm={([s, ns]) => {
          setOpenersOpen(false);
          setLive(prev => prev ? { ...prev, strikerId: s, nonStrikerId: ns } : prev);
          if (!live.bowlerId) setTimeout(() => setBowlerOpen(true), 350);
        }}
      />

      <PickPlayersSheet
        visible={bowlerOpen}
        title="Select bowler"
        players={xiBowling}
        currentIds={[live.bowlerId].filter(Boolean) as string[]}
        slots={['Bowler']}
        onClose={() => setBowlerOpen(false)}
        onConfirm={([b]) => {
          setBowlerOpen(false);
          setLive(prev => prev ? { ...prev, bowlerId: b } : prev);
        }}
      />

      <PickPlayersSheet
        visible={pickBatterOpen}
        title="Next batter"
        players={xiBatting.filter(
          p =>
            p.userId !== live.strikerId &&
            p.userId !== live.nonStrikerId &&
            !balls.some(b => b.isWicket && b.dismissal?.outPlayerId === p.userId),
        )}
        currentIds={[]}
        slots={['Batter']}
        onClose={() => setPickBatterOpen(false)}
        onConfirm={([userId]) => {
          setPickBatterOpen(false);
          setLive(prev => {
            if (!prev) return prev;
            if (pendingNewBatterSlot === 'striker') return { ...prev, strikerId: userId };
            if (pendingNewBatterSlot === 'nonStriker') return { ...prev, nonStrikerId: userId };
            return prev;
          });
          setPendingNewBatterSlot(null);
        }}
      />

      <WicketSheet
        visible={wicketOpen}
        onClose={() => setWicketOpen(false)}
        striker={striker?.name ?? '?'}
        nonStriker={nonStriker?.name ?? '?'}
        onConfirm={async ({ kind, outIsStriker }) => {
          setWicketOpen(false);
          const outPlayerId = outIsStriker ? live.strikerId! : live.nonStrikerId!;
          await recordBall({ runs: 0, extra: null, isWicket: true, dismissalKind: kind, outPlayerId });
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

function ThisOver({ balls }: { balls: Ball[] }) {
  return (
    <View style={styles.thisOver}>
      <Text variant="overline" tone="dim" style={{ marginBottom: spacing.sm }}>THIS OVER</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {balls.length === 0 && (
          <Text variant="caption" tone="dim">No balls yet</Text>
        )}
        {balls.map((b, i) => (
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
  visible, onClose, striker, nonStriker, onConfirm,
}: {
  visible: boolean; onClose: () => void; striker: string; nonStriker: string;
  onConfirm: (e: { kind: DismissalKind; outIsStriker: boolean }) => void;
}) {
  const [kind, setKind] = useState<DismissalKind>('BOWLED');
  const [outIsStriker, setOutIsStriker] = useState(true);

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
            {(['BOWLED', 'CAUGHT', 'LBW', 'RUN_OUT', 'STUMPED'] as DismissalKind[]).map(k => (
              <Pressable key={k} onPress={() => setKind(k)} style={[styles.chip, kind === k && styles.chipActive]}>
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

          <Button title="Record wicket" variant="danger" onPress={() => onConfirm({ kind, outIsStriker })} fullWidth size="lg" />
        </View>
      </View>
    </Modal>
  );
}

function labelFor(k: DismissalKind) {
  return { BOWLED: 'Bowled', CAUGHT: 'Caught', LBW: 'LBW', RUN_OUT: 'Run out', STUMPED: 'Stumped', HIT_WICKET: 'Hit wicket', RETIRED: 'Retired' }[k];
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoreBlock: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    overflow: 'hidden',
  },
  thisOver: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ballChip: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: 16,
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
