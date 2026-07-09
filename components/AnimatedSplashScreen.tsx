import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { palette } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface AnimatedSplashScreenProps {
  onFinish?: () => void;
}

export function AnimatedSplashScreen({ onFinish }: AnimatedSplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const logoScale = useSharedValue(0.8);
  const logoOpacity = useSharedValue(0);
  const ballX = useSharedValue(-90);
  const fieldPulse = useSharedValue(0.92);
  const fade = useSharedValue(1);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 420 });
    logoScale.value = withSequence(
      withTiming(1.08, { duration: 520, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 260 }),
    );
    ballX.value = withSequence(
      withTiming(90, { duration: 820, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) }),
    );
    fieldPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 620 }),
        withTiming(0.92, { duration: 620 }),
      ),
      2,
      true,
    );
    fade.value = withDelay(
      1700,
      withTiming(0, { duration: 320 }, finished => {
        if (finished) {
          runOnJS(setVisible)(false);
          if (onFinish) runOnJS(onFinish)();
        }
      }),
    );
  }, [ballX, fade, fieldPulse, logoOpacity, logoScale, onFinish]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const ballStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ballX.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fieldPulse.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.container, containerStyle]}>
      <View style={styles.field}>
        <Animated.View style={[styles.boundary, ringStyle]} />
        <View style={styles.innerBoundary} />
        <View style={styles.grassBandA} />
        <View style={styles.grassBandB} />
        <View style={styles.pitch}>
          <View style={styles.crease} />
          <View style={[styles.crease, styles.creaseBottom]} />
        </View>
        <Animated.View style={[styles.ball, ballStyle]} />
      </View>

      <Animated.View style={[styles.brand, logoStyle]}>
        <Text variant="scoreLg" style={styles.logoText}>Wricket</Text>
        <Text variant="caption" style={styles.tagline}>Score every ball</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: palette.ink900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#1F7A3C',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(235,255,220,0.75)',
  },
  boundary: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 3,
    borderColor: 'rgba(235,255,220,0.62)',
  },
  innerBoundary: {
    position: 'absolute',
    width: 172,
    height: 172,
    borderRadius: 86,
    borderWidth: 1,
    borderColor: 'rgba(235,255,220,0.24)',
  },
  grassBandA: {
    position: 'absolute',
    width: 340,
    height: 62,
    backgroundColor: 'rgba(42,142,65,0.48)',
    transform: [{ rotate: '-18deg' }],
  },
  grassBandB: {
    position: 'absolute',
    width: 62,
    height: 340,
    backgroundColor: 'rgba(22,92,47,0.4)',
    transform: [{ rotate: '24deg' }],
  },
  pitch: {
    width: 58,
    height: 150,
    borderRadius: radius.md,
    backgroundColor: palette.willow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
  },
  crease: {
    position: 'absolute',
    top: 24,
    width: 78,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  creaseBottom: {
    top: undefined,
    bottom: 24,
  },
  ball: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.wicket,
    borderWidth: 2,
    borderColor: palette.white,
  },
  brand: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  logoText: {
    color: palette.white,
    letterSpacing: 0,
  },
  tagline: {
    color: palette.ink100,
    marginTop: spacing.xs,
    fontWeight: '700',
  },
});
