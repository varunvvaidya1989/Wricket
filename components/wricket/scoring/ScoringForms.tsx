import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/wricket/ui/Text';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { formatOver } from '@/lib/wricket/domain/scoring';
import type { DismissalKind, ExtraKind } from '@/lib/wricket/domain/types';
import type { MatchXIPlayer } from '@/lib/wricket/db/repo';

type FormProps = { visible: boolean; saving: boolean; error: string | null; onClose: () => void };

export function Form({ visible, saving, error, onClose, title, closeLabel, children, confirm, onConfirm, disabled, danger, cancelLabel = 'Cancel', onCancel }: FormProps & {
  title: string; closeLabel: string; children: React.ReactNode; confirm: string; onConfirm: () => void; disabled?: boolean; danger?: boolean;
  cancelLabel?: string; onCancel?: () => void;
}) {
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!saving) onClose(); }}>
    <Screen padded={false} edges={['top','bottom','left','right']} style={{ backgroundColor: colors.bg }}>
      <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel={closeLabel} disabled={saving} onPress={onClose} style={styles.back}><DesignIcon name="back" /></Pressable><Text variant="h3">{title}</Text></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View pointerEvents={saving ? 'none' : 'auto'} style={{ gap: 16 }}>{children}</View>
        {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
      </ScrollView>
      {confirm ? <View style={styles.footer}><Button title={cancelLabel} variant="secondary" disabled={saving} onPress={onCancel ?? onClose} style={{ flex: 1, borderColor: '#39493b' }} />
        <Pressable accessibilityRole="button" accessibilityLabel={saving ? 'Saving…' : confirm} accessibilityState={{ disabled: saving || Boolean(error) || disabled, busy: saving }} disabled={saving || Boolean(error) || disabled} onPress={onConfirm} style={[styles.confirm, danger && styles.dangerConfirm, (saving || Boolean(error) || disabled) && { opacity: 0.48 }]}><Text style={{ fontFamily: fonts.display, fontSize: 13, color: danger ? '#ffb1a4' : colors.accentInk }}>{saving ? 'Saving…' : confirm}</Text></Pressable>
      </View> : null}
    </Screen>
  </Modal>;
}

function Note({ children }: { children: string }) {
  return <View style={styles.note}><DesignIcon name="info" size={14} color={colors.textMuted} /><Text variant="caption" tone="muted" style={{ flex: 1 }}>{children}</Text></View>;
}

const extraLabels = { WIDE: 'Wide', NO_BALL: 'No ball', BYE: 'Bye', LEG_BYE: 'Leg bye' } as const;

