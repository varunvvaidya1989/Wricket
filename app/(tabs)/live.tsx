import React, { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, palette } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { listLiveMatches, getTeam } from '@/lib/db/repo';
import { Match, FORMAT_LABEL } from '@/lib/domain/types';

interface LiveMatchView {
  match: Match;
  teamAName: string;
  teamBName: string;
}

export default function LiveScreen() {
  const router = useRouter();
  const [matches, setMatches] = useState<LiveMatchView[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        const list = await listLiveMatches();
        const enriched = await Promise.all(
          list.map(async m => {
            const [a, b] = await Promise.all([getTeam(m.teamAId), getTeam(m.teamBId)]);
            return {
              match: m,
              teamAName: a?.shortName ?? 'A',
              teamBName: b?.shortName ?? 'B',
            };
          }),
        );
        if (!cancelled) {
          setMatches(enriched);
          setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View>
          <Text variant="overline" tone="muted">Live</Text>
          <Text variant="h1">Matches</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Pressable style={styles.bigCta} onPress={() => router.push('/match/new')}>
          <View style={styles.bigCtaIcon}>
            <MaterialCommunityIcons name="plus" size={28} color={colors.accentInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="h3" style={{ color: colors.accentInk }}>Start a match</Text>
            <Text variant="caption" style={{ color: colors.accentInk, opacity: 0.7 }}>
              Set up teams, toss and start scoring
            </Text>
          </View>
        </Pressable>

        {loading ? null : matches.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <Text variant="overline" tone="muted" style={{ marginBottom: spacing.md }}>
              In Progress
            </Text>
            <FlatList
              data={matches}
              keyExtractor={m => m.match.id}
              ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
              renderItem={({ item }) => (
                <Card onPress={() => router.push(`/match/${item.match.id}/score`)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <View style={styles.liveDot} />
                    <View style={{ flex: 1 }}>
                      <Text variant="h3">
                        {item.teamAName} vs {item.teamBName}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {FORMAT_LABEL[item.match.format]}
                      </Text>
                    </View>
                    <Button title="Score" size="sm" onPress={() => router.push(`/match/${item.match.id}/score`)} />
                  </View>
                </Card>
              )}
            />
          </View>
        ) : (
          <Text variant="caption" tone="dim" style={{ marginTop: spacing.xl, textAlign: 'center' }}>
            No live matches. Start one above.
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  bigCta: {
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bigCtaIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.black,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
});
