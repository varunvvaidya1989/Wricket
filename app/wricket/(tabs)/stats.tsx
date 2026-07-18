import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { listBalls, listInningsForMatch, listMatches, listUsers } from '@/lib/wricket/db/repo';
import { Ball, Match, User } from '@/lib/wricket/domain/types';

interface PlayerStats {
  userId: string;
  name: string;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  wickets: number;
  legalBalls: number;
  runsConceded: number;
}

interface StatsSnapshot {
  matches: Match[];
  balls: Ball[];
  players: PlayerStats[];
}

export default function StatsScreen() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<StatsSnapshot>({
    matches: [],
    balls: [],
    players: [],
  });
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        const [matches, users] = await Promise.all([listMatches(), listUsers()]);
        const inningsGroups = await Promise.all(matches.map(match => listInningsForMatch(match.id)));
        const innings = inningsGroups.flat();
        const ballGroups = await Promise.all(innings.map(item => listBalls(item.id)));
        const balls = ballGroups.flat();
        const players = buildPlayerStats(users, balls);
        if (!cancelled) {
          setSnapshot({ matches, balls, players });
          setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  const topRuns = snapshot.players
    .filter(player => player.runs > 0)
    .sort((a, b) => b.runs - a.runs || b.sixes - a.sixes)
    .slice(0, 5);
  const topWickets = snapshot.players
    .filter(player => player.wickets > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded)
    .slice(0, 5);
  const topSixes = snapshot.players
    .filter(player => player.sixes > 0)
    .sort((a, b) => b.sixes - a.sixes || b.runs - a.runs)
    .slice(0, 5);
  const bestEconomy = snapshot.players
    .filter(player => player.legalBalls >= 6)
    .sort((a, b) => economy(a) - economy(b) || b.wickets - a.wickets)
    .slice(0, 5);

  const totalRuns = snapshot.balls.reduce((sum, ball) => sum + ball.runsBat + ball.runsExtra, 0);
  const totalWickets = snapshot.balls.filter(ball => ball.isWicket).length;
  const completedMatches = snapshot.matches.filter(match => match.status === 'COMPLETED').length;

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="overline" tone="muted">Insights</Text>
        <Text variant="h1">Stats</Text>
      </View>

      {loading ? null : snapshot.balls.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <MaterialCommunityIcons name="chart-line" size={36} color={colors.accent} />
          </View>
          <Text variant="h2" style={{ marginTop: spacing.lg }}>Play a few matches</Text>
          <Text variant="body" tone="muted" style={{ textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xl }}>
            Personal insights, top scorers and bowling leaderboards appear here once you have some match data.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xxxl,
            gap: spacing.md,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryGrid}>
            <SummaryTile label="MATCHES" value={String(snapshot.matches.length)} sub={`${completedMatches} completed`} />
            <SummaryTile label="RUNS" value={String(totalRuns)} sub={`${snapshot.balls.length} balls`} />
            <SummaryTile label="WICKETS" value={String(totalWickets)} sub="All innings" />
          </View>

          <Leaderboard
            title="Top run scorers"
            icon="cricket"
            rows={topRuns}
            valueFor={player => String(player.runs)}
            metaFor={player => `${player.ballsFaced} balls | SR ${strikeRate(player).toFixed(0)}`}
            onPlayerPress={id =>
              router.push({ pathname: '/wricket/player/[id]', params: { id } })
            }
          />
          <Leaderboard
            title="Top wicket takers"
            icon="bullseye-arrow"
            rows={topWickets}
            valueFor={player => String(player.wickets)}
            metaFor={player => `${formatOvers(player.legalBalls)} ov | Econ ${economy(player).toFixed(1)}`}
            onPlayerPress={id =>
              router.push({ pathname: '/wricket/player/[id]', params: { id } })
            }
          />
          <Leaderboard
            title="Six hitters"
            icon="numeric-6-circle-outline"
            rows={topSixes}
            valueFor={player => String(player.sixes)}
            metaFor={player => `${player.runs} runs | ${player.fours} fours`}
            onPlayerPress={id =>
              router.push({ pathname: '/wricket/player/[id]', params: { id } })
            }
          />
          <Leaderboard
            title="Best economy"
            icon="speedometer-slow"
            rows={bestEconomy}
            valueFor={player => economy(player).toFixed(1)}
            metaFor={player => `${formatOvers(player.legalBalls)} ov | ${player.wickets} wickets`}
            onPlayerPress={id =>
              router.push({ pathname: '/wricket/player/[id]', params: { id } })
            }
          />
        </ScrollView>
      )}
    </Screen>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.summaryTile}>
      <Text variant="caption" tone="dim">{label}</Text>
      <Text variant="h2" style={{ marginTop: spacing.xs }}>{value}</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

