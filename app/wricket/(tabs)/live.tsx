import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { CloudLiveTournament, liveMatchApi } from '@/lib/supabase/liveMatchApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export default function LiveScreen() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<CloudLiveTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTournaments(await liveMatchApi.listTournaments());
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load live tournaments');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));
  useEffect(() => liveMatchApi.subscribeList(() => void load()), [load]);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="overline" tone="muted">LIVE NOW</Text>
        <Text variant="h1">Tournaments</Text>
        <Text variant="body" tone="muted" style={{ marginTop: spacing.xs }}>
          Open a tournament to follow its live matches.
        </Text>
      </View>
      {error && (
        <Pressable style={styles.errorCard} onPress={() => void load()}>
          <Text variant="caption">{error} Tap to retry.</Text>
        </Pressable>
      )}
      {!loading && tournaments.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="access-point-off" size={42} color={colors.textDim} />
          <Text variant="h3">No tournaments are live</Text>
          <Text variant="body" tone="muted" style={{ textAlign: 'center' }}>
            Tournaments appear here when one of their matches starts.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => (
            <Card
              onPress={() => router.push({
                pathname: '/wricket/tournament/[id]/live',
                params: { id: item.id },
              })}
            >
              <View style={styles.cardTop}>
                <View style={styles.icon}>
                  <MaterialCommunityIcons name="trophy-outline" size={26} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{item.name}</Text>
                  <Text variant="caption" tone="muted">
                    {item.matches.length} live match{item.matches.length === 1 ? '' : 'es'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textMuted} />
              </View>
              <View style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text variant="caption" style={{ color: colors.danger }}>
                  {item.matches.map(match => `${match.teamA.shortName} vs ${match.teamB.shortName}`).join(' · ')}
                </Text>
              </View>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  errorCard: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
});
