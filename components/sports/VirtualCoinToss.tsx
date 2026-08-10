import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import {
  flipCoin,
  type CoinSide,
  type CoinTossParticipant,
  type CoinTossResult,
} from '@/lib/sports/toss';
import { colors, palette } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { createCoinFlipSoundUri } from '@/lib/sports/coinFlipSound';

export interface VirtualCoinTossParticipant extends CoinTossParticipant {
  /** Short code shown inside the caller swatch, e.g. a team code. */
  shortName?: string;
  /** Accent used for the caller swatch and the winner banner. */
  color?: string;
}

const COIN_SIZE = 132;
const FLIP_DURATION_MS = 2100;
const FULL_SPINS = 6;
const TOSS_HEIGHT = 78;

// Resting rotateX for each face of the SportStage coin. Heads is the front
// face, tails is pre-rotated 180° so a half-turn of the coin reveals it.
const REST_DEGREES: Record<CoinSide, number> = { HEADS: 0, TAILS: 180 };

// The rotation value never exceeds rest(180) + FULL_SPINS + one padding turn.
// The lighting interpolation needs explicit stops across that whole range:
// faces read fully lit when flat (multiples of 180°) and in shadow edge-on.
const MAX_ROTATION_DEG = 180 + (FULL_SPINS + 1) * 360;
const SHADE_STOPS = Array.from({ length: MAX_ROTATION_DEG / 90 + 1 }, (_, i) => i * 90);

