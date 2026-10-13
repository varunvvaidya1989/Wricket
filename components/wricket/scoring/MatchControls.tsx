import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Form } from './ScoringForms';
import { Text } from '@/components/wricket/ui/Text';
import { Card } from '@/components/wricket/ui/Card';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { formatOver } from '@/lib/wricket/domain/scoring';
import type { ScoreAdjustmentKind } from '@/lib/wricket/domain/types';
import type { MatchAbandonmentResolution } from '@/lib/wricket/app/innings-flow';

export type MatchControlCommand =
  | { type: 'ADJUST'; kind: ScoreAdjustmentKind; runs: number }
  | { type: 'RETIRE'; kind: 'RETIRED_HURT' | 'RETIRED_OUT'; outIsStriker: boolean }
  | { type: 'END_INNINGS' }
  | { type: 'END_MATCH'; resolution: MatchAbandonmentResolution; winnerTeamId?: string };
type Page = 'home' | 'adjust' | 'retire' | 'innings' | 'end';

export function MatchControls({ visible, saving, error, onClose, onScorecard, onConfirm, innings, teamName, runs, wickets, legalBalls, overs, target, striker, nonStriker, teams }: {
  visible: boolean; saving: boolean; error: string | null; onClose: () => void; onScorecard: () => void;
  onConfirm: (command: MatchControlCommand) => Promise<boolean>;
  innings: number; teamName: string; runs: number; wickets: number; legalBalls: number; overs: number; target?: number;
  striker: string | null; nonStriker: string | null; teams: { id: string; name: string }[];
}) {
  const [page, setPage] = useState<Page>('home');
  const [adjustment, setAdjustment] = useState<ScoreAdjustmentKind>('PENALTY');
  const [amount, setAmount] = useState(5);
  const [retirement, setRetirement] = useState<'RETIRED_HURT' | 'RETIRED_OUT'>('RETIRED_HURT');
  const [outIsStriker, setOutIsStriker] = useState(true);
  const [resolution, setResolution] = useState<MatchAbandonmentResolution>('NO_RESULT');
  const [winner, setWinner] = useState<string>();
  useEffect(() => { if (visible) { setPage('home'); setAdjustment('PENALTY'); setAmount(5); setRetirement('RETIRED_HURT'); setOutIsStriker(true); setResolution('NO_RESULT'); setWinner(undefined); } }, [visible]);
  const back = () => { if (!saving) { if (page === 'home') onClose(); else setPage('home'); } };
  const title = { home: 'Match controls', adjust: 'Penalty / bonus', retire: 'Retire batter', innings: 'End innings', end: 'End match' }[page];
  const outcome = { WALKOVER: 'Walkover', NO_RESULT: 'No result', CANCELLED: 'Cancelled' }[resolution];
  const confirm = page === 'adjust' ? `Add ${amount} runs` : page === 'retire' ? 'Confirm retirement' : page === 'innings' ? 'End innings' : page === 'end' ? `Confirm ${outcome.toLowerCase()}` : '';
  const submit = async () => {
    const command: MatchControlCommand | undefined = page === 'adjust' ? { type: 'ADJUST', kind: adjustment, runs: amount }
      : page === 'retire' ? { type: 'RETIRE', kind: retirement, outIsStriker }
        : page === 'innings' ? { type: 'END_INNINGS' }
          : page === 'end' ? { type: 'END_MATCH', resolution, winnerTeamId: resolution === 'WALKOVER' ? winner : undefined } : undefined;
    if (command && await onConfirm(command)) onClose();
  };
  return <Form visible={visible} saving={saving} error={error} onClose={back} title={title} cancelLabel={page === 'innings' ? 'Keep scoring' : page === 'end' ? 'Go back' : 'Cancel'} onCancel={page === 'innings' ? onClose : back} closeLabel={`Close ${title.toLowerCase()}`} confirm={confirm} onConfirm={() => void submit()}
    disabled={(page === 'end' && resolution === 'WALKOVER' && !winner) || (page === 'retire' && (!striker || !nonStriker))}
    danger={page === 'end' || page === 'innings' || (page === 'retire' && retirement === 'RETIRED_OUT')}>
    {page === 'home' ? <>
      <View><Text variant="overline" tone="muted">INNINGS {innings} · {teamName} BATTING</Text><View style={{ marginTop: 8 }}><Heading title="Match controls." detail="Use these actions when play cannot be recorded as a regular delivery." /></View></View>
      <Card><Summary label="Current score" value={`${runs}/${wickets} · ${formatOver(legalBalls)} ov`} /><Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border }}>Routine runs, extras and wickets stay on the scoring screen.</Text></Card>
      <View><ControlRow title="Penalty / bonus runs" detail="Adjust the total without recording a ball" icon="plus" onPress={() => setPage('adjust')} /><ControlRow title="Retire a batter" detail="Retired hurt or retired out" icon="users" onPress={() => setPage('retire')} /><ControlRow title="View current scorecard" detail="Review the innings before a decision" icon="chart" onPress={onScorecard} /></View>
      <Text variant="overline" tone="muted">INNINGS CONTROL</Text><ControlRow title="End innings early" detail="Close this innings before its automatic limit" icon="flag" color={colors.gold} onPress={() => setPage('innings')} />
      <Text variant="overline" tone="muted">MATCH CONTROL</Text><ControlRow title="End match exceptionally" detail="Walkover, no result, or cancellation" icon="info" color={colors.danger} onPress={() => setPage('end')} />
      <Note>Ending the match cannot be undone. Review the outcome before confirming.</Note>
    </> : page === 'adjust' ? <>
      <Heading title="Adjust the innings." detail="Add umpire-awarded penalty or bonus runs without advancing the ball count." />
      <Text variant="caption" tone="muted">Adjustment type</Text><View style={styles.row}>{(['PENALTY', 'BONUS'] as const).map(value => <Choice key={value} label={value === 'PENALTY' ? 'Penalty' : 'Bonus'} selected={adjustment === value} onPress={() => setAdjustment(value)} />)}</View>
      <Text variant="caption" tone="muted">Runs to add</Text><View style={[styles.row, { gap: 6 }]}>{[1, 2, 3, 4, 5, 6].map(value => <Choice numeric key={value} label={String(value)} selected={amount === value} onPress={() => setAmount(value)} />)}</View>
      <Card style={styles.preview}><Text variant="overline" tone="muted">ADJUSTMENT PREVIEW</Text><View style={[styles.row, { alignItems: 'baseline', marginVertical: 12 }]}><Text style={{ fontFamily: fonts.display, fontSize: 45, lineHeight: 54, color: colors.accent }}>+{amount}</Text><Text>{adjustment === 'PENALTY' ? 'Penalty' : 'Bonus'} runs</Text></View><Summary label="Score after adjustment" value={`${runs + amount}/${wickets} · ${formatOver(legalBalls)} ov`} /></Card>
      <Note>This changes the innings total without adding a delivery or rotating strike.</Note>
    </> : page === 'retire' ? <>
      <Heading title="Retire a batter." detail="Record who leaves the crease and how the innings should treat it." /><Text variant="caption" tone="muted">Batter</Text>
      <View style={{ gap: 8 }}>{[true, false].map(value => <Radio card key={String(value)} title={(value ? striker : nonStriker) ?? 'Select opening players first'} detail={value ? 'Striker' : 'Non-striker'} selected={outIsStriker === value} onPress={() => setOutIsStriker(value)} />)}</View>
      <Text variant="caption" tone="muted">Retirement type</Text><View><Radio title="Retired hurt" detail="Leaves the crease without adding a wicket" selected={retirement === 'RETIRED_HURT'} onPress={() => setRetirement('RETIRED_HURT')} /><Radio title="Retired out" detail="Counts as a wicket" selected={retirement === 'RETIRED_OUT'} onPress={() => setRetirement('RETIRED_OUT')} /></View>
      <Card style={retirement === 'RETIRED_OUT' ? styles.caution : undefined}><Text variant="overline" tone="muted">REVIEW</Text><Text variant="h3" style={{ marginTop: 9 }}>{outIsStriker ? striker : nonStriker} · {retirement === 'RETIRED_OUT' ? 'retired out' : 'retired hurt'}</Text><Text tone="muted" style={{ marginTop: 8 }}>The score {retirement === 'RETIRED_OUT' ? 'becomes' : 'stays'} {runs}/{wickets + (retirement === 'RETIRED_OUT' ? 1 : 0)}. No ball is added. A replacement is required if the innings continues.</Text></Card>
    </> : page === 'innings' ? <>
      <View style={styles.resultSymbol}><DesignIcon name="flag" size={25} color={colors.gold} /></View><Text variant="overline" tone="muted">INNINGS CONTROL</Text><Heading title={`End ${teamName}’s innings?`} detail={`The current innings will close at ${runs}/${wickets} after ${formatOver(legalBalls)} overs. The match then follows its existing innings progression.`} />
      <Card><Summary label="Current score" value={`${runs}/${wickets}`} /><Summary label="Overs remaining" value={formatOver(Math.max(0, overs * 6 - legalBalls))} /><Summary label="Target" value={target ? String(target) : 'Not a chase'} /></Card>
      <Card style={styles.caution}><Text variant="overline" style={{ color: colors.gold }}>CHECK BEFORE CONTINUING</Text><Text tone="muted" style={{ marginTop: 8 }}>No delivery is added. If this closes the final required innings, the existing result rules decide the match outcome.</Text></Card>
    </> : <>
      <Text variant="overline" tone="muted">MATCH CONTROL</Text><Heading title="How should this match end?" detail="Choose the official outcome. This stops live scoring and cannot be undone." />
      <View>{(['WALKOVER', 'NO_RESULT', 'CANCELLED'] as const).map(value => <Radio key={value} title={{ WALKOVER: 'Walkover', NO_RESULT: 'No result', CANCELLED: 'Cancelled' }[value]} detail={{ WALKOVER: 'Award a win to one team', NO_RESULT: 'No winner; existing no-result points apply', CANCELLED: 'Record the match as cancelled' }[value]} selected={resolution === value} onPress={() => setResolution(value)} />)}</View>
      {resolution === 'WALKOVER' ? <View style={{ gap: 8 }}><Text variant="caption" tone="muted">Award the walkover to</Text>{teams.map(team => <Radio card key={team.id} title={team.name} selected={winner === team.id} onPress={() => setWinner(team.id)} />)}</View> : null}
      <Card style={styles.danger}><Text variant="overline" tone="muted">FINAL REVIEW</Text><Text variant="h3" style={{ marginTop: 9 }}>{outcome}{resolution === 'WALKOVER' ? ` · ${teams.find(team => team.id === winner)?.name ?? 'Choose a winning team'}` : ''}</Text><Text tone="muted" style={{ marginTop: 8 }}>{resolution === 'WALKOVER' ? 'The selected team receives the win.' : resolution === 'NO_RESULT' ? 'The match ends without a winner. Existing tournament points rules apply.' : 'The match is recorded as cancelled without a winner.'}</Text></Card>
      <Note>The current ball-by-ball history is retained. Scoring stops after confirmation.</Note>
    </>}
  </Form>;
}

