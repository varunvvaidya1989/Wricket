import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { StageText, stageColors as colors } from './StageUI';
import type { SportOption } from '@/lib/supabase/sportstageAccountApi';

export function StageSportPreferences({ sports, selectedCodes, primaryCode, onToggle, onPrimary }: { sports: SportOption[]; selectedCodes: string[]; primaryCode: string; onToggle: (code: string) => void; onPrimary: (code: string) => void }) {
  const [width, setWidth] = useState(0);
  return <View style={{ gap: 12 }}>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{sports.map(sport => {
      const selected = selectedCodes.includes(sport.code);
      return <Pressable key={sport.code} accessibilityRole="checkbox" accessibilityLabel={sport.name} accessibilityState={{ checked: selected }} aria-checked={selected} onPress={() => onToggle(sport.code)} style={{ width: width ? (width - 10) / 2 : '48%', minHeight: 98, padding: 14, gap: 9, borderRadius: 15, backgroundColor: selected ? '#22321e' : colors.surface, borderWidth: 1, borderColor: selected ? '#779b58' : colors.border }}>
        <StageText variant="rowTitle">{sport.name}</StageText><StageText variant="eyebrow" style={{ color: selected ? colors.accent : colors.textMuted, letterSpacing: 0 }}>{selected ? '✓ SELECTED' : '+ ADD SPORT'}</StageText>
      </Pressable>;
    })}</View>
    {selectedCodes.length ? <><StageText variant="eyebrow" muted>PRIMARY SPORT</StageText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{sports.filter(sport => selectedCodes.includes(sport.code)).map(sport => <Pressable key={sport.code} accessibilityRole="radio" accessibilityLabel={`${sport.name} primary sport`} accessibilityState={{ checked: primaryCode === sport.code }} aria-checked={primaryCode === sport.code} onPress={() => onPrimary(sport.code)} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: primaryCode === sport.code ? colors.accent : colors.border, backgroundColor: colors.surface }}><StageText variant="small">{primaryCode === sport.code ? '✓ ' : ''}{sport.name}</StageText></Pressable>)}</View></> : null}
  </View>;
}
