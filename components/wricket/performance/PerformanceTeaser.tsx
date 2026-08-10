import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface PerformanceTeaserStats {
  matches?: number | null;
  runs?: number | null;
  wickets?: number | null;
}

export function PerformanceTeaser({ stats, onPress, own = false }: { stats?: PerformanceTeaserStats; onPress: () => void; own?: boolean }) {
  const hasRecord = Boolean(stats && ((stats.matches ?? 0) > 0 || (stats.runs ?? 0) > 0 || (stats.wickets ?? 0) > 0));
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${own ? 'My Performance' : 'player performance'}`} onPress={onPress} style={({ pressed }) => [styles.root, pressed && styles.pressed]}>
    <View style={styles.icon}><MaterialCommunityIcons name="chart-line" size={22} color={colors.accent} /></View>
    <View style={styles.copy}><Text variant="bodyStrong">{own ? 'My Performance' : 'Performance'}</Text><Text variant="caption" tone={hasRecord ? 'muted' : 'dim'} numberOfLines={1}>{hasRecord ? `${stats?.matches ?? 0} matches · ${stats?.runs ?? 0} runs · ${stats?.wickets ?? 0} wickets` : 'Form, trends and match history'}</Text></View>
    <Text variant="overline" tone="accent">VIEW</Text>
    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textDim} />
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  pressed: { opacity: 0.7 },
});