const FACE_ART: Record<CoinSide, {
  background: string;
  rim: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = {
  HEADS: { background: palette.pitch, rim: palette.pitchDeep, icon: 'stadium' },
  TAILS: { background: palette.willow, rim: '#B8934C', icon: 'cricket' },
};

export function VirtualCoinToss({
  participants,
  onResult,
  onReset,
}: {
  participants: readonly [VirtualCoinTossParticipant, VirtualCoinTossParticipant];
  onResult: (result: CoinTossResult) => void;
  onReset?: () => void;
}) {
  const [callerId, setCallerId] = useState<string>();
  const [calledSide, setCalledSide] = useState<CoinSide>();
  const [result, setResult] = useState<CoinTossResult>();
  const [flipping, setFlipping] = useState(false);
  const coinSoundUri = useMemo(createCoinFlipSoundUri, []);
  const coinSound = useAudioPlayer(coinSoundUri);

  // rotation holds rotateX in degrees; lift drives the toss arc and shadow.
  const rotation = useRef(new Animated.Value(REST_DEGREES.HEADS)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const restDeg = useRef(REST_DEGREES.HEADS);

  const clearResult = () => {
    if (!result) return;
    setResult(undefined);
    reveal.setValue(0);
    onReset?.();
  };

  const pickCaller = (id: string) => {
    if (flipping) return;
    setCallerId(id);
    clearResult();
  };

  const pickSide = (side: CoinSide) => {
    if (flipping) return;
    setCalledSide(side);
    clearResult();
    // Preview the called face with a gentle half-flip.
    Animated.spring(rotation, {
      toValue: REST_DEGREES[side],
      friction: 8,
      tension: 50,
      useNativeDriver: true,
    }).start();
    restDeg.current = REST_DEGREES[side];
  };

  const runFlip = () => {
    if (!callerId || !calledSide || flipping) return;
    const outcome = flipCoin({ participants, callerId, calledSide });
    setFlipping(true);
    clearResult();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void coinSound.seekTo(0).then(() => coinSound.play()).catch(() => undefined);

    // Spin a fixed number of full turns, then pad the target so the coin
    // settles exactly on the face the engine landed.
    const from = restDeg.current;
    let target = from + FULL_SPINS * 360;
    target += (REST_DEGREES[outcome.landedSide] - (target % 360) + 360) % 360;

    Animated.parallel([
      Animated.timing(rotation, {
        toValue: target,
        duration: FLIP_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(lift, {
          toValue: 1,
          duration: FLIP_DURATION_MS * 0.42,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(lift, {
          toValue: 0,
          duration: FLIP_DURATION_MS * 0.58,
          easing: Easing.bounce,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      rotation.setValue(REST_DEGREES[outcome.landedSide]);
      restDeg.current = REST_DEGREES[outcome.landedSide];
      setFlipping(false);
      setResult(outcome);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.spring(reveal, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }).start();
      onResult(outcome);
    });
  };

  const caller = participants.find(participant => participant.id === callerId);
  const winner = participants.find(participant => participant.id === result?.winnerId);

  const rotateX = rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -TOSS_HEIGHT] });
  const coinScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  // A slight off-axis tilt while airborne makes the flip read as a tumble
  // instead of a flat card rotation.
  const tumble = lift.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '10deg'] });
  const shadowScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] });
  const shadowOpacity = lift.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.18] });
  // Rotation-synced lighting: the visible face darkens as the coin turns
  // edge-on and brightens as it flattens toward the viewer.
  const shadeOpacity = rotation.interpolate({
    inputRange: SHADE_STOPS,
    outputRange: SHADE_STOPS.map(deg => (deg % 180 === 0 ? 0 : 0.42)),
    extrapolate: 'clamp',
  });

  return (
    <Card>
      <Text variant="h3">Coin toss</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
        Pick who calls and their side, then flip the SportStage coin.
      </Text>

      <Text variant="caption" tone="muted" style={styles.label}>CALLER</Text>
      <View style={styles.choices}>
        {participants.map(participant => (
          <CallerChip
            key={participant.id}
            participant={participant}
            selected={callerId === participant.id}
            dimmed={flipping}
            onPress={() => pickCaller(participant.id)}
          />
        ))}
      </View>

      <Text variant="caption" tone="muted" style={styles.label}>THE CALL</Text>
      <View style={styles.choices}>
        {(['HEADS', 'TAILS'] as const).map(side => (
          <SideChip
            key={side}
            side={side}
            selected={calledSide === side}
            dimmed={flipping}
            onPress={() => pickSide(side)}
          />
        ))}
      </View>

      <View style={styles.stage}>
        <Text variant="overline" tone="dim" style={styles.stageBrand}>
          SPORTSTAGE · MATCH COIN
        </Text>
        <Animated.View
          style={[styles.coinShadow, { opacity: shadowOpacity, transform: [{ scaleX: shadowScale }] }]}
        />
        <Animated.View
          accessibilityLabel={
            result ? `Coin landed ${result.landedSide.toLowerCase()}` : 'SportStage match coin'
          }
          style={[
            styles.coin,
            {
              transform: [
                { perspective: 650 },
                { translateY },
                { scale: coinScale },
                { rotateZ: tumble },
                { rotateX },
              ],
            },
          ]}
        >
          <CoinFace side="HEADS" />
          <CoinFace side="TAILS" back />
          <Animated.View pointerEvents="none" style={[styles.coinShade, { opacity: shadeOpacity }]} />
        </Animated.View>
      </View>

      <Button
        title={
          !callerId || !calledSide
            ? 'Pick a caller and a side'
            : flipping
              ? 'Flipping…'
              : result
                ? 'Flip again'
                : 'Flip the coin'
        }
        size="lg"
        onPress={runFlip}
        disabled={!callerId || !calledSide || flipping}
        fullWidth
      />

      {result && winner && (
        <Animated.View
          style={[
            styles.result,
            {
              opacity: reveal,
              transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            },
          ]}
        >
          <View style={styles.resultBadge}>
            <MaterialCommunityIcons name={FACE_ART[result.landedSide].icon} size={14} color={colors.accentInk} />
            <Text variant="caption" style={styles.resultBadgeText}>
              LANDED {result.landedSide}
            </Text>
          </View>
          <View style={styles.resultRow}>
            <View style={[styles.winnerSwatch, { backgroundColor: winner.color ?? colors.accent }]}>
              <MaterialCommunityIcons name="trophy" size={20} color={palette.black} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="h3">{winner.name} won the toss</Text>
              <Text variant="caption" tone="muted">
                {caller?.name} called {result.calledSide.toLowerCase()} —{' '}
                {result.winnerId === result.callerId ? 'called it right.' : 'called it wrong.'}
              </Text>
            </View>
          </View>
        </Animated.View>
      )}
    </Card>
  );
}

