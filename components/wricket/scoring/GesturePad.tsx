import React, { useState } from 'react';
import { View, StyleSheet, type TextStyle } from 'react-native';
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
  | { kind: 'UNDO' };

export interface GesturePadProps {
  onAction: (a: PadAction) => void;
  disabled?: boolean;
  onInteractionChange?: (active: boolean) => void;
}

const SWIPE_THRESHOLD = 40;

export function GesturePad({ onAction, disabled, onInteractionChange }: GesturePadProps) {
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
          // left → four
          runOnJS(fire)({ kind: 'RUNS', runs: 4 }, 'FOUR', Haptics.ImpactFeedbackStyle.Medium);
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
      <Animated.View
        style={[styles.pad, animStyle]}
        onTouchStart={() => onInteractionChange?.(true)}
        onTouchEnd={() => onInteractionChange?.(false)}
        onTouchCancel={() => onInteractionChange?.(false)}
      >
        <View pointerEvents="none" style={styles.fieldLayer}>
          <View style={styles.boundaryOuter} />
          <View style={styles.boundaryInner} />
          <View style={styles.grassBandWide} />
          <View style={styles.grassBandTall} />
          <View style={styles.pitch} />
          <View style={styles.creaseTop} />
          <View style={styles.creaseBottom} />
        </View>

        <View style={styles.hintGrid}>
          <Text variant="caption" style={[styles.hintText, styles.hintTopLeft]}>1 ↑</Text>
          <Text variant="caption" style={[styles.hintText, styles.hintTopRight]}>2 ↗</Text>
          <Text variant="caption" style={[styles.hintText, styles.hintLeft]}>← 4</Text>
          <Text variant="caption" style={[styles.hintText, styles.hintRight]}>3 →</Text>
          <Text variant="caption" style={[styles.hintText, styles.hintBottom]}>↓ wkt</Text>
        </View>

        <View style={styles.center}>
          <Text variant="overline" style={styles.centerHint}>TAP DOT · ← FOUR · HOLD SIX</Text>
          <Text variant="scoreLg" style={styles.centerTitle}>
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
    width: '100%',
    height: '100%',
    backgroundColor: '#165C2F',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: '#4AB96A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fieldLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1F7A3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boundaryOuter: {
    position: 'absolute',
    width: '92%',
    height: '92%',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(235, 255, 220, 0.72)',
  },
  boundaryInner: {
    position: 'absolute',
    width: '72%',
    height: '72%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(235, 255, 220, 0.28)',
  },
  grassBandWide: {
    position: 'absolute',
    width: '120%',
    height: '26%',
    backgroundColor: 'rgba(42, 142, 65, 0.52)',
    transform: [{ rotate: '-18deg' }],
  },
  grassBandTall: {
    position: 'absolute',
    width: '24%',
    height: '120%',
    backgroundColor: 'rgba(22, 92, 47, 0.42)',
    transform: [{ rotate: '22deg' }],
  },
  pitch: {
    position: 'absolute',
    width: '22%',
    height: '54%',
    borderRadius: radius.md,
    backgroundColor: palette.willow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  creaseTop: {
    position: 'absolute',
    top: '31%',
    width: '30%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  creaseBottom: {
    position: 'absolute',
    bottom: '31%',
    width: '30%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  hintGrid: {
    ...StyleSheet.absoluteFillObject,
  },
  hintText: {
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '800',
    // React Native Web supports the consolidated prop before its native typings catch up.
    ...({ textShadow: '0px 1px 2px rgba(0,0,0,0.45)' } as unknown as TextStyle),
  },
  hintTopLeft: { position: 'absolute', top: spacing.md, left: spacing.md },
  hintTopRight: { position: 'absolute', top: spacing.md, right: spacing.md },
  hintLeft: { position: 'absolute', left: spacing.md, top: '50%' },
  hintRight: { position: 'absolute', right: spacing.md, top: '50%' },
  hintBottom: { position: 'absolute', bottom: spacing.md, alignSelf: 'center' },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 10, 11, 0.42)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  centerHint: {
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '800',
  },
  centerTitle: {
    color: palette.white,
    marginTop: spacing.sm,
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
