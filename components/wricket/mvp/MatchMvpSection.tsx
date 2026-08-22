import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { getMatchMvp, recalculateMatchMvp } from '@/lib/wricket/app/mvp';
import { getMatchXI, getTeam } from '@/lib/wricket/db/repo';
import { getMatchMvpAwards, type MatchMvpResult } from '@/lib/wricket/domain/mvp';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function MatchMvpSection({
  matchId, teamAId, teamBId, completed,
}: { matchId: string; teamAId: string; teamBId: string; completed: boolean }) {
  const [result, setResult] = useState<MatchMvpResult | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [a, b, xiA, xiB] = await Promise.all([
        getTeam(teamAId), getTeam(teamBId), getMatchXI(matchId, teamAId), getMatchXI(matchId, teamBId),
      ]);
      let mvp = await getMatchMvp(matchId);
      if (!mvp && completed) mvp = await recalculateMatchMvp(matchId);
      if (!cancelled) {
        setResult(mvp);
        setNames(Object.fromEntries([...xiA, ...xiB].map(player => [player.userId, player.name])));
        setTeams({ [teamAId]: a?.shortName ?? 'Team A', [teamBId]: b?.shortName ?? 'Team B' });
      }
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [completed, matchId, teamAId, teamBId]);

  if (!completed || !result?.rankings.length) return null;
  const awards = getMatchMvpAwards(result);

  return (
    <View style={styles.container}>
      <Text variant="h2">Match awards</Text>
      <View style={styles.awards}>
        {awards.playerOfTheMatch && (
          <Award title="Player of the Match" icon="trophy-award" row={awards.playerOfTheMatch}
            names={names} teams={teams} score={awards.playerOfTheMatch.totalPoints} scoreLabel="MVP points" />
        )}
        {awards.bestBatter && (
          <Award title="Best Batter of the Match" icon="cricket" row={awards.bestBatter}
            names={names} teams={teams} score={awards.bestBatter.battingPoints} scoreLabel="batting points"
            detail={`${awards.bestBatter.battingBreakdown.runs} runs from ${awards.bestBatter.battingBreakdown.legalBalls} balls`} />
        )}
        {awards.bestBowler && (
          <Award title="Best Bowler of the Match" icon="target" row={awards.bestBowler}
            names={names} teams={teams} score={awards.bestBowler.bowlingPoints} scoreLabel="bowling points"
            detail={`${awards.bestBowler.bowlingBreakdown.wickets}/${awards.bestBowler.bowlingBreakdown.runsConceded} in ${formatOvers(awards.bestBowler.bowlingBreakdown.legalBalls)} overs`} />
        )}
        {awards.bestFielder && (
          <Award title="Best Fielder of the Match" icon="account-star" row={awards.bestFielder}
            names={names} teams={teams} score={awards.bestFielder.fieldingPoints} scoreLabel="fielding points"
            detail={fieldingDetail(awards.bestFielder)} />
        )}
        {awards.fighterOfTheMatch && (
          <Award title="Fighter of the Match" icon="shield-star" row={awards.fighterOfTheMatch}
            names={names} teams={teams} score={awards.fighterOfTheMatch.totalPoints} scoreLabel="MVP points" />
        )}
      </View>
      <Card>
        <Text variant="h3">MVP leaderboard</Text>
        <View style={[styles.row, styles.header]}>
          <Text variant="caption" tone="dim" style={styles.rank}>#</Text>
          <Text variant="caption" tone="dim" style={styles.player}>PLAYER</Text>
          <Text variant="caption" tone="dim" style={styles.points}>BAT</Text>
          <Text variant="caption" tone="dim" style={styles.points}>BOWL</Text>
          <Text variant="caption" tone="dim" style={styles.points}>FIELD</Text>
          <Text variant="caption" tone="dim" style={styles.points}>TOTAL</Text>
        </View>
        {result.rankings.map(row => (
          <View key={row.playerId}>
            <Pressable style={styles.row} onPress={() => setExpanded(expanded === row.playerId ? undefined : row.playerId)}>
              <Text variant="caption" style={styles.rank}>{row.rank}</Text>
              <View style={styles.player}>
                <Text variant="bodyStrong">{names[row.playerId] ?? 'Unknown player'}</Text>
                <Text variant="caption" tone="muted">{teams[row.teamId]}</Text>
              </View>
              <Text variant="caption" style={styles.points}>{row.battingPoints.toFixed(2)}</Text>
              <Text variant="caption" style={styles.points}>{row.bowlingPoints.toFixed(2)}</Text>
              <Text variant="caption" style={styles.points}>{row.fieldingPoints.toFixed(2)}</Text>
              <Text variant="bodyStrong" tone="accent" style={styles.points}>{row.totalPoints.toFixed(2)}</Text>
            </Pressable>
            {expanded === row.playerId && (
              <View style={styles.explanation}>
                {row.explanations.map((item, index) => (
                  <View key={`${item.code}-${index}`} style={styles.explanationRow}>
                    <Text variant="caption" tone="muted" style={{ flex: 1 }}>{item.label}</Text>
                    <Text variant="caption" tone="accent">+{item.points.toFixed(2)}</Text>
                  </View>
                ))}
                {!row.battingBreakdown.strikeRateAdjustmentAvailable && (
                  <Text variant="caption" tone="dim">Delivery-based adjustments were unavailable.</Text>
                )}
              </View>
            )}
          </View>
        ))}
        <Text variant="caption" tone="dim" style={{ marginTop: spacing.md }}>
          Points retain six-decimal precision; values here are rounded to two decimals.
        </Text>
      </Card>
    </View>
  );
}

