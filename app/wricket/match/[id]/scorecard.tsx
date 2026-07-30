import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import {
  getMatch,
  getTeam,
  listInningsForMatch,
  listBalls,
  getMatchXI,
  listScoreAdjustments,
  listBatterRetirements,
  MatchXIPlayer,
} from '@/lib/wricket/db/repo';
import { Ball, BatterRetirement, Innings, Match, ScoreAdjustment, Team } from '@/lib/wricket/domain/types';
import { batsmanLineFor, bowlerLineFor } from '@/lib/wricket/domain/stats';
import { formatOver } from '@/lib/wricket/domain/scoring';
import { MatchMvpSection } from '@/components/wricket/mvp/MatchMvpSection';

interface InningsView {
  innings: Innings;
  balls: Ball[];
  adjustments: ScoreAdjustment[];
  retirements: BatterRetirement[];
  batters: MatchXIPlayer[];
  bowlers: MatchXIPlayer[];
  battingTeam: Team;
  bowlingTeam: Team;
}

export default function ScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [views, setViews] = useState<InningsView[]>([]);
  const [tab, setTab] = useState(0);
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!id) return;
        const m = await getMatch(id);
        if (!m) {
          router.replace({
            pathname: '/wricket/match/[id]/live',
            params: { id, tab: 'scorecard' },
          });
          return;
        }
        const [a, b] = await Promise.all([getTeam(m.teamAId), getTeam(m.teamBId)]);
        if (!a || !b) return;

        const innList = await listInningsForMatch(m.id);
        const viewList: InningsView[] = await Promise.all(
          innList.map(async inn => {
            const balls = await listBalls(inn.id);
            const adjustments = await listScoreAdjustments(inn.id);
            const retirements = await listBatterRetirements(inn.id);
            const batters = await getMatchXI(m.id, inn.battingTeamId);
            const bowlers = await getMatchXI(m.id, inn.bowlingTeamId);
            return {
              innings: inn,
              balls,
              adjustments,
              retirements,
              batters,
              bowlers,
              battingTeam: inn.battingTeamId === a.id ? a : b,
              bowlingTeam: inn.bowlingTeamId === a.id ? a : b,
            };
          }),
        );
        if (!cancelled) {
          setMatch(m);
          setTeamA(a);
          setTeamB(b);
          setViews(viewList);
        }
      })();
      return () => { cancelled = true; };
    }, [id, router]),
  );

  if (!match || !teamA || !teamB) {
    return <Screen><Text tone="muted">Loading…</Text></Screen>;
  }

  const result = match.result;
  const resultText = result
    ? formatResult(result, teamA, teamB)
    : 'Match in progress';

  const current = views[tab];

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: 'Scorecard' }} />
      <ScrollView>
        <View style={styles.header}>
          <Text variant="overline" tone="muted">RESULT</Text>
          <Text variant="h2" style={{ marginTop: 4 }}>{resultText}</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            {teamA.name} vs {teamB.name}
          </Text>
        </View>

        {views.length > 1 && (
          <View style={styles.innTabs}>
            {views.map((v, i) => (
              <Pressable
                key={v.innings.id}
                onPress={() => setTab(i)}
                style={[styles.innTab, tab === i && styles.innTabActive]}
              >
                <Text variant="caption" tone={tab === i ? 'default' : 'muted'} style={{ fontWeight: '700' }}>
                  {v.battingTeam.shortName} {v.innings.sequence === 3 || v.innings.sequence === 4 ? 'II' : 'I'}
                </Text>
                <Text variant="bodyStrong">
                  {v.innings.totalRuns}/{v.innings.totalWickets}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {current && <InningsSection view={current} />}
        <MatchMvpSection
          matchId={match.id}
          teamAId={match.teamAId}
          teamBId={match.teamBId}
          completed={match.status === 'COMPLETED'}
        />
      </ScrollView>
    </Screen>
  );
}

function InningsSection({ view }: { view: InningsView }) {
  const { innings, balls, adjustments, retirements, batters, bowlers, battingTeam } = view;
  const batterMap = new Map(batters.map(b => [b.userId, b.name]));
  const bowlerMap = new Map(bowlers.map(b => [b.userId, b.name]));
  const retirementMap = new Map(retirements.map(r => [r.playerId, r]));

  // Compute per-batter lines (only those who batted)
  const batterIds = Array.from(new Set([
    ...balls.flatMap(b => [b.strikerId, b.nonStrikerId]),
    ...retirements.map(r => r.playerId),
  ]));
  const battedIds = batters
    .filter(b => batterIds.includes(b.userId))
    .sort((x, y) => x.battingOrder - y.battingOrder)
    .map(b => b.userId);

  const bowlerIds = Array.from(new Set(balls.map(b => b.bowlerId)));

  return (
    <View style={{ padding: spacing.lg, gap: spacing.lg }}>
      <View>
        <Text variant="h3">{battingTeam.name}</Text>
        <Text variant="caption" tone="muted">
          {innings.totalRuns}/{innings.totalWickets} ({formatOver(innings.totalBalls)} ov)
        </Text>
      </View>

      <Card>
        <Text variant="overline" tone="muted" style={{ marginBottom: spacing.sm }}>BATTING</Text>
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Text variant="caption" tone="muted" style={{ flex: 2 }}>BATTER</Text>
          <Text variant="caption" tone="muted" style={styles.colNum}>R</Text>
          <Text variant="caption" tone="muted" style={styles.colNum}>B</Text>
          <Text variant="caption" tone="muted" style={styles.colNum}>4s</Text>
          <Text variant="caption" tone="muted" style={styles.colNum}>6s</Text>
          <Text variant="caption" tone="muted" style={[styles.colNum, { width: 50 }]}>SR</Text>
        </View>
        {battedIds.map(id => {
          const line = batsmanLineFor(id, balls);
          const retirement = retirementMap.get(id);
          const dismissalText = retirement
            ? retirement.kind === 'RETIRED_OUT'
              ? 'retired out'
              : 'retired hurt'
            : line.dismissalText;
          const isOut = line.isOut || retirement?.kind === 'RETIRED_OUT';
          return (
            <View key={id} style={styles.tableRow}>
              <View style={{ flex: 2 }}>
                <Text variant="bodyStrong">
                  {batterMap.get(id) ?? '—'}
                  {!isOut && ' *'}
                </Text>
                {dismissalText && (
                  <Text variant="caption" tone="muted">{dismissalText}</Text>
                )}
              </View>
              <Text variant="body" style={styles.colNum}>{line.runs}</Text>
              <Text variant="body" style={styles.colNum}>{line.balls}</Text>
              <Text variant="body" style={styles.colNum}>{line.fours}</Text>
              <Text variant="body" style={styles.colNum}>{line.sixes}</Text>
              <Text variant="body" style={[styles.colNum, { width: 50 }]}>{line.strikeRate.toFixed(0)}</Text>
            </View>
          );
        })}
      </Card>

      {adjustments.length > 0 && (
        <Card>
          <Text variant="overline" tone="muted" style={{ marginBottom: spacing.sm }}>ADJUSTMENTS</Text>
          {adjustments.map(item => (
            <View key={item.id} style={styles.tableRow}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {item.kind === 'PENALTY' ? 'Penalty runs' : 'Bonus runs'}
              </Text>
              <Text variant="bodyStrong">+{item.runs}</Text>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <Text variant="overline" tone="muted" style={{ marginBottom: spacing.sm }}>BOWLING</Text>
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Text variant="caption" tone="muted" style={{ flex: 2 }}>BOWLER</Text>
          <Text variant="caption" tone="muted" style={styles.colNum}>O</Text>
          <Text variant="caption" tone="muted" style={styles.colNum}>R</Text>
          <Text variant="caption" tone="muted" style={styles.colNum}>W</Text>
          <Text variant="caption" tone="muted" style={[styles.colNum, { width: 50 }]}>ECON</Text>
        </View>
        {bowlerIds.map(id => {
          const line = bowlerLineFor(id, balls);
          return (
            <View key={id} style={styles.tableRow}>
              <Text variant="bodyStrong" style={{ flex: 2 }}>{bowlerMap.get(id) ?? '—'}</Text>
              <Text variant="body" style={styles.colNum}>{line.oversText}</Text>
              <Text variant="body" style={styles.colNum}>{line.runsConceded}</Text>
              <Text variant="body" style={styles.colNum}>{line.wickets}</Text>
              <Text variant="body" style={[styles.colNum, { width: 50 }]}>{line.economy.toFixed(1)}</Text>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

function formatResult(
  result: NonNullable<Match['result']>,
  teamA: Team,
  teamB: Team,
): string {
  if (result.kind === 'TIE') return 'Match tied';
  if (result.kind === 'NO_RESULT') return 'No result';
  const winner = result.winnerTeamId === teamA.id ? teamA : teamB;
  if (result.kind === 'WIN_BY_RUNS')
    return `${winner.name} won by ${result.margin} runs`;
  if (result.kind === 'WIN_BY_WICKETS')
    return `${winner.name} won by ${result.margin} wickets`;
  if (result.kind === 'WIN_BY_INNINGS')
    return `${winner.name} won by an innings + ${result.margin} runs`;
  return '';
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  innTabs: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  innTab: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  innTabActive: {
    borderColor: colors.accent,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  tableHeader: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  colNum: {
    width: 32,
    textAlign: 'right',
  },
});
