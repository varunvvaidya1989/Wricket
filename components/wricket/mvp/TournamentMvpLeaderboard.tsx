import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { getTournamentMvp } from '@/lib/wricket/app/mvp';
import { listTeams, listUsers } from '@/lib/wricket/db/repo';
import type { TournamentMvpRow } from '@/lib/wricket/domain/mvp';
import { mvpApi } from '@/lib/supabase/mvpApi';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export function TournamentMvpLeaderboard({
  tournamentId,
  cloudTournamentId,
  completedMatches = 0,
}: {
  tournamentId: string;
  cloudTournamentId?: string;
  completedMatches?: number;
}) {
  const [rows, setRows] = useState<TournamentMvpRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    const loadLocal = () =>
      Promise.all([getTournamentMvp(tournamentId), listUsers(), listTeams(tournamentId)])
        .then(([leaderboard, users, teamList]) => ({
          leaderboard,
          names: Object.fromEntries(users.map(user => [user.id, user.name])),
          teams: Object.fromEntries(teamList.map(team => [team.id, team.shortName])),
        }));
    const request = cloudTournamentId
      ? mvpApi.getCompleteTournamentLeaderboard(cloudTournamentId).then(leaderboard =>
          leaderboard.length ? {
            leaderboard,
            names: Object.fromEntries(leaderboard.map(row => [row.playerId, row.playerName])),
            teams: Object.fromEntries(leaderboard.flatMap(row =>
              row.teamIds.map((id, index) => [id, row.teamNames[index] ?? id.slice(0, 4)]))),
          } : loadLocal())
      : loadLocal();
    void request
      .then(result => {
        if (cancelled) return;
        setRows(result.leaderboard);
        setNames(result.names);
        setTeams(result.teams);
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load MVP standings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [cloudTournamentId, completedMatches, tournamentId]);
  if (loading) return <Card><SportStageLoader variant="compact" message="Calculating tournament MVP" detail="" /></Card>;
  if (error) return <Card><Text variant="h3">Tournament MVP</Text><Text tone="muted">{error}</Text></Card>;
  if (!rows.length) return (
    <Card>
      <Text variant="h3">Tournament MVP</Text>
      <Text tone="muted" style={{ marginTop: spacing.sm }}>
        MVP standings will appear after eligible completed matches are calculated.
      </Text>
    </Card>
  );
  return (
    <Card>
      <Text variant="h3">Tournament MVP</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
        Progressive standings through {completedMatches} completed match{completedMatches === 1 ? '' : 'es'}.
      </Text>
      <View style={[styles.row, styles.header]}>
        <Text variant="caption" tone="dim" style={styles.rank}>#</Text>
        <Text variant="caption" tone="dim" style={styles.player}>PLAYER</Text>
        <Text variant="caption" tone="dim" style={styles.small}>M</Text>
        <Text variant="caption" tone="dim" style={styles.small}>POTM</Text>
        <Text variant="caption" tone="dim" style={styles.total}>MVP</Text>
      </View>
      {rows.map(row => (
        <View key={row.playerId} style={styles.row}>
          <Text variant="caption" style={styles.rank}>{row.rank}</Text>
          <View style={styles.player}>
            <Text variant="bodyStrong">{names[row.playerId] ?? 'Unknown player'}</Text>
            <Text variant="caption" tone="muted">
              {row.teamIds.map(id => teams[id] ?? id.slice(0, 4)).join(', ')}
              {' · '}B {row.battingPoints.toFixed(2)} · W {row.bowlingPoints.toFixed(2)} · F {row.fieldingPoints.toFixed(2)}
            </Text>
          </View>
          <Text variant="caption" style={styles.small}>{row.matchesPlayed}</Text>
          <Text variant="caption" style={styles.small}>{row.playerOfTheMatchCount}</Text>
          <Text variant="bodyStrong" tone="accent" style={styles.total}>{row.totalPoints.toFixed(2)}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  header: { marginTop: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { width: 24 },
  player: { flex: 1 },
  small: { width: 40, textAlign: 'right' },
  total: { width: 58, textAlign: 'right' },
});
