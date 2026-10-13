import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/wricket/ui/Text';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { matchStatus, tournamentStatus } from '@/lib/wricket/presentation/status';

export function StatusBadge({ status, kind = 'match' }: { status: string; kind?: 'match' | 'tournament' }) {
  const presentation = kind === 'tournament' ? tournamentStatus(status) : matchStatus(status);
  return <View accessibilityLabel={presentation.label} style={[styles.badge, presentation.live && styles.live]}>
    {presentation.live ? <View style={styles.dot} /> : null}
    <Text style={[styles.label, presentation.live && { color: colors.live }]}>{presentation.label}</Text>
  </View>;
}
const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: '#414c43' },
  live: { paddingHorizontal: 0, paddingVertical: 0, borderWidth: 0 },
  label: { fontFamily: fonts.mono, fontSize: 8, lineHeight: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  dot: { height: 5, width: 5, borderRadius: 3, backgroundColor: colors.live },
});
