import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  activePointEvents,
  replay,
  type ScoringSportId,
} from '@/lib/sports/scoring';
import { sportScoringApi, type SportCloudMatchFeed } from '@/lib/supabase/sportScoringApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportAvatarButton } from './SportProfileDrawer';

export function SportStatsScreen({ sportId }: { sportId: ScoringSportId }) {
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [matches, setMatches] = useState<readonly SportCloudMatchFeed[]>([]);
  const reload = useCallback(() => {
    const connectedSport = auth.profile?.connectedSports.find((sport) => sport.code === presentation.catalogCode);
    const accountId = auth.session?.user.id;
    if (!connectedSport || !accountId) { setMatches([]); return; }
    void sportScoringApi.listMine({ sportId: connectedSport.id, accountId })
      .then(setMatches)
      .catch(() => setMatches([]));
  }, [auth.profile?.connectedSports, auth.session?.user.id, presentation.catalogCode]);
  useFocusEffect(reload);

  const stats = useMemo(() => {
    const scoredMatches = matches.flatMap((match) => {
      const initialServer = match.rulesSnapshot.initial_server === 1 ? 1 : 0;
      const options = match.rulesSnapshot.options && typeof match.rulesSnapshot.options === 'object'
        && !Array.isArray(match.rulesSnapshot.options)
        ? match.rulesSnapshot.options as Record<string, boolean | number | string | undefined>
        : {};
      const state = replay(config, activePointEvents(match.events), { initialServer, options });
      return [{ match, state }];
    });
    const completed = scoredMatches.filter(({ state }) => state.isComplete && state.winner !== undefined);
    const wins = new Map<string, number>();
    completed.forEach(({ match, state }) => {
      const winner = state.winner === 0 ? match.sideAPlayers.join(' / ') : match.sideBPlayers.join(' / ');
      wins.set(winner, (wins.get(winner) ?? 0) + 1);
    });
    return {
      completed: completed.length,
      rallies: scoredMatches.reduce((total, { match }) => total + activePointEvents(match.events).length, 0),
      inProgress: matches.length - completed.length,
      leaders: [...wins.entries()].sort((left, right) => right[1] - left[1]),
    };
  }, [config, matches]);

  return (
    <Screen scroll padded={false}>
      <AppHeader title="Stats" eyebrow={config.name.toUpperCase()} right={<SportAvatarButton />} />
      <View style={styles.content}>
        <View style={styles.metricGrid}>
          <Metric value={matches.length} label="MATCHES" accent={presentation.accent} />
          <Metric value={stats.completed} label="COMPLETED" accent={presentation.accent} />
          <Metric value={stats.inProgress} label="IN PROGRESS" accent={presentation.accent} />
          <Metric value={stats.rallies} label="RALLIES" accent={presentation.accent} />
        </View>

        <Text variant="overline" tone="dim">MATCH LEADERS</Text>
        {stats.leaders.length ? (
          <View style={styles.leaderboard}>
            {stats.leaders.map(([name, wins], index) => (
              <View key={name} style={styles.leaderRow}>
                <Text variant="mono" tone="dim">{String(index + 1).padStart(2, '0')}</Text>
                <View style={[styles.avatar, { backgroundColor: `${presentation.accent}16` }]}><Text variant="bodyStrong" style={{ color: presentation.accent }}>{name[0]?.toUpperCase() ?? '?'}</Text></View>
                <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>{name}</Text>
                <Text variant="scoreMd">{wins}</Text>
                <Text variant="overline" tone="dim">WINS</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="chart-box-outline" size={32} color={colors.textDim} />
            <Text variant="bodyStrong">Stats begin after a result</Text>
            <Text variant="caption" tone="muted" style={styles.emptyCopy}>Complete a match to populate wins and leaders.</Text>
          </View>
        )}

        <View style={styles.syncNote}>
          <MaterialCommunityIcons name="cloud-check-outline" size={19} color={colors.textMuted} />
          <Text variant="caption" tone="muted" style={styles.flex}>These stats are calculated from your synchronized SportStage match logs.</Text>
        </View>
      </View>
    </Screen>
  );
}

function Metric({ value, label, accent }: { value: number; label: string; accent: string }) {
  return <View style={styles.metric}><Text variant="scoreLg" style={{ color: accent }}>{value}</Text><Text variant="overline" tone="dim">{label}</Text></View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { width: '47%', flexGrow: 1, minHeight: 112, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', gap: 3 },
  leaderboard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  leaderRow: { minHeight: 66, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, alignItems: 'center', gap: spacing.sm },
  emptyCopy: { textAlign: 'center' },
  syncNote: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
});
