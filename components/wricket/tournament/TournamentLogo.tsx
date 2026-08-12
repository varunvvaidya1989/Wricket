import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius } from '@/lib/theme/spacing';

interface TournamentLogoProps {
  name: string;
  uri?: string;
  size?: number;
  style?: ViewStyle;
}

export function TournamentLogo({ name, uri, size = 52, style }: TournamentLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [uri]);

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();

  return (
    <View
      accessibilityLabel={`${name} logo`}
      style={[
        styles.root,
        { width: size, height: size, borderRadius: Math.min(radius.lg, size * 0.24) },
        style,
      ]}
    >
      {uri && !imageFailed ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={styles.image}
          onError={() => setImageFailed(true)}
        />
      ) : initials ? (
        <Text variant="bodyStrong" style={[styles.initials, { fontSize: Math.max(14, size * 0.28) }]}>{initials}</Text>
      ) : (
        <MaterialCommunityIcons name="trophy-outline" size={size * 0.45} color={colors.gold} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  image: { width: '100%', height: '100%' },
  initials: { color: colors.gold, letterSpacing: 0.5 },
});
