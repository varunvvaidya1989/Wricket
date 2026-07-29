import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { listTournaments } from '@/lib/wricket/db/repo';
import { Tournament, FORMAT_LABEL } from '@/lib/wricket/domain/types';
import { useAuth } from '@/components/providers/AuthProvider';
import { syncTournamentData } from '@/lib/wricket/sync/tournamentSync';

export default function TournamentsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const refreshLocal = useCallback(async () => {
    setTournaments(await listTournaments());
  }, []);

  const syncNow = useCallback(async (forceRetry = false) => {
    if (!auth.session || !auth.profile || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await syncTournamentData(auth.session.user.id, { forceRetry });
      await refreshLocal();
      setSyncMessage(result.failed > 0
        ? `${result.failed} item${result.failed === 1 ? '' : 's'} need attention`
        : 'Cloud sync complete');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Cloud sync failed');
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [auth.profile, auth.session, refreshLocal]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        const list = await listTournaments();
        if (!cancelled) {
          setTournaments(list);
          setLoading(false);
          if (auth.session && auth.profile) void syncNow();
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [auth.profile, auth.session, syncNow]),
  );

  const active = tournaments.filter(t => t.status === 'ACTIVE');
  const completed = tournaments.filter(t => t.status === 'COMPLETED');

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View>
          <Text variant="overline" tone="muted">Wricket</Text>
          <Text variant="h1">Tournaments</Text>
        </View>
        <View style={styles.headerActions}>
          {auth.session && auth.profile && (
            <Pressable style={styles.syncButton} onPress={() => syncNow(true)} disabled={syncing}>
              <MaterialCommunityIcons
                name={syncing ? 'cloud-sync-outline' : 'cloud-check-outline'}
                size={22}
                color={syncing ? colors.textDim : colors.accent}
              />
            </Pressable>
          )}
          <Pressable style={styles.fab} onPress={() => router.push('/wricket/tournament/new')}>
            <MaterialCommunityIcons name="plus" size={24} color={colors.accentInk} />
          </Pressable>
        </View>
      </View>

      {syncMessage && (
        <Text variant="caption" tone="muted" style={styles.syncMessage}>{syncMessage}</Text>
      )}

      {loading ? null : tournaments.length === 0 ? (
        <EmptyState onCreate={() => router.push('/wricket/tournament/new')} />
      ) : (
        <FlatList
          data={[...active, ...completed]}
          keyExtractor={t => t.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xxxl,
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => (
            <Card
              onPress={() =>
                router.push({
                  pathname: '/wricket/tournament/[id]',
                  params: { id: item.id },
                })
              }
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={styles.iconBubble}>
                  <MaterialCommunityIcons name="trophy" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{item.name}</Text>
                  <Text variant="caption" tone="muted">
                    {FORMAT_LABEL[item.format]} ·{' '}
                    {item.status === 'ACTIVE' ? 'Active' : 'Completed'}
                  </Text>
                  <Text variant="caption" tone={item.syncStatus === 'FAILED' ? 'default' : 'dim'}>
                    {syncLabel(item.syncStatus)}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} />
              </View>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}

function syncLabel(status: Tournament['syncStatus']): string {
  if (status === 'SYNCED') return 'Cloud synced';
  if (status === 'FAILED') return 'Sync failed — tap cloud to retry';
  if (status === 'PENDING') return 'Waiting to sync';
  return 'On this device';
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name="trophy-outline" size={36} color={colors.accent} />
      </View>
      <Text variant="h2" style={{ marginTop: spacing.lg }}>
        No tournaments yet
      </Text>
      <Text
        variant="body"
        tone="muted"
        style={{
          textAlign: 'center',
          marginTop: spacing.sm,
          paddingHorizontal: spacing.xl,
        }}
      >
        Start a tournament to track teams, matches, points and stats automatically.
      </Text>
      <Pressable style={styles.emptyCta} onPress={onCreate}>
        <Text variant="bodyStrong" style={{ color: colors.accentInk }}>
          Create tournament
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  syncButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  syncMessage: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
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
  emptyCta: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
  },
});
