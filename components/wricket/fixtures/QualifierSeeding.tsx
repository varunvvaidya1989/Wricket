import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { Text } from '@/components/wricket/ui/Text';
import { StandingsCalculator } from '@/lib/wricket/fixtures/standings';
import { knockoutPresets, reorderQualifier, seedQualifiers, type KnockoutPreset } from '@/lib/wricket/fixtures/qualifier-seeding';
import type { GeneratedFixtureSetup } from '@/lib/supabase/fixturesApi';
import type { Team } from '@/lib/wricket/domain/types';
import { colors } from '@/lib/wricket/presentation/design';

export function QualifierSeeding({ setup, teams, saving, onGenerate }: {
  setup: GeneratedFixtureSetup; teams: Team[]; saving: boolean;
  onGenerate: (preset: KnockoutPreset, qualifierTeamIds?: string[]) => Promise<void>;
}) {
  const [preset, setPreset] = useState<KnockoutPreset>('SF_4');
  const [count, setCount] = useState<2 | 4 | 8>(4);
  const [selected, setSelected] = useState<string[]>([]);
  const stage = setup.stages.find(item => item.type === 'GROUP');
  const ranked = setup.groups.filter(group => group.stage_id === stage?.id).map(group => ({
    id: String(group.id), name: String(group.name), rows: new StandingsCalculator().calculate({ id: group.id, stageId: group.stage_id, name: group.name, teamIds: group.team_ids }, setup.matches, stage?.config?.pointsRule, stage?.config?.tiebreakers),
  }));
  const allowed = new Set(ranked.flatMap(group => group.rows.map(row => row.teamId)));
  const cloudTeams = teams.filter((team): team is Team & { cloudId: string } => Boolean(team.cloudId && allowed.has(team.cloudId)));
  const names = new Map(cloudTeams.map(team => [team.cloudId, team.name]));
  const preview = (value: KnockoutPreset) => {
    try { return { qualifiers: seedQualifiers(ranked, value, value === 'CUSTOM' ? selected : undefined), error: undefined }; }
    catch (cause) { return { qualifiers: [], error: cause instanceof Error ? cause.message : 'Review qualification.' }; }
  };
  const plan = preview(preset);
  return <View style={{ gap: 18 }}>
    <Text variant="overline" tone="muted">GROUP RESULTS RECORDED</Text>
    <Text variant="h1">Build the winning bracket.</Text>
    <Text tone="muted">Review standings and choose how the qualifiers reach the championship.</Text>
    <Card>
      <Text variant="overline" tone="muted">GROUP RANKINGS</Text>
      {ranked.map(group => <View key={group.id} style={{ marginTop: 12 }}><Text variant="h3">{group.name}</Text>{group.rows.map(row => <View key={row.teamId} style={styles.row}><Text variant="mono" tone="accent">{row.rank}</Text><Text style={{ flex: 1 }}>{names.get(row.teamId) ?? 'Unavailable team'}</Text><Text variant="caption" tone="muted">{row.points} pts{row.unresolved ? ' · tied' : ''}</Text></View>)}</View>)}
    </Card>
    <Text variant="caption" tone="muted">Bracket preset</Text>
    {knockoutPresets.map(item => {
      const reason = item.value === 'CUSTOM' ? undefined : preview(item.value).error;
      const active = item.value === preset;
      return <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.title} accessibilityState={{ checked: active, disabled: saving || Boolean(reason) }} disabled={saving || Boolean(reason)} onPress={() => { setPreset(item.value); setSelected([]); }} style={[styles.selection, active && styles.active, reason && { opacity: 0.5 }]}><View style={{ flex: 1, gap: 4 }}><Text variant="bodyStrong">{item.title}</Text><Text variant="caption" tone="muted">{reason ?? item.detail}</Text></View>{active ? <DesignIcon name="check" color={colors.accent} size={18} /> : null}</Pressable>;
    })}
    {preset === 'CUSTOM' ? <>
      <View style={styles.chips}>{([2, 4, 8] as const).map(value => <Button key={value} title={`${value} qualifiers`} size="sm" variant={count === value ? 'primary' : 'secondary'} disabled={saving || cloudTeams.length < value} onPress={() => { setCount(value); setSelected([]); }} />)}</View>
      <Text variant="caption" tone="muted">Choose {count} teams, then reorder them. Pairings use adjacent seeds: 1 vs 2, 3 vs 4.</Text>
      {cloudTeams.map(team => <Pressable key={team.cloudId} accessibilityRole="checkbox" accessibilityLabel={`Qualifier ${team.name}`} accessibilityState={{ checked: selected.includes(team.cloudId), disabled: saving || (!selected.includes(team.cloudId) && selected.length >= count) }} disabled={saving || (!selected.includes(team.cloudId) && selected.length >= count)} onPress={() => setSelected(current => current.includes(team.cloudId) ? current.filter(id => id !== team.cloudId) : [...current, team.cloudId])} style={styles.selection}><Text style={{ flex: 1 }}>{team.name}</Text>{selected.includes(team.cloudId) ? <DesignIcon name="check" color={colors.accent} size={18} /> : null}</Pressable>)}
      <Text variant="overline" tone="muted">SEED ORDER · {selected.length}/{count}</Text>
      {selected.map((id, index) => <View key={id} style={styles.row}><Text variant="mono" tone="accent">{index + 1}</Text><Text style={{ flex: 1 }}>{names.get(id)}</Text><Button title="Up" accessibilityLabel={`Move ${names.get(id)} up`} size="sm" variant="ghost" disabled={saving || index === 0} onPress={() => setSelected(current => reorderQualifier(current, index, -1))} /><Button title="Down" accessibilityLabel={`Move ${names.get(id)} down`} size="sm" variant="ghost" disabled={saving || index === selected.length - 1} onPress={() => setSelected(current => reorderQualifier(current, index, 1))} /></View>)}
    </> : null}
    <Card style={{ backgroundColor: '#1b3020', borderColor: '#365439' }}>
      <Text variant="overline" tone="muted">OPENING PAIRINGS</Text>
      {plan.qualifiers.filter((_, index) => index % 2 === 0).map((team, index) => <View key={team.teamId} style={styles.row}><Text style={{ flex: 1 }}>{names.get(team.teamId)} vs {names.get(plan.qualifiers[index * 2 + 1].teamId)}</Text></View>)}
      {plan.error ? <Text accessibilityRole="alert" tone="muted" style={{ marginTop: 9 }}>{plan.error}</Text> : null}
    </Card>
    <Text variant="caption" tone="muted">Nothing is created until you confirm. Reset is available only before a knockout match starts.</Text>
    <Button title="Confirm and generate knockout" loading={saving} disabled={saving || Boolean(plan.error) || (preset === 'CUSTOM' && selected.length !== count)} onPress={() => void onGenerate(preset, preset === 'CUSTOM' ? selected : undefined)} />
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, selection: { flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, gap: 10 }, active: { backgroundColor: '#243524', borderColor: '#719d59' } });
