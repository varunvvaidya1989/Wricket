import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Image, Pressable, TextInput } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';


import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/wricket/ui/Text';
import { Card } from '@/components/wricket/ui/Card';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { Button } from '@/components/wricket/ui/Button';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { StatusBadge } from '@/components/wricket/ui/StatusBadge';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { listTournaments } from '@/lib/wricket/db/repo';
import { Tournament, FORMAT_LABEL } from '@/lib/wricket/domain/types';
import { useAuth } from '@/components/providers/AuthProvider';
import { syncTournamentData } from '@/lib/wricket/sync/tournamentSync';
import { tournamentDiscoveryApi, TournamentSearchResult } from '@/lib/supabase/tournamentDiscoveryApi';
import { TournamentLogo } from '@/components/wricket/tournament/TournamentLogo';

export default function WricketEntry() { return <Redirect href="/wricket/live" />; }

export function TournamentsScreen({ embedded = false }: { embedded?: boolean } = {}) {
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
    const relevantIds = await tournamentDiscoveryApi.listRelevantIds();
    return list.filter(item => !item.cloudId || relevantIds.has(item.cloudId));
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
        try {
          const list = await loadVisibleTournaments();
          if (!cancelled) {
            setTournaments(list);
            if (auth.session) {
              const cloudIds = list.flatMap(item => item.cloudId ? [item.cloudId] : []);
              const followedIds = await tournamentDiscoveryApi.listFollowedIds(cloudIds);
              if (!cancelled) setFollowedTournamentIds(followedIds);
            }
            if (!cancelled && auth.session && auth.profile) void syncNow();
          }
        } catch (cause) { if (!cancelled) setSyncMessage(cause instanceof Error ? cause.message : 'Could not load your tournaments. Try again.'); }
        finally { if (!cancelled) setLoading(false); }
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
      await syncNow();
    } catch (error) {
      setSearchResults(current => current.map(result => result.id === item.id ? { ...result, isFollowing: item.isFollowing } : result));
      setSyncMessage(error instanceof Error ? error.message : 'Could not update follow status');
    } finally { setFollowBusyId(undefined); }
  };

  const active = tournaments.filter(t => t.status === 'ACTIVE');
  const completed = tournaments.filter(t => t.status === 'COMPLETED');

  const toggleSavedFollow = async (item: Tournament) => {
    if (!item.cloudId || followBusyId) return;
    const cloudId = item.cloudId;
    const wasFollowing = followedTournamentIds.has(cloudId);
    setFollowBusyId(cloudId);
    try {
      if (wasFollowing) await tournamentDiscoveryApi.unfollow(cloudId);
      else await tournamentDiscoveryApi.follow(cloudId);
      await refreshLocal();
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Could not update follow status'); }
    finally { setFollowBusyId(undefined); }
  };

  return <SectionScreen embedded={embedded}>
    {!embedded ? <WricketHeader title="My tournaments" backTo="/wricket/my-wricket" /> : null}
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void syncNow(true)} tintColor={colors.accent} />}>
      <View style={styles.intro}><Text variant="overline" tone="muted">ORGANISING AND FOLLOWING</Text><Text variant="h1" style={{ marginTop: 9 }}>Your competitions.</Text><Text tone="muted" style={{ marginTop: 9 }}>Fixtures, teams and results in one place.</Text></View>
      <Button title="Create tournament" variant="secondary" onPress={() => router.push('/wricket/tournament/new')} />
      {syncMessage ? <StateNotice error title="Tournament update needs attention" detail={syncMessage} action={{ label: 'Retry update', onPress: () => void syncNow(true) }} /> : null}
      {auth.session ? <View style={styles.searchSection}>
        <View style={styles.searchBox}><DesignIcon name="search" size={18} color={colors.textMuted} /><TextInput accessibilityLabel="Search tournaments to follow" value={searchQuery} onChangeText={setSearchQuery} placeholder="Find a tournament to follow" placeholderTextColor={colors.textDim} style={styles.searchInput} /></View>
        {searching ? <Text variant="caption" tone="muted">Searching…</Text> : null}
        {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 ? <Text variant="caption" tone="muted">No tournaments found.</Text> : null}
        {searchResults.map(item => <Card key={item.id} style={styles.discoveryCard}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open tournament ${item.name}`} onPress={() => router.push({ pathname: '/wricket/tournament/[id]', params: { id: item.id } })} style={styles.identity}>
            <TournamentLogo name={item.name} uri={item.logoUrl} size={38} /><View style={styles.copy}><Text variant="h3">{item.name}</Text><Text variant="caption" tone="muted">{item.format}{item.location ? ` · ${item.location}` : ''} · {item.teamCount} teams</Text></View><DesignIcon name="arrow" size={17} />
          </Pressable>
          <Button size="sm" variant="secondary" title={item.membershipReason ?? (item.isFollowing ? 'Following' : 'Follow')} disabled={Boolean(item.membershipReason) || Boolean(followBusyId)} loading={followBusyId === item.id} onPress={() => void toggleFollow(item)} />
        </Card>)}
        {searchHasMore ? <Button title="Load more tournaments" variant="ghost" loading={searchingMore} onPress={() => void loadMoreSearchResults()} /> : null}
      </View> : null}
      {loading ? <SportStageLoader variant="section" message="Loading your tournaments" detail="Syncing fixtures, teams, and live matches" /> : tournaments.length === 0 ? <StateNotice title="No tournaments yet" detail="Create your competition or find a tournament to follow." /> : (
        [{ label: 'Active tournaments', items: active }, { label: 'Past tournaments', items: completed }].filter(section => section.items.length).map(section => <View key={section.label} style={styles.section}>
          <View style={styles.heading}><Text variant="overline" tone="muted">{section.label}</Text><Text variant="mono" tone="muted">{section.items.length}</Text></View>
          {section.items.map(item => <Card key={item.id} style={styles.tournamentCard}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open tournament ${item.name}`} onPress={() => router.push({ pathname: '/wricket/tournament/[id]', params: { id: item.id } })} style={styles.cardLink}>
              {(item.bannerUrl || item.bannerLocalUri) ? <Image source={{ uri: item.bannerUrl ?? item.bannerLocalUri }} resizeMode="cover" style={styles.banner} /> : null}
              <View style={styles.cardMeta}><Text variant="overline" tone="muted">{FORMAT_LABEL[item.format]} · {item.organizerProfileId === auth.session?.user.id ? 'Organising' : 'Following'}</Text><StatusBadge kind="tournament" status={item.status} /></View>
              <View style={styles.identity}><TournamentLogo name={item.name} uri={item.logoUrl ?? item.logoLocalUri} size={42} /><View style={styles.copy}><Text variant="h3">{item.name}</Text><Text variant="caption" tone="muted" style={{ marginTop: 5 }}>{formatListDate(item.startDate)}{item.location ? ` · ${item.location}` : ''}</Text></View><DesignIcon name="arrow" size={17} /></View>
              {syncLabel(item.syncStatus) ? <Text variant="caption" tone="muted">{syncLabel(item.syncStatus)}</Text> : null}
            </Pressable>
            {item.cloudId && item.organizerProfileId !== auth.session?.user.id ? <Button title={followedTournamentIds.has(item.cloudId) ? 'Unfollow tournament' : 'Follow tournament'} variant="ghost" size="sm" loading={followBusyId === item.cloudId} disabled={Boolean(followBusyId)} onPress={() => void toggleSavedFollow(item)} /> : null}
          </Card>)}
        </View>)
      )}
    </ScrollView>
  </SectionScreen>;
}

function SectionScreen({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  return embedded ? <View style={{ flex: 1 }}>{children}</View> : <Screen padded={false}>{children}</Screen>;
}
function syncLabel(status: Tournament['syncStatus']): string | undefined {
  if (status === 'SYNCED') return undefined;
  if (status === 'FAILED') return 'Sync failed. Retry the tournament update.';
  if (status === 'PENDING') return 'Waiting to sync';
  return 'On this device';
}
function formatListDate(value: number): string {
  return new Date(value).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 19, paddingBottom: 30, gap: 18 },
  intro: { paddingBottom: 1 },
  searchSection: { gap: 12 },
  searchBox: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.body, fontSize: 13, paddingVertical: 12 },
  discoveryCard: { gap: 10 },
  section: { gap: 13 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tournamentCard: { padding: 0, overflow: 'hidden' },
  cardLink: { padding: 16, gap: 14 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, minWidth: 0 },
  banner: { height: 96, borderRadius: 10 },
});
