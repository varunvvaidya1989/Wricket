import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Text } from '@/components/ui/Text';
import { colors, palette } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export type PadAction =
  | { kind: 'RUNS'; runs: 0 | 1 | 2 | 3 | 4 | 6 }
  | { kind: 'WICKET' }
  | { kind: 'EXTRA' }
  | { kind: 'UNDO' };

export interface GesturePadProps {
  onAction: (a: PadAction) => void;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 40;

export function GesturePad({ onAction, disabled }: GesturePadProps) {
  const [flash, setFlash] = useState<string | null>(null);
  const scale = useSharedValue(1);
  const flashOpacity = useSharedValue(0);

  const fire = (action: PadAction, label: string, hapticStyle: Haptics.ImpactFeedbackStyle) => {
    if (disabled) return;
    Haptics.impactAsync(hapticStyle);
    setFlash(label);
    flashOpacity.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 420 }),
    );
    scale.value = withSequence(
      withTiming(0.96, { duration: 80 }),
      withTiming(1, { duration: 200 }),
    );
    onAction(action);
    setTimeout(() => setFlash(null), 520);
  };

  const tap = Gesture.Tap()
    .maxDuration(220)
    .numberOfTaps(1)
    .onEnd(() => {
      runOnJS(fire)({ kind: 'RUNS', runs: 0 }, '•', Haptics.ImpactFeedbackStyle.Light);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(fire)({ kind: 'RUNS', runs: 4 }, 'FOUR', Haptics.ImpactFeedbackStyle.Medium);
    });

  const longPress = Gesture.LongPress()
    .minDuration(450)
    .onStart(() => {
      runOnJS(fire)({ kind: 'RUNS', runs: 6 }, 'SIX', Haptics.ImpactFeedbackStyle.Heavy);
    });

  const twoFinger = Gesture.Tap()
    .numberOfTaps(1)
    .minPointers(2)
    .onEnd(() => {
      runOnJS(fire)({ kind: 'UNDO' }, 'UNDO', Haptics.ImpactFeedbackStyle.Rigid);
    });

  const pan = Gesture.Pan()
    .minDistance(SWIPE_THRESHOLD)
    .onEnd((e) => {
      const dx = e.translationX;
      const dy = e.translationY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // 8-direction
      if (absY > absX) {
        if (dy < 0) {
          // up
          if (absX > absY * 0.5 && dx > 0) {
            runOnJS(fire)({ kind: 'RUNS', runs: 2 }, '2', Haptics.ImpactFeedbackStyle.Light);
          } else {
            runOnJS(fire)({ kind: 'RUNS', runs: 1 }, '1', Haptics.ImpactFeedbackStyle.Light);
          }
        } else {
          // down → wicket
          runOnJS(fire)({ kind: 'WICKET' }, 'WICKET', Haptics.ImpactFeedbackStyle.Heavy);
        }
      } else {
        if (dx > 0) {
          // right
          if (absY > absX * 0.5 && dy < 0) {
            runOnJS(fire)({ kind: 'RUNS', runs: 2 }, '2', Haptics.ImpactFeedbackStyle.Light);
          } else {
            runOnJS(fire)({ kind: 'RUNS', runs: 3 }, '3', Haptics.ImpactFeedbackStyle.Light);
          }
        } else {
          // left → extras
          runOnJS(fire)({ kind: 'EXTRA' }, 'EXTRA', Haptics.ImpactFeedbackStyle.Medium);
        }
      }
    });

  // doubleTap must beat tap; longPress must beat tap
  const composed = Gesture.Race(twoFinger, doubleTap, longPress, pan, tap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.pad, animStyle]}>
        <View style={styles.hintGrid}>
          <Text variant="caption" tone="dim" style={styles.hintTopLeft}>1 ↑</Text>
          <Text variant="caption" tone="dim" style={styles.hintTopRight}>2 ↗</Text>
          <Text variant="caption" tone="dim" style={styles.hintLeft}>← ext</Text>
          <Text variant="caption" tone="dim" style={styles.hintRight}>3 →</Text>
          <Text variant="caption" tone="dim" style={styles.hintBottom}>↓ wkt</Text>
        </View>

        <View style={styles.center}>
          <Text variant="overline" tone="dim">TAP DOT · 2× FOUR · HOLD SIX</Text>
          <Text variant="scoreLg" style={{ marginTop: spacing.sm }}>
            Score
          </Text>
        </View>

        <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]}>
          <Text variant="scoreXL" style={styles.flashText}>{flash}</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pad: {
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hintGrid: {
    ...StyleSheet.absoluteFillObject,
  },
  hintTopLeft: { position: 'absolute', top: spacing.md, left: spacing.md },
  hintTopRight: { position: 'absolute', top: spacing.md, right: spacing.md },
  hintLeft: { position: 'absolute', left: spacing.md, top: '50%' },
  hintRight: { position: 'absolute', right: spacing.md, top: '50%' },
  hintBottom: { position: 'absolute', bottom: spacing.md, alignSelf: 'center' },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashText: {
    color: palette.black,
  },
});
