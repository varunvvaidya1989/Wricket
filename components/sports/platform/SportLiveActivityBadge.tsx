import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';

interface SportLiveActivityBadgeProps {
  count: number;
  appearance?: 'strip' | 'card';
}

export function SportLiveActivityBadge({
  count,
  appearance = 'strip',
}: SportLiveActivityBadgeProps) {
  const liveCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const hasLive = liveCount > 0;
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (!hasLive) {
      pulse.setValue(0.45);
      return undefined;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [hasLive, pulse]);

  const scale = pulse.interpolate({ inputRange: [0.45, 1], outputRange: [0.8, 1.25] });

  return (
    <View
      accessibilityLabel={hasLive ? `${liveCount} live matches` : 'No live matches'}
      style={[
        styles.base,
        appearance === 'card' && styles.card,
        appearance === 'card' && (hasLive ? styles.cardLive : styles.cardNone),
      ]}
    >
      {hasLive ? <Animated.View style={[styles.dot, { opacity: pulse, transform: [{ scale }] }]} /> : null}
      <Text style={[
        styles.text,
        appearance === 'card' && styles.cardText,
        !hasLive && styles.noneText,
      ]}>
        {hasLive ? `${liveCount} live` : '\u2014 none'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  card: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  cardLive: {
    backgroundColor: 'rgba(255, 92, 92, 0.12)',
  },
  cardNone: {
    backgroundColor: colors.border,
  },
  text: {
    color: colors.live,
    fontFamily: 'IBMPlexMono_500Medium',
    fontSize: 8,
  },
  cardText: {
    fontSize: 9,
  },
  noneText: {
    color: colors.textDim,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.live,
  },
});
