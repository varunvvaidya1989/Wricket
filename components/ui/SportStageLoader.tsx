import { Image } from 'expo-image';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const logo = require('@/assets/sportstage/logo/sportstage-mark-rounded-512.png');

type LoaderVariant = 'screen' | 'section' | 'compact';

export function SportStageLoader({
  message = 'Setting the stage',
  detail = 'Syncing scores, fixtures, and match moments',
  accent = colors.accent,
  variant = 'screen',
  style,
}: {
  message?: string;
  detail?: string;
  accent?: string;
  variant?: LoaderVariant;
  style?: ViewStyle;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const counterSpin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const travel = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animations = [
      Animated.loop(Animated.timing(spin, {
        toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true,
      })),
      Animated.loop(Animated.timing(counterSpin, {
        toValue: 1, duration: 4200, easing: Easing.linear, useNativeDriver: true,
      })),
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1, duration: 900, easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0, duration: 900, easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
        }),
      ])),
      Animated.loop(Animated.timing(travel, {
        toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
      })),
    ];
    animations.forEach(animation => animation.start());
    return () => animations.forEach(animation => animation.stop());
  }, [counterSpin, pulse, spin, travel]);

  const compact = variant === 'compact';
  const section = variant === 'section';
  const stageSize = compact ? 72 : section ? 116 : 164;
  const logoSize = compact ? 34 : section ? 52 : 70;
  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const reverseRotation = counterSpin.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.36] });
  const railX = travel.interpolate({ inputRange: [0, 1], outputRange: [-52, 52] });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      style={[
        styles.root,
        variant === 'screen' && styles.screen,
        variant === 'section' && styles.section,
        variant === 'compact' && styles.compact,
        style,
      ]}
    >
      {!compact ? (
        <View pointerEvents="none" style={styles.atmosphere}>
          <View style={[styles.horizon, { borderColor: `${accent}18` }]} />
          <View style={[styles.horizon, styles.horizonTwo, { borderColor: `${accent}10` }]} />
          <View style={[styles.verticalLine, { backgroundColor: `${accent}0D` }]} />
        </View>
      ) : null}

      <View style={{ width: stageSize, height: stageSize, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[
          styles.glow,
          {
            width: stageSize * 0.72,
            height: stageSize * 0.72,
            borderRadius: stageSize,
            backgroundColor: accent,
            opacity: glowOpacity,
            transform: [{ scale: pulseScale }],
          },
        ]} />
        <Animated.View style={[
          styles.orbit,
          {
            width: stageSize,
            height: stageSize,
            borderRadius: stageSize,
            borderColor: `${accent}5C`,
            transform: [{ rotate: rotation }],
          },
        ]}>
          <View style={[styles.signal, styles.signalTop, { backgroundColor: accent, boxShadow: `0 0 8px ${accent}` }]} />
          <View style={[styles.signal, styles.signalBottom, { backgroundColor: colors.live, boxShadow: `0 0 8px ${colors.live}` }]} />
        </Animated.View>
        <Animated.View style={[
          styles.innerOrbit,
          {
            width: stageSize * 0.78,
            height: stageSize * 0.78,
            borderRadius: stageSize,
            borderColor: `${colors.gold}4A`,
            transform: [{ rotate: reverseRotation }],
          },
        ]}>
          <View style={[styles.goldSignal, { backgroundColor: colors.gold }]} />
        </Animated.View>
        <Animated.View style={[
          styles.logoShell,
          {
            width: logoSize + 18,
            height: logoSize + 18,
            borderRadius: compact ? radius.lg : radius.xl,
            borderColor: `${accent}80`,
            transform: [{ scale: pulseScale }],
          },
        ]}>
          <Image source={logo} style={{ width: logoSize, height: logoSize, borderRadius: compact ? 8 : 14 }} contentFit="cover" />
        </Animated.View>
      </View>

      <View style={[styles.copy, compact && styles.compactCopy]}>
        {!compact ? <Text variant="overline" style={{ color: accent, letterSpacing: 2.4 }}>SPORTSTAGE LIVE SYSTEM</Text> : null}
        <Text variant={compact ? 'caption' : 'h3'} style={compact ? styles.compactMessage : styles.message}>{message}</Text>
        {!compact && detail ? <Text variant="caption" tone="muted" style={styles.detail}>{detail}</Text> : null}
        <View style={[styles.rail, compact && styles.compactRail, { backgroundColor: `${accent}1F` }]}>
          <Animated.View style={[
            styles.railPulse,
            { backgroundColor: accent, boxShadow: `0 0 5px ${accent}`, transform: [{ translateX: railX }] },
          ]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.bg },
  screen: { flex: 1, minHeight: 420, padding: spacing.xxl },
  section: { minHeight: 280, borderRadius: radius.xl, padding: spacing.xl },
  compact: { minHeight: 108, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  atmosphere: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  horizon: { position: 'absolute', width: 340, height: 190, borderWidth: 1, borderRadius: 170, transform: [{ scaleY: 0.34 }] },
  horizonTwo: { width: 520, height: 280 },
  verticalLine: { position: 'absolute', width: 1, height: '72%', transform: [{ rotate: '32deg' }] },
  glow: { position: 'absolute' },
  orbit: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed' },
  innerOrbit: { position: 'absolute', borderWidth: 1 },
  signal: { position: 'absolute', width: 9, height: 9, borderRadius: radius.pill },
  signalTop: { top: -5, left: '50%', marginLeft: -4.5 },
  signalBottom: { bottom: -5, left: '50%', marginLeft: -4.5 },
  goldSignal: { position: 'absolute', width: 7, height: 7, borderRadius: radius.pill, right: -4, top: '50%', marginTop: -3.5 },
  logoShell: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: colors.surfaceElevated },
  copy: { alignItems: 'center', marginTop: spacing.xl, maxWidth: 340 },
  compactCopy: { alignItems: 'flex-start', flex: 1, marginTop: 0 },
  message: { marginTop: spacing.sm, textAlign: 'center', letterSpacing: -0.25 },
  compactMessage: { color: colors.text, marginBottom: spacing.sm },
  detail: { marginTop: spacing.xs, textAlign: 'center', lineHeight: 19 },
  rail: { width: 118, height: 3, borderRadius: radius.pill, marginTop: spacing.lg, overflow: 'hidden' },
  compactRail: { width: 104, marginTop: 0 },
  railPulse: { width: 42, height: 3, borderRadius: radius.pill, marginLeft: 38 },
});
