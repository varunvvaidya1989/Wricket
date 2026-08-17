import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import {
  buildScoreboardView,
  type MatchState,
  type SportConfig,
} from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function RacquetScorePanel({
  config,
  state,
  sideNames,
  accent,
}: {
  config: SportConfig;
  state: MatchState;
  sideNames: readonly [string, string];
  accent: string;
}) {
  const view = useMemo(
    () => buildScoreboardView(config, state, sideNames),
    [config, sideNames, state],
  );

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <View>
          <Text variant="overline" tone="dim">{view.currentUnitLabel}</Text>
          <Text variant="caption" tone="muted">
            {state.isComplete ? 'MATCH COMPLETE' : `${state.eventCount} RALLIES PLAYED`}
          </Text>
        </View>
        <View style={[styles.livePill, { borderColor: state.isComplete ? colors.gold : accent }]}>
          <View style={[styles.liveDot, { backgroundColor: state.isComplete ? colors.gold : accent }]} />
          <Text variant="overline" style={{ color: state.isComplete ? colors.gold : accent }}>
            {state.isComplete ? 'FINAL' : 'LIVE'}
          </Text>
        </View>
      </View>

      <View style={styles.scoreRows}>
        {view.sides.map((side) => (
          <View key={side.side} style={[styles.scoreRow, side.isServing && styles.servingRow]}>
            <View style={styles.serverColumn}>
              {side.isServing ? (
                <View style={[styles.serverMark, { backgroundColor: accent }]}>
                  <MaterialCommunityIcons name="circle-small" size={26} color={colors.accentInk} />
                </View>
              ) : null}
            </View>
            <View style={styles.sideCopy}>
              <Text variant="h3" numberOfLines={1}>{side.name}</Text>
              <Text variant="overline" style={{ color: side.isServing ? accent : colors.textDim }}>
                {side.isServing ? side.serviceDetail ?? 'SERVING' : 'RECEIVING'}
              </Text>
            </View>
            <Text style={styles.pointScore}>{side.currentScore}</Text>
            <View style={styles.unitScore}>
              <Text variant="scoreMd">{side.unitsWon}</Text>
              <Text variant="overline" tone="dim">{view.unitsLabel}</Text>
            </View>
          </View>
        ))}
      </View>

      {view.rounds.length > 0 ? (
        <View style={styles.roundHistory}>
          <Text variant="overline" tone="dim">SCORE BY {view.unitsLabel.slice(0, -1)}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rounds}>
            {view.rounds.map((round, index) => (
              <View key={round.key} style={[styles.round, !round.isComplete && { borderColor: accent }]}>
                <Text variant="overline" tone="dim">{index + 1}</Text>
                <Text variant="mono">{round.score[0]}</Text>
                <View style={styles.roundDivider} />
                <Text variant="mono">{round.score[1]}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  heading: {
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  livePill: {
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  scoreRows: { paddingHorizontal: spacing.sm },
  scoreRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  servingRow: { backgroundColor: 'rgba(255,255,255,0.018)' },
  serverColumn: { width: 30, alignItems: 'center' },
  serverMark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideCopy: { flex: 1, minWidth: 90, gap: 4 },
  pointScore: {
    minWidth: 76,
    paddingHorizontal: spacing.sm,
    color: colors.text,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 43,
    lineHeight: 48,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  unitScore: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  roundHistory: { padding: spacing.md, gap: spacing.sm },
  rounds: { gap: spacing.sm },
  round: {
    minWidth: 54,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    gap: 2,
  },
  roundDivider: { width: 22, height: 1, backgroundColor: colors.border },
});
