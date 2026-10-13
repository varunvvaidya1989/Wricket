import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/wricket/ui/Text';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { colors } from '@/lib/wricket/presentation/design';
import { ENTRY_MODE_LABELS, type TournamentEntryMode } from '@/lib/supabase/tournamentRegistrationApi';

export function TournamentEntryModePicker({ value, onChange, disabled }: { value: TournamentEntryMode; onChange: (mode: TournamentEntryMode) => void; disabled?: boolean }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel="Tournament entry mode" style={{ gap: 8 }}>
    <Text variant="overline" tone="muted">TOURNAMENT ENTRY</Text>
    {(['PLAYER_POOL', 'EXISTING_TEAMS'] as const).map(mode => <Pressable key={mode} accessibilityRole="radio" accessibilityLabel={ENTRY_MODE_LABELS[mode]}
      aria-checked={value === mode} accessibilityState={{ checked: value === mode, disabled }} disabled={disabled} onPress={() => onChange(mode)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 10, backgroundColor: colors.surface, borderColor: mode === value ? colors.accent : colors.border, opacity: disabled ? 0.6 : 1 }}>
      <DesignIcon name={mode === 'PLAYER_POOL' ? 'users' : 'trophy'} size={20} color={mode === value ? colors.accent : colors.textMuted} />
      <View style={{ flex: 1 }}><Text variant="bodyStrong" tone={mode === value ? 'accent' : 'default'}>{ENTRY_MODE_LABELS[mode]}</Text><Text variant="caption" tone="muted" style={{ marginTop: 4 }}>{mode === 'PLAYER_POOL' ? 'Players register first. Assign teams after your auction.' : 'Bring complete teams and let captains manage rosters.'}</Text></View>
      {mode === value ? <DesignIcon name="check" size={16} color={colors.accent} /> : null}
    </Pressable>)}
  </View>;
}
