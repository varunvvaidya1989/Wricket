import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { StageButton, StageField, StageText, stageColors as colors } from '@/components/sports/platform/StageUI';
import { ANALYTICS_MODULES, ERROR_OUTCOMES, readObservation } from '@/lib/sports/analytics/modules';
import type { RallyObservation } from '@/lib/sports/analytics/types';
import { pointDetailChoiceLabel, pointDetailOptions, type PointDetail, type ScoringSportId, type Side } from '@/lib/sports/scoring';

export function RallyDetailsForm({ sportId, winner, sideNames, playerIds, playerNames, onConfirm }: {
  sportId: ScoringSportId; winner: Side; sideNames: readonly [string, string];
  playerIds: readonly [readonly string[], readonly string[]]; playerNames: readonly [readonly string[], readonly string[]];
  onConfirm: (detail: PointDetail, observation: RallyObservation) => void;
}) {
  const module = ANALYTICS_MODULES[sportId];
  const [detail, setDetail] = useState<PointDetail>('RALLY_WINNER');
  const [length, setLength] = useState('');
  const [stroke, setStroke] = useState<string>();
  const [zone, setZone] = useState<string>();
  const [serveAttempt, setServeAttempt] = useState<1 | 2>();
  const [actor, setActor] = useState<string>();
  const actorSide = ERROR_OUTCOMES.has(detail) ? (winner === 0 ? 1 : 0) : winner;
  const validLength = length === '' || (/^\d{1,3}$/.test(length) && Number(length) <= 999);
  return <>
    <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
      <StageText variant="eyebrow" muted>POINT OUTCOME</StageText>
      <View style={styles.choices}>{pointDetailOptions(sportId).map(option => <Choice key={option.value} label={pointDetailChoiceLabel(option.value, winner, sideNames)} selected={detail === option.value} onPress={() => { setDetail(option.value); setActor(undefined); }} />)}</View>
      <StageText variant="small" muted>Optional observations. Rally length counts all racket contacts, including the serve. Use 0 for a fault before contact.</StageText>
      <StageField label="Rally length" placeholder="Unknown" keyboardType="number-pad" value={length} onChangeText={setLength} error={validLength ? undefined : 'Enter a whole number from 0 to 999, or leave blank.'} />
      <StageText variant="eyebrow" muted>FINAL STROKE</StageText>
      <View style={styles.choices}><Choice label="Unknown" selected={!stroke} onPress={() => setStroke(undefined)} />{module.strokes.map(item => <Choice key={item} label={item} selected={stroke === item} onPress={() => setStroke(item)} />)}</View>
      <StageText variant="eyebrow" muted>FINAL STROKE POSITION</StageText>
      <View style={styles.choices}><Choice label="Unknown" selected={!zone} onPress={() => setZone(undefined)} />{module.zones.map(item => <Choice key={item} label={item} selected={zone === item} onPress={() => setZone(item)} />)}</View>
      {sportId === 'tennis' || sportId === 'padel' ? <><StageText variant="eyebrow" muted>SERVE THAT STARTED THE RALLY</StageText><View style={styles.choices}><Choice label="Unknown" selected={!serveAttempt} onPress={() => setServeAttempt(undefined)} />{([1, 2] as const).map(item => <Choice key={item} label={`${item === 1 ? 'First' : 'Second'} serve`} selected={serveAttempt === item} onPress={() => setServeAttempt(item)} />)}</View></> : null}
      <StageText variant="eyebrow" muted>{ERROR_OUTCOMES.has(detail) ? 'PLAYER WHO MADE THE ERROR' : 'PLAYER WHO HIT THE FINAL SHOT'}</StageText>
      <View style={styles.choices}><Choice label="Unknown / pair" selected={!actor} onPress={() => setActor(undefined)} />{playerIds[actorSide].map((id, index) => <Choice key={id} label={playerNames[actorSide][index] ?? 'Player'} selected={actor === id} onPress={() => setActor(id)} />)}</View>
    </ScrollView>
    <StageButton title="Record point" primary disabled={!validLength} onPress={() => onConfirm(detail, readObservation({ version: 1, rallyLength: length === '' ? undefined : Number(length), stroke, zone, serveAttempt, actorProfileId: actor }, sportId))} />
  </>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} aria-pressed={selected} onPress={onPress} style={[styles.choice, selected && { borderColor: colors.accent }]}><StageText variant="small" style={selected ? { color: colors.accent } : undefined}>{label}</StageText></Pressable>;
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, justifyContent: 'center', padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
});