function CallerChip({
  participant,
  selected,
  dimmed,
  onPress,
}: {
  participant: VirtualCoinTossParticipant;
  selected: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected, dimmed && styles.chipDimmed]}>
      <View style={[styles.callerSwatch, { backgroundColor: participant.color ?? colors.accent }]}>
        <Text variant="caption" style={styles.callerSwatchText} numberOfLines={1}>
          {participant.shortName ?? participant.name.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <Text variant="bodyStrong" tone={selected ? 'accent' : 'default'} numberOfLines={1} style={{ flexShrink: 1 }}>
        {participant.name}
      </Text>
    </Pressable>
  );
}

function SideChip({
  side,
  selected,
  dimmed,
  onPress,
}: {
  side: CoinSide;
  selected: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  const art = FACE_ART[side];
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected, dimmed && styles.chipDimmed]}>
      <View style={[styles.miniCoin, { backgroundColor: art.background, borderColor: art.rim }]}>
        <MaterialCommunityIcons name={art.icon} size={14} color={colors.accentInk} />
      </View>
      <Text variant="bodyStrong" tone={selected ? 'accent' : 'default'}>
        {side === 'HEADS' ? 'Heads' : 'Tails'}
      </Text>
    </Pressable>
  );
}

function CoinFace({ side, back }: { side: CoinSide; back?: boolean }) {
  const art = FACE_ART[side];
  return (
    <View
      style={[
        styles.face,
        { backgroundColor: art.background, borderColor: art.rim },
        back && styles.faceBack,
      ]}
    >
      <View style={styles.faceRing}>
        <MaterialCommunityIcons name={art.icon} size={40} color={colors.accentInk} />
        <Text style={styles.faceLabel}>{side}</Text>
      </View>
      <View style={styles.faceSheen} />
      <View style={styles.faceBevelBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: spacing.lg, marginBottom: spacing.sm },
  choices: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  chipSelected: { borderColor: colors.accent },
  chipDimmed: { opacity: 0.55 },
  callerSwatch: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callerSwatchText: { color: palette.black, fontWeight: '800' },
  miniCoin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    marginVertical: spacing.lg,
    height: COIN_SIZE + TOSS_HEIGHT + 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 40,
    overflow: 'hidden',
  },
  stageBrand: {
    position: 'absolute',
    top: spacing.md,
    letterSpacing: 2,
    fontSize: 10,
  },
  coin: { width: COIN_SIZE, height: COIN_SIZE },
  coinShadow: {
    position: 'absolute',
    bottom: 22,
    alignSelf: 'center',
    width: COIN_SIZE * 0.72,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: palette.black,
  },
  face: {
    position: 'absolute',
    width: COIN_SIZE,
    height: COIN_SIZE,
    borderRadius: COIN_SIZE / 2,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  faceBack: { transform: [{ rotateX: '180deg' }] },
  faceRing: {
    width: COIN_SIZE - 26,
    height: COIN_SIZE - 26,
    borderRadius: (COIN_SIZE - 26) / 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(10, 10, 11, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  faceLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.5,
    color: colors.accentInk,
  },
  faceSheen: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    width: COIN_SIZE * 0.5,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  faceBevelBottom: {
    position: 'absolute',
    bottom: 9,
    alignSelf: 'center',
    width: COIN_SIZE * 0.56,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10, 10, 11, 0.22)',
  },
  coinShade: {
    position: 'absolute',
    width: COIN_SIZE,
    height: COIN_SIZE,
    borderRadius: COIN_SIZE / 2,
    backgroundColor: palette.black,
  },
  result: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    alignItems: 'center',
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  resultBadgeText: { color: colors.accentInk, fontWeight: '800', letterSpacing: 1 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
  },
  winnerSwatch: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
