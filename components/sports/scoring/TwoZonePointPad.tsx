import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { Text } from '@/components/ui/Text';
import type { Side } from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function TwoZonePointPad({
  sideNames,
  sideOrder = [0, 1],
  servingSide,
  accent,
  disabled,
  onPoint,
}: {
  sideNames: readonly [string, string];
  sideOrder?: readonly [Side, Side];
  servingSide: Side;
  accent: string;
  disabled?: boolean;
  onPoint: (side: Side) => void;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.instruction}>
        <MaterialCommunityIcons name="gesture-tap" size={16} color={colors.textDim} />
        <Text variant="caption" tone="dim">TAP THE RALLY WINNER</Text>
      </View>
      <View style={styles.zones}>
        {sideOrder.map((side) => (
          <Pressable
            key={side}
            accessibilityRole="button"
            accessibilityLabel={`Point to ${sideNames[side]}`}
            accessibilityHint="Records one rally in the match event log"
            disabled={disabled}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onPoint(side);
            }}
            style={({ pressed }) => [
              styles.zone,
              { borderColor: side === servingSide ? accent : colors.border },
              side === servingSide && { backgroundColor: `${accent}12` },
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <View style={styles.zoneTop}>
              <Text variant="overline" style={{ color: side === servingSide ? accent : colors.textDim }}>
                {side === servingSide ? 'SERVING' : 'RECEIVING'}
              </Text>
              <MaterialCommunityIcons
                name="plus-circle-outline"
                size={24}
                color={side === servingSide ? accent : colors.textMuted}
              />
            </View>
            <View style={styles.zoneCopy}>
              <Text variant="overline" tone="dim">POINT TO</Text>
              <Text variant="h2" numberOfLines={2} style={styles.name}>{sideNames[side]}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  instruction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  zones: { minHeight: 154, flexDirection: 'row', gap: spacing.sm },
  zone: {
    flex: 1,
    minWidth: 0,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surface,
    justifyContent: 'space-between',
  },
  zoneTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zoneCopy: { gap: 5 },
  name: { lineHeight: 23 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
});
