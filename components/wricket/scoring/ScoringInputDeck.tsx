import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/wricket/ui/Text';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { NUMERIC_RUNS, type ScoringInputMode } from '@/lib/wricket/presentation/scoringInput';
import type { ScoringUiVersion } from '@/lib/wricket/presentation/uiRelease';
import { GesturePad, type PadAction } from './GesturePad';

export function ScoringInputDeck({ mode, uiVersion = 'revamp-v1', onModeChange, onAction, onExtras, onControls, onHistory, disabled, canUndo, saving, receipt, error }: {
  uiVersion?: ScoringUiVersion;
  mode: ScoringInputMode;
  onModeChange: (mode: ScoringInputMode) => void;
  onAction: (action: PadAction) => void;
  onExtras: () => void;
  onControls: () => void;
  onHistory: () => void;
  disabled: boolean;
  canUndo: boolean;
  saving: boolean;
  receipt: string | null;
  error: string | null;
}) {
  return <View style={styles.deck}>
    <View accessibilityLiveRegion="polite" style={[styles.receipt, error && styles.error]}>
      <DesignIcon name={error ? 'info' : saving ? 'clock' : receipt ? 'check' : 'info'} size={16} color={error ? colors.danger : colors.accent} />
      <View style={{ flex: 1 }}><Text variant="caption">{error ?? (saving ? 'Saving delivery…' : receipt ?? 'Ready for the next delivery.')}</Text>
        {!saving && !error && receipt ? <Text style={styles.receiptDetail}>{Platform.OS === 'web' ? 'Recorded in this session.' : 'Saved on this device.'} Connection status is shown above.</Text> : null}
      </View>
    </View>
    <View accessibilityRole="radiogroup" accessibilityLabel="Scoring input method" style={styles.switcher}>
      {(['numbers', 'gestures'] as const).map(value => <Pressable key={value} accessibilityRole="radio"
        accessibilityLabel={value === 'numbers' ? 'Numbers' : 'Gestures'} accessibilityState={{ checked: mode === value, disabled: saving }}
        aria-checked={mode === value} disabled={saving} onPress={() => onModeChange(value)}
        style={[styles.mode, mode === value && styles.modeSelected]}>
        <Text style={{ fontSize: 11, color: mode === value ? colors.accent : colors.textMuted }}>{value === 'numbers' ? 'Numbers' : 'Gestures'}</Text>
      </Pressable>)}
    </View>
    {mode === 'numbers' ? <View style={styles.numbers}>
      {NUMERIC_RUNS.map(runs => <View key={runs} style={styles.cell}><Pressable
        accessibilityRole="button" accessibilityLabel={`Record ${runs} runs`} accessibilityState={{ disabled }}
        disabled={disabled} onPress={() => onAction({ kind: 'RUNS', runs })}
        style={({ pressed }) => [styles.run, uiVersion === 'recovery-v1' && { height: 60, borderRadius: 6 }, runs >= 4 && styles.boundary, disabled && styles.disabled, pressed && styles.pressed]}>
        <Text style={[styles.digit, runs >= 4 && { color: colors.accent }]}>{runs}</Text>
      </Pressable></View>)}
    </View> : <View style={styles.gestures}><GesturePad disabled={disabled} onAction={onAction} /></View>}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Extras" disabled={disabled} onPress={onExtras} style={[styles.action, disabled && styles.disabled]}>
        <Text variant="caption">Extras</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Wicket" disabled={disabled} onPress={() => onAction({ kind: 'WICKET' })} style={[styles.action, styles.wicket, disabled && styles.disabled]}>
        <Text variant="caption" style={{ color: colors.danger }}>Wicket</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Controls" disabled={saving} onPress={onControls} style={styles.action}>
        <Text variant="caption">Controls</Text>
      </Pressable>
    </View>

    <View style={styles.undoRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Undo last ball" disabled={saving || !canUndo || Boolean(error)} onPress={() => onAction({ kind: 'UNDO' })} style={[styles.historyAction, (saving || !canUndo || Boolean(error)) && styles.disabled]}>
        <DesignIcon name="undo" size={14} color={colors.textMuted} /><Text variant="caption" tone="muted">Undo last delivery</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="History" disabled={saving} onPress={onHistory} style={styles.historyAction}><Text variant="caption" tone="muted">History</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  deck: { gap: 8 },
  undoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  historyAction: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7 },
  switcher: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: 8, backgroundColor: '#111a13', borderWidth: 1, borderColor: '#354a32' },
  mode: { flex: 1, minHeight: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  modeSelected: { backgroundColor: '#314b28' },
  numbers: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  cell: { width: '33.333333%', padding: 4 },
  run: { height: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 11, borderWidth: 1, borderColor: '#43513e', backgroundColor: '#253027' },
  digit: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.text },
  boundary: { backgroundColor: '#293e23', borderColor: '#598341' },
  pressed: { backgroundColor: '#476b33', transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.4 },
  gestures: { height: 130 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 44, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 10, borderColor: colors.border, backgroundColor: colors.bg },
  wicket: { borderColor: '#694437', backgroundColor: colors.bg },
  receipt: { paddingVertical: 11, paddingHorizontal: 12, flexDirection: 'row', gap: 9, borderRadius: 10, borderWidth: 1, borderColor: '#415e38', backgroundColor: '#1f3220' },
  receiptDetail: { fontFamily: fonts.body, fontSize: 9, lineHeight: 14, color: '#a7b99b', marginTop: 2 },
  error: { borderColor: colors.danger, backgroundColor: '#2c211c' },
});