export function ExtrasSheet({ legalBalls, onConfirm, ...props }: FormProps & {
  legalBalls: number;
  onConfirm: (event: { kind: NonNullable<ExtraKind>; runs: number; rotateStrike?: boolean }) => void;
}) {
  const [kind, setKind] = useState<NonNullable<ExtraKind>>('WIDE');
  const [runs, setRuns] = useState(0);
  const [rotateStrike, setRotateStrike] = useState<boolean | null>(null);
  useEffect(() => { if (props.visible) { setKind('WIDE'); setRuns(0); setRotateStrike(null); } }, [props.visible]);
  const penalty = kind === 'WIDE' || kind === 'NO_BALL';
  return <Form {...props} title="Extras" closeLabel="Close extras" confirm="Record delivery" disabled={runs > 0 && rotateStrike === null} onConfirm={() => onConfirm({ kind, runs, rotateStrike: rotateStrike ?? undefined })}>
    <View><Text variant="h1">Record an extra.</Text><Text tone="muted" style={{ marginTop: 8 }}>One delivery. Every detail accounted for.</Text></View>
    <Card>{(Object.keys(extraLabels) as NonNullable<ExtraKind>[]).map((value, index) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={extraLabels[value]} accessibilityState={{ checked: kind === value }} onPress={() => { setKind(value); setRotateStrike(null); }} style={[styles.radioRow, index > 0 && styles.divider]}>
      <View style={[styles.radio, kind === value && styles.selectedRadio]}>{kind === value ? <View style={styles.radioDot} /> : null}</View>
      <Text style={{ flex: 1 }}>{extraLabels[value]}</Text><Text style={styles.tiny}>{value === 'WIDE' || value === 'NO_BALL' ? 'Not a legal ball' : 'Legal ball'}</Text>
    </Pressable>)}</Card>
    <View><Text variant="caption" tone="muted" style={{ marginBottom: 7 }}>{penalty ? 'Additional runs beyond the penalty' : 'Runs completed'}</Text>
      <View style={styles.stepper}><Pressable accessibilityRole="button" accessibilityLabel="Decrease additional runs" disabled={runs === 0} onPress={() => { setRuns(runs - 1); setRotateStrike(null); }} style={styles.stepButton}><Text style={styles.stepText}>−</Text></Pressable><Text accessibilityLiveRegion="polite" style={styles.stepValue}>{runs}</Text><Pressable accessibilityRole="button" accessibilityLabel="Increase additional runs" disabled={runs === 6} onPress={() => { setRuns(runs + 1); setRotateStrike(null); }} style={styles.stepButton}><Text style={styles.stepText}>+</Text></Pressable></View>
    </View>
    <Card style={styles.preview}><Text variant="overline" tone="muted">DELIVERY PREVIEW</Text><Text variant="h3" style={{ marginTop: 10 }}>{extraLabels[kind]} · {runs + (penalty ? 1 : 0)} {kind === 'NO_BALL' ? 'total run(s)' : 'extra run(s)'}</Text><Text tone="muted" style={{ marginTop: 8 }}>{penalty ? `The legal ball count stays at ${formatOver(legalBalls)}.` : `This delivery advances the over to ${formatOver(legalBalls + 1)}.`}</Text></Card>
    {runs > 0 ? <View><Text variant="caption" tone="muted">Did the batters change ends?</Text><View style={styles.chips}>{[true, false].map(value => <Pressable key={String(value)} accessibilityRole="radio" accessibilityLabel={value ? 'Rotate strike' : 'Keep strike'} accessibilityState={{ checked: rotateStrike === value }} onPress={() => setRotateStrike(value)} style={[styles.chip, rotateStrike === value && styles.selectedChip]}><Text variant="caption">{value ? 'Yes' : 'No'}</Text></Pressable>)}</View></View> : null}
    <Note>Review the extra type and runs before recording. Cancel returns to scoring without adding a delivery.</Note>
  </Form>;
}

const dismissals: Record<DismissalKind, string> = { BOWLED: 'Bowled', CAUGHT: 'Caught', LBW: 'LBW', RUN_OUT: 'Run out', STUMPED: 'Stumped', HIT_WICKET: 'Hit wicket', RETIRED_OUT: 'Retired out' };

export function WicketSheet({ striker, nonStriker, bowler, fielders, onConfirm, ...props }: FormProps & {
  striker: string; nonStriker: string; bowler: string; fielders: MatchXIPlayer[];
  onConfirm: (event: { kind: DismissalKind; outIsStriker: boolean; fielderId?: string; assistantFielderId?: string }) => void;
}) {
  const [kind, setKind] = useState<DismissalKind>('BOWLED');
  const [outIsStriker, setOutIsStriker] = useState(true);
  const [fielderId, setFielderId] = useState<string>();
  const [assistantFielderId, setAssistantFielderId] = useState<string>();
  useEffect(() => { if (props.visible) { setKind('BOWLED'); setOutIsStriker(true); setFielderId(undefined); setAssistantFielderId(undefined); } }, [props.visible]);
  const needsFielder = ['CAUGHT', 'RUN_OUT', 'STUMPED'].includes(kind);
  const valid = !needsFielder || Boolean(fielderId && (kind !== 'RUN_OUT' || assistantFielderId));
  return <Form {...props} title="Record wicket" closeLabel="Close wicket" confirm="Confirm wicket" danger disabled={!valid} onConfirm={() => onConfirm({ kind, outIsStriker, fielderId, assistantFielderId })}>
    <View><Text variant="overline" tone="muted">WICKET DETAILS</Text><Text variant="h1" style={{ marginTop: 8 }}>What a moment.</Text><Text tone="muted" style={{ marginTop: 8 }}>Record the dismissal before choosing the next batter.</Text></View>
    <Card><Text variant="caption" tone="muted">Batter dismissed</Text><View style={styles.chips}>{[true, false].map(value => <Pressable key={String(value)} accessibilityRole="radio" accessibilityLabel={`Dismiss ${value ? striker : nonStriker}`} accessibilityState={{ checked: outIsStriker === value }} onPress={() => setOutIsStriker(value)} style={[styles.chip, outIsStriker === value && styles.selectedChip]}><Text>{value ? striker : nonStriker}</Text></Pressable>)}</View></Card>
    <View><Text variant="caption" tone="muted">Dismissal</Text><View style={styles.chips}>{(Object.keys(dismissals) as DismissalKind[]).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={dismissals[value]} accessibilityState={{ checked: kind === value }} onPress={() => { setKind(value); setFielderId(undefined); setAssistantFielderId(undefined); }} style={[styles.chip, kind === value && styles.selectedChip]}><Text style={{ fontSize: 10, color: kind === value ? colors.accent : colors.textMuted }}>{dismissals[value]}</Text></Pressable>)}</View></View>
    {needsFielder ? <FielderPicker label={kind === 'CAUGHT' ? 'Fielder' : kind === 'STUMPED' ? 'Keeper' : 'Wicket broken by'} players={fielders} selected={fielderId} onSelect={setFielderId} /> : null}
    {kind === 'RUN_OUT' ? <FielderPicker label="Thrower / assist (same player for direct hit)" players={fielders} selected={assistantFielderId} onSelect={setAssistantFielderId} /> : null}
    <Card style={{ backgroundColor: colors.bg }}><View style={styles.detailRow}><Text tone="muted">Bowler</Text><Text>{bowler}</Text></View><View style={[styles.detailRow, styles.divider, { marginTop: 12, paddingTop: 12 }]}><Text tone="muted">Runs on this delivery</Text><Text variant="mono">0</Text></View></Card>
    <View style={styles.notice}><DesignIcon name="info" size={16} color={colors.accent} /><Text variant="caption" style={{ flex: 1 }}>Nothing is recorded until you confirm this delivery.</Text></View>
  </Form>;
}

