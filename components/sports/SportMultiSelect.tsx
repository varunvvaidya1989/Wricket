import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, View } from 'react-native';
import { SportIcon } from '@/components/sports/SportIcon';

import { Text } from '@/components/ui/Text';
import { SportOption } from '@/lib/supabase/sportstageAccountApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function SportMultiSelect({ sports, selectedCodes, primaryCode, onToggle, onPrimary, compact = false }: {
  sports: SportOption[];
  selectedCodes: string[];
  primaryCode: string;
  onToggle: (code: string) => void;
  onPrimary: (code: string) => void;
  compact?: boolean;
}) {
  const selected = new Set(selectedCodes);
  return <View style={[styles.list, compact && styles.grid]}>{sports.map(sport => {
    const isSelected = selected.has(sport.code);
    const isPrimary = primaryCode === sport.code;
    return <Pressable
      key={sport.id}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={`${sport.name}${isPrimary ? ', primary sport' : ''}`}
      onPress={() => onToggle(sport.code)}
      style={({ pressed }) => [styles.sport, compact && styles.compact, isSelected && styles.selected, pressed && styles.pressed]}
    >
      <View style={[styles.icon, isSelected && styles.iconSelected]}><SportIcon code={sport.code} size={21} color={isSelected ? colors.accent : colors.textMuted} /></View>
      <View style={styles.copy}><Text variant="bodyStrong" numberOfLines={1}>{sport.name}</Text><Text variant="caption" tone={sport.status === 'AVAILABLE' ? 'muted' : 'dim'}>{sport.status === 'AVAILABLE' ? 'Available now' : 'Coming soon'}</Text></View>
      {isSelected ? <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: isPrimary }}
        accessibilityLabel={isPrimary ? `${sport.name} is primary` : `Make ${sport.name} primary`}
        onPress={(event: GestureResponderEvent) => { event.stopPropagation(); onPrimary(sport.code); }}
        style={[styles.primary, isPrimary && styles.primaryActive]}
      ><MaterialCommunityIcons name={isPrimary ? 'star' : 'star-outline'} size={14} color={isPrimary ? colors.accentInk : colors.textMuted} /><Text variant="overline" style={[styles.primaryText, { color: isPrimary ? colors.accentInk : colors.textMuted }]}>{isPrimary ? 'PRIMARY' : 'MAKE PRIMARY'}</Text></Pressable> : <MaterialCommunityIcons name="checkbox-blank-outline" size={22} color={colors.textDim} />}
    </Pressable>;
  })}</View>;
}


const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  sport: { minHeight: 68, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  compact: { width: '48%', flexGrow: 1, flexBasis: 150, flexWrap: 'wrap' },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  icon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  iconSelected: { backgroundColor: colors.surface },
  copy: { flex: 1, minWidth: 72, gap: 2 },
  primary: { minHeight: 28, paddingHorizontal: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  primaryActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  primaryText: { fontSize: 7.5 },
  pressed: { opacity: 0.7 },
});