function Award({ title, icon, row, names, teams, score, scoreLabel, detail }: {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  row: MatchMvpResult['rankings'][number];
  names: Record<string, string>;
  teams: Record<string, string>;
  score: number;
  scoreLabel: string;
  detail?: string;
}) {
  const summary = detail ?? [
    row.battingBreakdown.runs ? `${row.battingBreakdown.runs} runs` : '',
    row.bowlingBreakdown.wickets ? `${row.bowlingBreakdown.wickets} wickets` : '',
    row.fieldingBreakdown.catches ? `${row.fieldingBreakdown.catches} catches` : '',
  ].filter(Boolean).join(' / ');
  return (
    <Card style={styles.award}>
      <MaterialCommunityIcons name={icon} size={24} color={colors.accent} />
      <Text variant="overline" tone="muted" style={{ marginTop: spacing.sm }}>{title}</Text>
      <Text variant="h3">{names[row.playerId] ?? 'Unknown player'}</Text>
      <Text variant="caption" tone="muted">{teams[row.teamId]} / {score.toFixed(2)} {scoreLabel}</Text>
      {!!summary && <Text variant="caption" style={{ marginTop: spacing.sm }}>{summary}</Text>}
    </Card>
  );
}

function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function fieldingDetail(row: MatchMvpResult['rankings'][number]): string {
  const fielding = row.fieldingBreakdown;
  return [
    fielding.catches && `${fielding.catches} ${fielding.catches === 1 ? 'catch' : 'catches'}`,
    fielding.stumpings && `${fielding.stumpings} ${fielding.stumpings === 1 ? 'stumping' : 'stumpings'}`,
    fielding.directHitRunOuts && `${fielding.directHitRunOuts} direct-hit ${fielding.directHitRunOuts === 1 ? 'run-out' : 'run-outs'}`,
    fielding.assistedRunOuts && `${fielding.assistedRunOuts} assisted ${fielding.assistedRunOuts === 1 ? 'run-out' : 'run-outs'}`,
  ].filter(Boolean).join(' / ');
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  awards: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  award: { flex: 1, minWidth: 150, borderColor: colors.accent, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  header: { marginTop: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { width: 24 },
  player: { flex: 1, minWidth: 90 },
  points: { width: 47, textAlign: 'right' },
  explanation: { marginLeft: 24, padding: spacing.md, backgroundColor: colors.surfaceElevated, borderRadius: radius.md },
  explanationRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
});