function Leaderboard({
  title,
  icon,
  rows,
  valueFor,
  metaFor,
  onPlayerPress,
}: {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  rows: PlayerStats[];
  valueFor: (player: PlayerStats) => string;
  metaFor: (player: PlayerStats) => string;
  onPlayerPress: (id: string) => void;
}) {
  return (
    <Card>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <MaterialCommunityIcons name={icon} size={20} color={colors.accent} />
        </View>
        <Text variant="h3" style={{ flex: 1 }}>{title}</Text>
      </View>
      {rows.length === 0 ? (
        <Text variant="caption" tone="dim" style={{ marginTop: spacing.md }}>
          Not enough data yet.
        </Text>
      ) : (
        <View style={{ marginTop: spacing.sm }}>
          {rows.map((player, index) => (
            <Pressable
              key={player.userId}
              onPress={() => onPlayerPress(player.userId)}
              style={({ pressed }) => [
                styles.playerRow,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text variant="caption" tone="dim" style={styles.rank}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{player.name}</Text>
                <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {metaFor(player)}
                </Text>
              </View>
              <Text variant="h3" tone="accent">{valueFor(player)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

function buildPlayerStats(users: User[], balls: Ball[]): PlayerStats[] {
  const byUser = new Map<string, PlayerStats>();
  for (const user of users) {
    byUser.set(user.id, {
      userId: user.id,
      name: user.name,
      runs: 0,
      ballsFaced: 0,
      fours: 0,
      sixes: 0,
      wickets: 0,
      legalBalls: 0,
      runsConceded: 0,
    });
  }

  const ensurePlayer = (userId: string) => {
    const existing = byUser.get(userId);
    if (existing) return existing;
    const fallback: PlayerStats = {
      userId,
      name: 'Unknown player',
      runs: 0,
      ballsFaced: 0,
      fours: 0,
      sixes: 0,
      wickets: 0,
      legalBalls: 0,
      runsConceded: 0,
    };
    byUser.set(userId, fallback);
    return fallback;
  };

  for (const ball of balls) {
    const batter = ensurePlayer(ball.strikerId);
    batter.runs += ball.runsBat;
    if (ball.extraKind !== 'WIDE') batter.ballsFaced += 1;
    if (ball.runsBat === 4) batter.fours += 1;
    if (ball.runsBat === 6) batter.sixes += 1;

    const bowler = ensurePlayer(ball.bowlerId);
    if (ball.isLegal) bowler.legalBalls += 1;
    bowler.runsConceded += bowlerRunsConceded(ball);
    if (
      ball.isWicket &&
      ball.dismissal &&
      ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'].includes(ball.dismissal.kind)
    ) {
      bowler.wickets += 1;
    }
  }

  return Array.from(byUser.values());
}

function bowlerRunsConceded(ball: Ball): number {
  if (ball.extraKind === 'BYE' || ball.extraKind === 'LEG_BYE') {
    return ball.runsBat;
  }
  return ball.runsBat + ball.runsExtra;
}

function strikeRate(player: PlayerStats): number {
  return player.ballsFaced === 0 ? 0 : (player.runs / player.ballsFaced) * 100;
}

function economy(player: PlayerStats): number {
  return player.legalBalls === 0 ? 0 : (player.runsConceded / player.legalBalls) * 6;
}

function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  rank: {
    width: 24,
    textAlign: 'center',
  },
});
