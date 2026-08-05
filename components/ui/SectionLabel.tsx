import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { Text } from './Text';

export function SectionLabel({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return <View style={styles.row}>{live ? <View style={styles.dot} /> : null}<Text variant="overline" tone="dim">{children}</Text></View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live },
});
