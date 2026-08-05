import { Image } from 'expo-image';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const logo = require('@/assets/sportstage/logo/sportstage-mark-rounded-512.png');

export function AnimatedSportStageSplash() {
  const scale = useRef(new Animated.Value(0.72)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const copyOffset = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, damping: 10, stiffness: 120, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(copyOffset, { toValue: 0, duration: 520, delay: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [copyOffset, opacity, scale]);

  return <View style={styles.root}>
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <Image source={logo} style={styles.logo} contentFit="cover" accessibilityLabel="SportStage logo" />
    </Animated.View>
    <Animated.View style={[styles.copy, { opacity, transform: [{ translateY: copyOffset }] }]}>
      <Text variant="h1" style={styles.name}>SportStage</Text>
      <Text variant="overline" tone="dim">ONE ACCOUNT · EVERY SPORT</Text>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  logo: { width: 132, height: 132, borderRadius: 29 },
  copy: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  name: { letterSpacing: -0.8 },
});
