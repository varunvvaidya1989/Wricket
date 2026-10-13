import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/components/wricket/ui/Text';
import { colors } from '@/lib/wricket/presentation/design';

export function SectionRow<T extends string>({ items, selected, onSelect, label }: {
  items: readonly { id: T; label: string }[]; selected: T; onSelect: (id: T) => void; label: string;
}) {
  return <ScrollView horizontal accessibilityRole="tablist" accessibilityLabel={label}
    showsHorizontalScrollIndicator={false} style={styles.shell} contentContainerStyle={styles.row}>
    {items.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label}
      aria-selected={item.id === selected}
      accessibilityState={{ selected: item.id === selected }} onPress={() => onSelect(item.id)}
      style={({ pressed }) => [styles.tab, selected === item.id && styles.active, pressed && { opacity: 0.7 }]}>
      <Text style={{ fontSize: items.length >= 4 ? 10 : 12, lineHeight: 15.6 }} tone={item.id === selected ? 'accent' : 'muted'}>{item.label}</Text>
    </Pressable>)}
  </ScrollView>;
}
const styles = StyleSheet.create({
  shell: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg },
  row: { flexGrow: 1, paddingHorizontal: 17 },
  tab: { flex: 1, minHeight: 46, paddingHorizontal: 2, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  active: { borderBottomColor: colors.accent },
});