function Heading({ title, detail }: { title: string; detail: string }) { return <View><Text variant="h1">{title}</Text><Text tone="muted" style={{ marginTop: 9 }}>{detail}</Text></View>; }
function Note({ children }: { children: string }) { return <View style={styles.row}><DesignIcon name="info" size={14} color={colors.textMuted} /><Text variant="caption" tone="muted" style={{ flex: 1 }}>{children}</Text></View>; }
function Summary({ label, value }: { label: string; value: string }) { return <View style={styles.summary}><Text variant="caption" tone="muted" style={{ flex: 1 }}>{label}</Text><Text variant="mono">{value}</Text></View>; }
function Choice({ label, selected, onPress, numeric = false }: { label: string; selected: boolean; onPress: () => void; numeric?: boolean }) { return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, selected && styles.selected, numeric && styles.numberChoice, numeric && selected && styles.numberSelected]}><Text variant="bodyStrong" style={{ color: selected ? numeric ? colors.accent : colors.accentInk : colors.text, ...(numeric ? { fontFamily: fonts.mono, fontSize: 17 } : {}) }}>{label}</Text></Pressable>; }
function Radio({ title, detail, selected, onPress, card = false }: { title: string; detail?: string; selected: boolean; onPress: () => void; card?: boolean }) { return <Pressable accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.radioRow, card && styles.selection, card && selected && styles.selectionActive]}>{!card ? <View style={[styles.ring, selected && { borderWidth: 5, borderColor: colors.accent }]} /> : null}<View style={{ flex: 1 }}><Text variant={card ? 'bodyStrong' : 'body'}>{title}</Text>{detail ? <Text variant="caption" tone="muted" style={{ marginTop: 4, fontSize: 10 }}>{detail}</Text> : null}</View>{card && selected ? <DesignIcon name="check" color={colors.accent} /> : null}</Pressable>; }
function ControlRow({ title, detail, icon, color = colors.accent, onPress }: { title: string; detail: string; icon: React.ComponentProps<typeof DesignIcon>['name']; color?: string; onPress: () => void }) {
  const caution = color === colors.gold, danger = color === colors.danger;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={[styles.controlRow, caution && styles.cautionRow, danger && styles.dangerRow]}>
    <View style={[styles.linkIcon, caution && { backgroundColor: '#342e1e', borderColor: '#5b4d2e' }, danger && { backgroundColor: '#38221f', borderColor: '#65453d' }]}><DesignIcon name={icon} size={17} color={color} /></View>
    <View style={{ flex: 1 }}><Text variant="bodyStrong">{title}</Text><Text variant="caption" tone="muted" style={{ marginTop: 4, fontSize: 10 }}>{detail}</Text></View><DesignIcon name="arrow" size={17} />
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.border },
  choice: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#39493b', borderRadius: 10, backgroundColor: colors.surface },
  linkIcon: { width: 37, height: 37, borderWidth: 1, borderColor: '#394b38', borderRadius: 11, backgroundColor: '#1e2e20', alignItems: 'center', justifyContent: 'center' },
  cautionRow: { borderWidth: 1, borderColor: '#544a31', backgroundColor: '#211f17', borderRadius: 13, padding: 15 },
  dangerRow: { borderWidth: 1, borderColor: '#634138', backgroundColor: '#271b19', borderRadius: 13, padding: 15 },
  numberChoice: { minHeight: 45, borderColor: '#41523e', backgroundColor: '#182119', borderRadius: 9 },
  numberSelected: { backgroundColor: '#314b28', borderColor: '#658950' },
  selection: { padding: 13, borderWidth: 1, borderColor: '#3a4b3b', borderRadius: 10, backgroundColor: '#121b14' },
  selectionActive: { borderColor: '#88c264', backgroundColor: '#263b23' },
  resultSymbol: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#433a24', borderWidth: 1, borderColor: '#776238', alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  preview: { backgroundColor: '#1c2c1b', borderColor: '#415e38' },
  caution: { backgroundColor: '#2b271c', borderColor: '#51452d' },
  danger: { backgroundColor: '#2c1e1b', borderColor: '#70493f' },
  summary: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 11 },
  radioRow: { flexDirection: 'row', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border, alignItems: 'center' },
  ring: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: '#6c8062' },
});
