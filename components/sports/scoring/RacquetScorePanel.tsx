import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { StageText, stageColors as colors } from '@/components/sports/platform/StageUI';
import { buildScoreboardView, type MatchState, type SportConfig } from '@/lib/sports/scoring';

export function RacquetScorePanel({ config, state, sideNames, accent }: { config: SportConfig; state: MatchState; sideNames: readonly [string, string]; accent: string }) {
  const view = useMemo(() => buildScoreboardView(config, state, sideNames), [config, sideNames, state]);
  return <View style={styles.panel}>
    <StageText variant="eyebrow" muted>{view.currentUnitLabel} · {state.isComplete ? 'MATCH COMPLETE' : `${state.eventCount} ${state.eventCount === 1 ? 'RALLY' : 'RALLIES'} PLAYED`}</StageText>
    <View style={styles.sides}>{view.sides.map(side => <View key={side.side} style={[styles.side, side.isServing && !state.isComplete && styles.serving]}>
      <StageText variant="rowTitle" style={styles.name}>{side.name}</StageText>
      <StageText accessibilityLabel={`${side.name} score ${side.currentScore}`} style={styles.score}>{side.currentScore}</StageText>
      <StageText variant="eyebrow" style={{ color: accent, textAlign: 'center', letterSpacing: 0 }}>{state.isComplete ? state.winner === side.side ? 'WINNER' : 'FINAL' : side.isServing ? `● SERVING${side.serviceDetail ? ` · ${side.serviceDetail}` : ''}` : 'RECEIVING'}</StageText>
      <StageText variant="small" muted style={{ textAlign: 'center' }}>{side.unitsWon} {view.unitsLabel.toLowerCase()} won</StageText>
    </View>)}</View>
    {view.rounds.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rounds}>{view.rounds.map((round, index) => <View key={round.key} style={[styles.round, !round.isComplete && { borderColor: accent }]}><StageText variant="eyebrow" muted>{view.unitsLabel.replace(/S$/, '')} {index + 1}</StageText><StageText>{round.score[0]}–{round.score[1]}</StageText></View>)}</ScrollView> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 16 },
  sides: { flexDirection: 'row', gap: 10 },
  side: { flex: 1, minWidth: 0, minHeight: 180, padding: 16, borderWidth: 1, borderColor: '#42563a', borderRadius: 16, backgroundColor: '#182319', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  serving: { backgroundColor: '#24361f', borderColor: '#6b8b53' },
  name: { textAlign: 'center', fontSize: 12, lineHeight: 18 },
  score: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 44, lineHeight: 52, letterSpacing: -1 },
  rounds: { gap: 8 },
  round: { minWidth: 80, padding: 10, gap: 6, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
});
