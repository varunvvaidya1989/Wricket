import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { PersonalStats } from '@/lib/supabase/personalStatsApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { formBarPercent, formTag, isPeakForm } from '@/lib/wricket/performance';

export function PerformanceSnapshot({ name, stats, onPress }: { name: string; stats: PersonalStats; onPress: () => void }) {
  const useBowling = stats.bowlingBalls > stats.ballsFaced && stats.recentWickets.length > 0;
  const form = useBowling ? stats.recentWickets : stats.recentScores;
  return <Pressable accessibilityRole="button" accessibilityLabel="View My Performance" onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.86 }]}>
    <View style={styles.header}>
      <View style={styles.avatar}><Text variant="caption" tone="accent">{initials(name)}</Text></View>
      <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>{name}</Text>
      <View style={styles.formTag}><Text variant="overline" tone="accent">{formTag(form)}</Text></View>
      <Text variant="overline" tone="accent">VIEW ALL</Text>
    </View>
    <View style={styles.stats}>
      <SnapshotStat value={stats.matches} label="MATCHES" />
      <SnapshotStat value={stats.runs} label="RUNS" />
      <SnapshotStat value={stats.wickets} label="WICKETS" />
    </View>
    {form.length > 0 ? <View style={styles.formBars} accessibilityLabel={`Recent ${useBowling ? 'wickets' : 'scores'}`}>
      {[...form].reverse().map((entry, index) => <View key={`${entry.matchId}-${index}`} style={[styles.formBar, { height: `${formBarPercent(entry.value, form)}%` }, isPeakForm(entry.value, form) && styles.formBarPeak]} />)}
    </View> : <Text variant="caption" tone="dim" style={{ textAlign: 'center' }}>FORM STARTS AFTER YOUR FIRST MATCH</Text>}
  </Pressable>;
}

function SnapshotStat({ value, label }: { value: number; label: string }) {
  return <View style={styles.stat}><Text variant="h3">{value}</Text><Text variant="overline" tone="dim">{label}</Text></View>;
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, minWidth: 0, fontSize: 13 },
  formTag: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.accentMuted },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  stat: { flex: 1, alignItems: 'center' },
  formBars: { height: 28, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 5 },
  formBar: { width: 14, minHeight: 4, borderRadius: 3, backgroundColor: colors.accentMuted },
  formBarPeak: { backgroundColor: colors.accent },
});