function FielderPicker({ label, players, selected, onSelect }: { label: string; players: MatchXIPlayer[]; selected?: string; onSelect: (id: string) => void }) {
  return <View><Text variant="caption" tone="muted">{label}</Text><View style={styles.chips}>{players.map(player => <Pressable key={player.userId} accessibilityRole="radio" accessibilityLabel={`${label}: ${player.name}`} accessibilityState={{ checked: player.userId === selected }} onPress={() => onSelect(player.userId)} style={[styles.chip, player.userId === selected && styles.selectedChip]}><Text style={{ fontSize: 10, color: player.userId === selected ? colors.accent : colors.textMuted }}>{player.name}</Text></Pressable>)}</View></View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 14 },
  back: { minWidth: 30, minHeight: 44, justifyContent: 'center' },
  content: { padding: 18, paddingTop: 20, gap: 16, paddingBottom: 32 },
  footer: { padding: 18, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 10 },
  confirm: { flex: 1, minHeight: 46, paddingVertical: 13, paddingHorizontal: 15, borderRadius: 10, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' },
  dangerConfirm: { backgroundColor: '#35221e', borderColor: '#68463d', borderWidth: 1 },
  radioRow: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 45 },
  divider: { borderTopWidth: 1, borderColor: colors.border },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: '#6c8062', alignItems: 'center', justifyContent: 'center' },
  selectedRadio: { backgroundColor: colors.accent, borderColor: colors.accent },
  radioDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentInk },
  tiny: { fontSize: 9, color: colors.textMuted },
  stepper: { height: 49, flexDirection: 'row', borderWidth: 1, borderColor: '#41533d', borderRadius: 10, overflow: 'hidden' },
  stepButton: { width: 46, backgroundColor: '#243021', justifyContent: 'center', alignItems: 'center' },
  stepText: { fontFamily: fonts.body, fontSize: 23 },
  stepValue: { flex: 1, textAlign: 'center', alignSelf: 'center', fontFamily: fonts.mono, fontSize: 21 },
  preview: { backgroundColor: '#1c2c1b', borderColor: '#415e38' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderRadius: 20, borderColor: colors.border, backgroundColor: 'transparent' },
  selectedChip: { backgroundColor: '#233a24', borderColor: '#4e7142' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  note: { flexDirection: 'row', gap: 10, marginTop: 10 },
  notice: { padding: 12, flexDirection: 'row', gap: 9, borderRadius: 10, borderWidth: 1, borderColor: '#415e38', backgroundColor: '#1f3220' },
});
