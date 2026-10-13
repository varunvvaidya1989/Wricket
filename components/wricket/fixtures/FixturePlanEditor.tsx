import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { Text } from '@/components/wricket/ui/Text';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { fixtureAlgorithms, fixtureFormats, fixturePlan } from '@/lib/wricket/presentation/fixturePlan';
import type { Team } from '@/lib/wricket/domain/types';
import type { PairingAlgorithm, TournamentFormatType } from '@/lib/wricket/fixtures';

export function FixturePlanEditor({ teams, format, algorithm, groups, advance, assignments, saving, error, onFormat, onAlgorithm, onGroups, onAdvance, onAssignments, onGenerate, onNavigate }: {
  teams: Team[]; format: TournamentFormatType; algorithm: PairingAlgorithm; groups: string; advance: string;
  assignments: Record<string, number>; saving: boolean; error?: string;
  onFormat: (value: TournamentFormatType) => void; onAlgorithm: (value: PairingAlgorithm) => void;
  onGroups: (value: string) => void; onAdvance: (value: string) => void;
  onAssignments: (value: Record<string, number>) => void; onGenerate: () => void;
  onNavigate: () => void;
}) {
  const [step, updateStep] = useState<'format' | 'groups' | 'review'>('format');
  const setStep = (value: typeof step) => { updateStep(value); onNavigate(); };
  const [moving, setMoving] = useState<string>();
  const plan = fixturePlan({ teamIds: teams.map(team => team.id), format, algorithm, groups, advance, assignments });
  const names = new Map(teams.map(team => [team.id, team.name]));
  const method = fixtureAlgorithms.find(item => item.value === algorithm)!;
  const assign = (teamId: string, index?: number) => {
    const next = { ...assignments };
    if (index === undefined) delete next[teamId]; else next[teamId] = index;
    onAssignments(next); setMoving(undefined);
  };
  return <View style={styles.stack}>
    {step === 'format' ? <>
      <Text variant="overline" tone="muted">COMPETITION FORMAT</Text>
      {fixtureFormats.map(item => <Selection key={item.value} title={item.title} detail={item.detail} selected={format === item.value} disabled={saving} onPress={() => onFormat(item.value)} />)}
      {format !== 'KNOCKOUT_ONLY' ? <>
        <View style={styles.row}>
          <NumberField label="Groups" value={groups} onChange={onGroups} />
          {format === 'GROUPS_THEN_KNOCKOUT' ? <NumberField label="Advance per group" value={advance} onChange={onAdvance} /> : null}
        </View>
        <Text variant="overline" tone="muted">PAIRING METHOD</Text>
        <View style={styles.chips}>{fixtureAlgorithms.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.title} accessibilityState={{ checked: algorithm === item.value }} disabled={saving} onPress={() => onAlgorithm(item.value)} style={[styles.chip, algorithm === item.value && styles.active]}><Text variant="caption" style={algorithm === item.value && { color: colors.accent }}>{item.title}</Text></Pressable>)}</View>
        <Text tone="muted">{method.detail}</Text>
      </> : <Card><Text variant="h3">{teams.length}-team knockout</Text><Text tone="muted">{plan.rounds.join(' → ')} · {plan.byes} byes · no group stage</Text></Card>}
      {plan.configurationError ? <Text accessibilityRole="alert" style={styles.error}>{plan.configurationError}</Text> : null}
      <Button title={format === 'KNOCKOUT_ONLY' ? 'Review opening bracket' : 'Assign teams to groups'} disabled={Boolean(plan.configurationError) || saving} onPress={() => setStep(format === 'KNOCKOUT_ONLY' ? 'review' : 'groups')} />
    </> : step === 'groups' ? <>
      <Button title="Back to format" variant="ghost" onPress={() => setStep('format')} disabled={saving} />
      <View style={styles.row}><Text variant="h2" style={{ flex: 1 }}>Place every team.</Text><Text variant="mono" tone="accent">{teams.length - plan.unassigned.length}/{teams.length} placed</Text></View>
      {plan.groups.map(group => <Card key={group.index}>
        <View style={styles.row}><Text variant="h3" style={{ flex: 1 }}>{group.name}</Text><Text variant="mono" tone="muted">{group.teamIds.length}/{group.capacity}</Text></View>
        {group.teamIds.length ? group.teamIds.map(teamId => <View key={teamId} style={styles.team}><Text style={{ flex: 1 }}>{names.get(teamId)}</Text><Button title="Move" accessibilityLabel={`Move ${names.get(teamId)}`} size="sm" variant="ghost" disabled={saving} onPress={() => setMoving(moving === teamId ? undefined : teamId)} /></View>) : <Text tone="muted" style={{ marginTop: 12 }}>Choose teams from Unassigned below.</Text>}
      </Card>)}
      <Text variant="overline" tone="muted">UNASSIGNED · {plan.unassigned.length}</Text>
      {plan.unassigned.map(teamId => <Button key={teamId} title={names.get(teamId)!} variant="secondary" onPress={() => setMoving(moving === teamId ? undefined : teamId)} disabled={saving} />)}
      {moving ? <Card style={styles.preview}>
        <Text variant="h3">Place {names.get(moving)}</Text>
        <View style={[styles.chips, { marginTop: 12 }]}>{plan.groups.map(group => <Button key={group.index} title={group.name} size="sm" variant="secondary" disabled={saving || (group.teamIds.length >= group.capacity && assignments[moving] !== group.index)} onPress={() => assign(moving, group.index)} />)}</View>
        {assignments[moving] !== undefined ? <Button title="Move to unassigned" variant="ghost" onPress={() => assign(moving)} disabled={saving} /> : null}
        <Button title="Cancel move" variant="ghost" onPress={() => setMoving(undefined)} />
      </Card> : null}
      {plan.error ? <Text accessibilityRole="alert" style={styles.error}>{plan.error}</Text> : null}
      <Button title="Review fixture plan" disabled={Boolean(plan.error) || saving} onPress={() => setStep('review')} />
    </> : <>
      <Button title="Edit plan" variant="ghost" disabled={saving} onPress={() => setStep(format === 'KNOCKOUT_ONLY' ? 'format' : 'groups')} />
      <Card style={styles.preview}>
        <Text variant="overline" tone="muted">FIXTURE PREVIEW</Text>
        <Text variant="h2" style={{ marginTop: 9 }}>{format === 'KNOCKOUT_ONLY' ? `${teams.length}-team knockout` : `${plan.matchCount} group matches`}</Text>
        <Text tone="muted" style={{ marginTop: 8 }}>{format === 'KNOCKOUT_ONLY' ? `${plan.rounds.join(' → ')} · ${plan.byes} byes. Teams are seeded in the order below, highest against lowest.` : method.detail}</Text>
        {format === 'GROUPS_THEN_KNOCKOUT' ? <Text tone="muted" style={{ marginTop: 8 }}>Planned qualification: {advance} per group. Review qualifiers and choose the bracket after group results are complete.</Text> : null}
      </Card>
      {format === 'KNOCKOUT_ONLY' ? teams.map((team, index) => <Text key={team.id}>{index + 1}. {team.name}</Text>) : plan.previews.map(group => <Card key={group.index}>
        <Text variant="h3">{group.name} · {group.matches.length} matches</Text>
        {algorithm === 'RANDOM_PAIRS' ? <Text tone="muted" style={{ marginTop: 10 }}>{group.teamIds.map(id => names.get(id)).join(' · ')}</Text> : group.matches.map(match => <View key={match.id} style={styles.team}><Text variant="mono" tone="muted">R{match.round}</Text><Text style={{ flex: 1 }}>{names.get(match.teamA)} vs {names.get(match.teamB!)}</Text></View>)}
      </Card>)}
      <Text variant="caption" tone="muted">Nothing is created until you confirm. You can reset the schedule only before a match starts.</Text>
      {plan.error || error ? <Text accessibilityRole="alert" style={styles.error}>{plan.error ?? error}</Text> : null}
      <Button title={format === 'KNOCKOUT_ONLY' ? 'Generate opening bracket' : 'Generate group fixtures'} loading={saving} disabled={Boolean(plan.error) || saving} onPress={onGenerate} />
    </>}
  </View>;
}

function Selection({ title, detail, selected, disabled, onPress }: { title: string; detail: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.selection, selected && styles.active]}><View style={{ flex: 1, gap: 4 }}><Text variant="bodyStrong">{title}</Text><Text variant="caption" tone="muted">{detail}</Text></View>{selected ? <DesignIcon name="check" color={colors.accent} size={18} /> : null}</Pressable>;
}
function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <View style={{ flex: 1, gap: 8 }}><Text variant="caption" tone="muted">{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType="number-pad" style={styles.input} /></View>;
}
const styles = StyleSheet.create({
  stack: { gap: 16 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  selection: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { padding: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  active: { backgroundColor: '#243524', borderColor: '#719d59' },
  input: { minHeight: 46, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, fontFamily: fonts.body, fontSize: 13 },
  team: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border },
  preview: { backgroundColor: '#1b3020', borderColor: '#365439' }, error: { color: colors.danger },
});
