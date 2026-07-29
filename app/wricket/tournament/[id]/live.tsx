import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { CloudLiveTournament, liveMatchApi } from '@/lib/supabase/liveMatchApi';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { formatOver } from '@/lib/wricket/domain/scoring';

export default function TournamentLivePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tournament, setTournament] = useState<CloudLiveTournament>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setTournament((await liveMatchApi.listTournaments()).find(item => item.id === id));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => liveMatchApi.subscribeList(() => void load()), [load]);

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: tournament?.name ?? 'Tournament live' }} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        contentContainerStyle={styles.content}
      >
        <View>
          <Text variant="overline" tone="muted">TOURNAMENT</Text>
          <Text variant="h1">{tournament?.name ?? 'Live matches'}</Text>
          <Text variant="body" tone="muted" style={{ marginTop: spacing.xs }}>
            Live scores, commentary, scorecards and match insights.
          </Text>
        </View>
        {!loading && !tournament && <Text tone="muted">This tournament is no longer live.</Text>}
        {tournament?.matches.map(match => (
          <Card key={match.id} onPress={() => router.push({
            pathname: '/wricket/match/[id]/live',
            params: { id: match.id },
          })}>
            <View style={styles.row}>
              <View style={styles.liveDot} />
              <Text variant="caption" style={{ color: colors.danger }}>LIVE</Text>
              <Text variant="caption" tone="dim" style={{ marginLeft: 'auto' }}>
                {formatOver(match.score.legalBalls)} ov
              </Text>
            </View>
            <View style={styles.matchRow}>
              <View style={{ flex: 1 }}>
                <Text variant="h3">{match.teamA.name}</Text>
                <Text variant="h3">{match.teamB.name}</Text>
              </View>
              <Text variant="h2">{match.score.runs}/{match.score.wickets}</Text>
              <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textMuted} />
            </View>
            {match.venue && <Text variant="caption" tone="muted">{match.venue}</Text>}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.md },
});
