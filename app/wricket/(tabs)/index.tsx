import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, FlatList, Image, Pressable, TextInput } from 'react-native';
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
import { TournamentLogo } from '@/components/wricket/tournament/TournamentLogo';

export default function TournamentsScreen({ embedded = false }: { embedded?: boolean } = {}) {
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
        : null);
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
    <SectionScreen embedded={embedded}>
      {!embedded ? <View style={styles.header}>
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
          <Pressable style={styles.addTournamentButton} onPress={() => router.push('/wricket/tournament/new')}>
            <MaterialCommunityIcons name="plus" size={18} color={colors.accentInk} />
            <Text variant="caption" style={styles.addTournamentText}>ADD TOURNAMENT</Text>
          </Pressable>
        </View>
      </View> : null}

      {syncMessage && (
        <Text variant="caption" tone="muted" style={styles.syncMessage}>{syncMessage}</Text>
      )}

      {auth.session ? <View style={styles.searchSection}>
        <View style={styles.searchBox}><MaterialCommunityIcons name="magnify" size={20} color={colors.textDim} /><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search tournaments to follow" placeholderTextColor={colors.textDim} style={styles.searchInput} /></View>
        {searching ? <Text variant="caption" tone="muted">Searching…</Text> : null}
        {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 ? <Text variant="caption" tone="muted">No tournaments found.</Text> : null}
        {searchResults.map(item => <View key={item.id} style={styles.searchResult}>
          <TournamentLogo name={item.name} uri={item.logoUrl} size={38} />
          <View style={{ flex: 1 }}><Text variant="bodyStrong" numberOfLines={1}>{item.name}</Text><Text variant="caption" tone="muted" numberOfLines={1}>{item.format}{item.location ? ` · ${item.location}` : ''} · {item.teamCount} teams</Text></View>
          <Pressable disabled={followBusyId === item.id || Boolean(item.membershipReason)} onPress={() => void toggleFollow(item)} style={[styles.followButton, item.isFollowing && styles.followButtonActive]}>
            <MaterialCommunityIcons name={item.isFollowing ? 'bell' : 'bell-outline'} size={16} color={item.isFollowing ? colors.accentInk : colors.accent} />
            <Text variant="overline" style={{ color: item.isFollowing ? colors.accentInk : colors.accent }}>{item.membershipReason ?? (item.isFollowing ? 'FOLLOWING' : 'FOLLOW')}</Text>
          </Pressable>
        </View>)}
        {searchHasMore ? <Pressable disabled={searchingMore} onPress={() => void loadMoreSearchResults()} style={styles.searchMore}><Text variant="caption" tone="accent">{searchingMore ? 'LOADING…' : 'LOAD MORE'}</Text></Pressable> : null}
      </View> : null}

      {loading ? <ActivityIndicator color={colors.accent} style={styles.loadingIndicator} /> : tournaments.length === 0 ? (
        <EmptyState onCreate={() => router.push('/wricket/tournament/new')} />
      ) : (
        <FlatList
          data={[...active, ...completed]}
          keyExtractor={t => t.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xxxl,
          }}
          ListHeaderComponent={<View style={styles.listHeading}>
            <View style={styles.listCounts}>
              <Text variant="caption" tone="accent">{active.length} ACTIVE</Text>
              {completed.length > 0 ? <Text variant="caption" tone="dim">{completed.length} COMPLETED</Text> : null}
            </View>
            <Pressable style={styles.addTournamentButton} onPress={() => router.push('/wricket/tournament/new')}>
              <MaterialCommunityIcons name="plus" size={18} color={colors.accentInk} />
              <Text variant="caption" style={styles.addTournamentText}>ADD TOURNAMENT</Text>
            </Pressable>
          </View>}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => {
            const statusLabel = syncLabel(item.syncStatus);
            return <Card
              style={styles.tournamentCard}
              onPress={() =>
                router.push({
                  pathname: '/wricket/tournament/[id]',
                  params: { id: item.id },
                })
              }
            >
              <View style={styles.cardArtwork}>
                {(item.bannerUrl || item.bannerLocalUri) ? (
                  <Image source={{ uri: item.bannerUrl ?? item.bannerLocalUri }} resizeMode="cover" style={styles.cardBanner} />
                ) : (
                  <View style={styles.cardBannerFallback}>
                    <View style={styles.fallbackStripeOne} />
                    <View style={styles.fallbackStripeTwo} />
                    <MaterialCommunityIcons name="cricket" size={42} color={colors.gold} />
                  </View>
                )}
                <View style={styles.cardScrim} />
                <View style={[styles.cardStatus, item.status === 'COMPLETED' && styles.cardStatusComplete]}>
                  <View style={[styles.statusDot, item.status === 'COMPLETED' && styles.statusDotComplete]} />
                  <Text variant="overline" tone={item.status === 'ACTIVE' ? 'accent' : 'muted'}>{item.status}</Text>
                </View>
                <View style={styles.cardFormat}><Text variant="overline" style={{ color: colors.gold }}>{FORMAT_LABEL[item.format]}</Text></View>
              </View>
              <View style={styles.cardBody}>
                <TournamentLogo name={item.name} uri={item.logoUrl ?? item.logoLocalUri} size={56} style={styles.cardLogo} />
                <View style={styles.cardCopy}>
                  <Text variant="h3" numberOfLines={2}>{item.name}</Text>
                  <View style={styles.cardMetaRow}>
                    <MaterialCommunityIcons name="calendar-blank-outline" size={14} color={colors.textMuted} />
                    <Text variant="caption" tone="muted">{formatListDate(item.startDate)}</Text>
                  </View>
                  {item.location ? <View style={styles.cardMetaRow}><MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.textMuted} /><Text variant="caption" tone="muted" numberOfLines={1}>{item.location}</Text></View> : null}
                  {statusLabel ? <Text variant="caption" tone={item.syncStatus === 'FAILED' ? 'default' : 'dim'}>{statusLabel}</Text> : null}
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
            </Card>;
          }}
        />
      )}
    </SectionScreen>
  );
}

