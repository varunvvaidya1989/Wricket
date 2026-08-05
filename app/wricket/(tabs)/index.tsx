import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, FlatList, Pressable, TextInput } from 'react-native';
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
import { tournamentDiscoveryApi, TournamentSearchResult } from '@/lib/supabase/tournamentDiscoveryApi';

export default function TournamentsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TournamentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchingMore, setSearchingMore] = useState(false);
  const [searchCursor, setSearchCursor] = useState<{ name: string; id: string }>();
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [followBusyId, setFollowBusyId] = useState<string>();
  const [followedTournamentIds, setFollowedTournamentIds] = useState<Set<string>>(new Set());

  const loadVisibleTournaments = useCallback(async () => {
    const list = await listTournaments();
    if (!auth.session) return list;
    try {
      const relevantIds = await tournamentDiscoveryApi.listRelevantIds();
      return list.filter(item => !item.cloudId || relevantIds.has(item.cloudId));
    } catch {
      return list.filter(item => !item.cloudId);
    }
  }, [auth.session]);

  const refreshLocal = useCallback(async () => {
    const list = await loadVisibleTournaments();
    setTournaments(list);
    if (auth.session) {
      const cloudIds = list.flatMap(item => item.cloudId ? [item.cloudId] : []);
      setFollowedTournamentIds(await tournamentDiscoveryApi.listFollowedIds(cloudIds));
    }
  }, [auth.session, loadVisibleTournaments]);

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
        const list = await loadVisibleTournaments();
        if (!cancelled) {
          setTournaments(list);
          if (auth.session) {
            const cloudIds = list.flatMap(item => item.cloudId ? [item.cloudId] : []);
            setFollowedTournamentIds(await tournamentDiscoveryApi.listFollowedIds(cloudIds));
          }
          setLoading(false);
          if (auth.session && auth.profile) void syncNow();
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [auth.profile, auth.session, loadVisibleTournaments, syncNow]),
  );

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (searchQuery.trim().length < 2 || !auth.session) {
        setSearchResults([]);
        setSearchCursor(undefined);
        setSearchHasMore(false);
        setSearching(false);
        return;
      }
      setSearching(true);
      tournamentDiscoveryApi.search(searchQuery)
        .then(page => { if (!cancelled) { setSearchResults(page.items); setSearchCursor(page.nextCursor); setSearchHasMore(page.hasMore); } })
        .catch(error => { if (!cancelled) setSyncMessage(error instanceof Error ? error.message : 'Tournament search failed'); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [auth.session, searchQuery]);

  const loadMoreSearchResults = async () => {
    if (!searchHasMore || !searchCursor || searchingMore) return;
    setSearchingMore(true);
    try {
      const page = await tournamentDiscoveryApi.search(searchQuery, searchCursor);
      setSearchResults(current => {
        const ids = new Set(current.map(item => item.id));
        return [...current, ...page.items.filter(item => !ids.has(item.id))];
      });
      setSearchCursor(page.nextCursor);
      setSearchHasMore(page.hasMore);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Could not load more tournaments');
    } finally { setSearchingMore(false); }
  };

  const toggleFollow = async (item: TournamentSearchResult) => {
    if (followBusyId) return;
    setFollowBusyId(item.id);
    setSearchResults(current => current.map(result => result.id === item.id ? { ...result, isFollowing: !item.isFollowing } : result));
    try {
      if (item.isFollowing) await tournamentDiscoveryApi.unfollow(item.id);
      else await tournamentDiscoveryApi.follow(item.id);
    } catch (error) {
      setSearchResults(current => current.map(result => result.id === item.id ? { ...result, isFollowing: item.isFollowing } : result));
      setSyncMessage(error instanceof Error ? error.message : 'Could not update follow status');
    } finally { setFollowBusyId(undefined); }
  };

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

      {auth.session ? <View style={styles.searchSection}>
        <View style={styles.searchBox}><MaterialCommunityIcons name="magnify" size={20} color={colors.textDim} /><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search tournaments to follow" placeholderTextColor={colors.textDim} style={styles.searchInput} /></View>
        {searching ? <Text variant="caption" tone="muted">Searching…</Text> : null}
        {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 ? <Text variant="caption" tone="muted">No tournaments found.</Text> : null}
        {searchResults.map(item => <View key={item.id} style={styles.searchResult}>
          <View style={styles.searchResultIcon}><MaterialCommunityIcons name="trophy-outline" size={18} color={colors.gold} /></View>
          <View style={{ flex: 1 }}><Text variant="bodyStrong" numberOfLines={1}>{item.name}</Text><Text variant="caption" tone="muted" numberOfLines={1}>{item.format}{item.location ? ` · ${item.location}` : ''} · {item.teamCount} teams</Text></View>
          <Pressable disabled={followBusyId === item.id || Boolean(item.membershipReason)} onPress={() => void toggleFollow(item)} style={[styles.followButton, item.isFollowing && styles.followButtonActive]}>
            <MaterialCommunityIcons name={item.isFollowing ? 'bell' : 'bell-outline'} size={16} color={item.isFollowing ? colors.accentInk : colors.accent} />
            <Text variant="overline" style={{ color: item.isFollowing ? colors.accentInk : colors.accent }}>{item.membershipReason ?? (item.isFollowing ? 'FOLLOWING' : 'FOLLOW')}</Text>
          </Pressable>
        </View>)}
        {searchHasMore ? <Pressable disabled={searchingMore} onPress={() => void loadMoreSearchResults()} style={styles.searchMore}><Text variant="caption" tone="accent">{searchingMore ? 'LOADING…' : 'LOAD MORE'}</Text></Pressable> : null}
      </View> : null}

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
                {item.cloudId ? <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={followedTournamentIds.has(item.cloudId) ? `Unfollow ${item.name}` : `Follow ${item.name}`}
                  disabled={followBusyId === item.cloudId}
                  onPress={event => {
                    event.stopPropagation();
                    const cloudId = item.cloudId!;
                    const wasFollowing = followedTournamentIds.has(cloudId);
                    setFollowBusyId(cloudId);
                    setFollowedTournamentIds(current => {
                      const next = new Set(current);
                      if (wasFollowing) next.delete(cloudId); else next.add(cloudId);
                      return next;
                    });
                    const request = wasFollowing ? tournamentDiscoveryApi.unfollow(cloudId) : tournamentDiscoveryApi.follow(cloudId);
                    void request.catch(error => {
                      setFollowedTournamentIds(current => {
                        const next = new Set(current);
                        if (wasFollowing) next.add(cloudId); else next.delete(cloudId);
                        return next;
                      });
                      setSyncMessage(error instanceof Error ? error.message : 'Could not update follow status');
                    }).finally(() => setFollowBusyId(undefined));
                  }}
                  style={[styles.cardFollow, followedTournamentIds.has(item.cloudId) && styles.cardFollowActive]}
                >
                  <MaterialCommunityIcons name={followedTournamentIds.has(item.cloudId) ? 'bell' : 'bell-outline'} size={18} color={followedTournamentIds.has(item.cloudId) ? colors.accentInk : colors.accent} />
                </Pressable> : null}
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
  searchSection: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  searchBox: { minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  searchResult: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  searchResultIcon: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  followButton: { minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4 },
  followButtonActive: { backgroundColor: colors.accent },
  searchMore: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFollow: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  cardFollowActive: { backgroundColor: colors.accent },
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
