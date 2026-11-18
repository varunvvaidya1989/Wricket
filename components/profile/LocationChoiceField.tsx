import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { StageButton, StageField, StageText, stageColors as colors } from '@/components/sports/platform/StageUI';
import type { LocationChoice } from '@/lib/profile/locations';

export function LocationChoiceField({ label, value, choices, onChange, disabled, hint }: {
  label: string; value: string; choices: LocationChoice[]; onChange: (value: string) => void; disabled?: boolean; hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => choices.filter(choice => choice.label.toLowerCase().includes(search.trim().toLowerCase())), [choices, search]);
  const selected = choices.find(choice => choice.value === value)?.label;
  return <View style={{ gap: 8 }}>
    <StageText>{label} · optional</StageText>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected ?? 'Not selected'}`} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={() => { setSearch(''); setOpen(true); }} style={{ minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, padding: 14, opacity: disabled ? 0.55 : 1 }}>
      <StageText>{selected ?? hint ?? `Choose ${label.toLowerCase()}`}</StageText>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: '#000b', justifyContent: 'center', padding: 16 }}>
        <View accessibilityViewIsModal style={{ maxHeight: '85%', gap: 14, padding: 18, borderRadius: 18, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
          <StageText variant="heading">Choose {label.toLowerCase()}</StageText>
          <StageField label={`Search ${label.toLowerCase()}`} value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
          <StageButton title={`Clear ${label.toLowerCase()}`} onPress={() => { onChange(''); setOpen(false); }} />
          <FlatList style={{ flexGrow: 0 }} data={filtered} keyExtractor={choice => choice.value} keyboardShouldPersistTaps="handled" initialNumToRender={15} maxToRenderPerBatch={20}
            ListEmptyComponent={<StageText muted>No matching locations.</StageText>}
            renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: item.value === value }} onPress={() => { onChange(item.value); setOpen(false); }} style={{ minHeight: 48, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}><StageText>{item.label}</StageText></Pressable>} />
          <StageButton title="Close location picker" onPress={() => setOpen(false)} />
        </View>
      </View>
    </Modal>
  </View>;
}