function SectionScreen({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  return embedded ? <View style={styles.embeddedScreen}>{children}</View> : <Screen padded={false}>{children}</Screen>;
}

function syncLabel(status: Tournament['syncStatus']): string | undefined {
  if (status === 'SYNCED') return undefined;
  if (status === 'FAILED') return 'Sync failed — tap cloud to retry';
  if (status === 'PENDING') return 'Waiting to sync';
  return 'On this device';
}

function formatListDate(value: number): string {
  return new Date(value).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
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
  embeddedScreen: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  addTournamentButton: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addTournamentText: { color: colors.accentInk, fontSize: 9.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  syncButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  syncMessage: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  searchSection: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs, gap: spacing.sm },
  searchBox: { minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  searchResult: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  followButton: { minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4 },
  followButtonActive: { backgroundColor: colors.accent },
  searchMore: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  listHeading: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.sm },
  listCounts: { flexDirection: 'row', gap: spacing.md },
  loadingIndicator: { marginTop: spacing.lg },
  tournamentCard: { padding: 0, overflow: 'hidden', borderRadius: radius.lg },
  cardArtwork: { height: 124, overflow: 'hidden', backgroundColor: colors.surfaceElevated, position: 'relative' },
  cardBanner: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  cardBannerFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  fallbackStripeOne: { position: 'absolute', top: 0, bottom: 0, left: '20%', width: '18%', backgroundColor: 'rgba(95, 227, 138, 0.05)' },
  fallbackStripeTwo: { position: 'absolute', top: 0, bottom: 0, right: '20%', width: '18%', backgroundColor: 'rgba(95, 227, 138, 0.05)' },
  cardScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8, 11, 9, 0.22)' },
  cardStatus: { position: 'absolute', top: spacing.sm, right: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(8, 11, 9, 0.82)' },
  cardStatusComplete: { backgroundColor: 'rgba(27, 33, 28, 0.9)' },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  statusDotComplete: { backgroundColor: colors.textDim },
  cardFormat: { position: 'absolute', left: spacing.md, bottom: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(8, 11, 9, 0.82)' },
  cardBody: { padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardLogo: { flexShrink: 0, borderWidth: 2, borderColor: colors.borderStrong },
  cardCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
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
