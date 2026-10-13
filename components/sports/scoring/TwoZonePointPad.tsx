import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StageText, stageColors as colors } from '@/components/sports/platform/StageUI';
import type { Side } from '@/lib/sports/scoring';

export function TwoZonePointPad({ sideNames, sideOrder = [0, 1], servingSide, accent, disabled, onPoint }: { sideNames: readonly [string, string]; sideOrder?: readonly [Side, Side]; servingSide: Side; accent: string; disabled?: boolean; onPoint: (side: Side) => void }) {
  return <View style={styles.root}>
    <StageText variant="eyebrow" muted>WHO WON THE RALLY?</StageText>
    <View style={styles.zones}>{sideOrder.map(side => <Pressable key={side} accessibilityRole="button" accessibilityLabel={`Rally won by ${sideNames[side]}`} accessibilityHint="Records one rally using this sport’s scoring rules" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined); onPoint(side); }} style={({ pressed }) => [styles.zone, side === servingSide ? { backgroundColor: accent, borderColor: accent } : styles.receiving, (pressed || disabled) && { opacity: 0.55 }]}>
      <StageText variant="heading" style={{ color: side === servingSide ? colors.bg : accent, textAlign: 'center' }}>{sideNames[side]}</StageText>
      <StageText variant="small" style={{ color: side === servingSide ? colors.bg : accent }}>Rally winner</StageText>
    </Pressable>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  zones: { flexDirection: 'row', gap: 10 },
  zone: { flex: 1, minWidth: 0, minHeight: 98, padding: 16, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  receiving: { backgroundColor: '#263b20', borderColor: '#6b8b53' },
});
