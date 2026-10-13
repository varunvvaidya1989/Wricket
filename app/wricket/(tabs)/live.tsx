import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/wricket/ui/Text';
import { CloudLiveMatch, LiveMatchCursor, liveMatchApi } from '@/lib/supabase/liveMatchApi';
import { MatchCard } from '@/components/wricket/my-wricket/MatchesSection';
import { playerMatchesApi, PlayerMatchItem, playerMatchCategory } from '@/lib/supabase/playerMatchesApi';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { SectionHeading } from '@/components/wricket/ui/DesignRows';
import { CricketMatchCard } from '@/components/wricket/ui/CricketMatchCard';
import { Button } from '@/components/wricket/ui/Button';
import { MyCricketTasks } from '@/components/wricket/my-wricket/MyCricketTasks';
import { colors } from '@/lib/wricket/presentation/design';

export default function HomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [matches, setMatches] = useState<CloudLiveMatch[]>([]);
  const [personalMatches, setPersonalMatches] = useState<PlayerMatchItem[]>([]);
  const [personalError, setPersonalError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<LiveMatchCursor>();
  const [error, setError] = useState<string>();
  const pageRequestRef = useRef(false);
  const updateTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [livePage, personal] = await Promise.all([liveMatchApi.listPage(),
        auth.session ? playerMatchesApi.listMine(auth.session.user.id).catch(() => null) : Promise.resolve([])]);
      setPersonalError(personal === null);
      setPersonalMatches((personal ?? []).filter(match => playerMatchCategory(match.status) !== 'LIVE').slice(0, 3));
      setMatches(livePage.matches);
      setNextCursor(livePage.nextCursor);
      setHasMore(livePage.hasMore);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh Home');
    } finally { setLoading(false); }
  }, [auth.session]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || pageRequestRef.current) return;
    pageRequestRef.current = true;
    setLoadingMore(true);
    try {
      const page = await liveMatchApi.listPage(nextCursor);
      setMatches(current => {
        const existing = new Set(current.map(match => match.id));
        return [...current, ...page.matches.filter(match => !existing.has(match.id))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load more live matches');
    } finally {
      pageRequestRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor]);

  const refreshLoadedMatch = useCallback((matchId: string) => {
    const existingTimer = updateTimersRef.current.get(matchId);
    if (existingTimer) clearTimeout(existingTimer);
    updateTimersRef.current.set(matchId, setTimeout(() => {
      updateTimersRef.current.delete(matchId);
      void liveMatchApi.getSummary(matchId).then(updated => {
        setMatches(current => updated
          ? current.map(match => match.id === matchId ? { ...updated, eligibilityReason: match.eligibilityReason } : match)
          : current.filter(match => match.id !== matchId));
      });
    }, 150));
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const loadedMatchIds = useMemo(() => matches.map(match => match.id), [matches]);
  const loadedMatchIdsKey = loadedMatchIds.join(',');
  useEffect(() => liveMatchApi.subscribeLoaded(loadedMatchIds, refreshLoadedMatch), [loadedMatchIdsKey, refreshLoadedMatch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    updateTimersRef.current.forEach(timer => clearTimeout(timer));
    updateTimersRef.current.clear();
  }, []);
  const openMatch = (id: string) => router.push({ pathname: '/wricket/match/[id]/live', params: { id } });
  return <Screen padded={false} edges={['left', 'right', 'bottom']}>
    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} contentContainerStyle={styles.content}>
      <View><Text variant="overline" tone="muted">{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</Text>
        <Text variant="h1" style={{ marginTop: 8 }}>Good day for cricket.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Score a match" style={styles.primary}
        onPress={() => auth.session ? router.push('/wricket/match/new') : router.push('/account')}>
        <DesignIcon name="plus" size={17} color={colors.accentInk} /><Text variant="bodyStrong" style={{ color: colors.accentInk }}>Score a match</Text>
      </Pressable>
      <MyCricketTasks compact />
      <SectionHeading title="On the field" action="All matches" onPress={() => router.push({ pathname: '/wricket/my-wricket', params: { section: 'matches' } })} />
      {loading && !matches.length ? <SportStageLoader variant="compact" message="Finding live cricket" detail="" /> : null}
      {matches.map(match => <CricketMatchCard key={match.id} match={match} onPress={() => openMatch(match.id)} />)}
      {!loading && !matches.length && !error ? <StateNotice title="The field is quiet." detail="Live matches will appear here when play begins." /> : null}
      {error ? <StateNotice error title="Live scores are unavailable" detail={error} action={{ label: 'Try again', onPress: () => void load() }} /> : null}
      {hasMore ? <Button title="More matches" variant="secondary" loading={loadingMore} onPress={() => void loadMore()} /> : null}
      <SectionHeading title="Up next and recent" action="View all" onPress={() => router.push({ pathname: '/wricket/my-wricket', params: { section: 'matches' } })} />
      {personalMatches.map(match => <MatchCard key={match.id} match={match} onPress={() => openMatch(match.id)} />)}
      {personalError ? <StateNotice error title="Match history unavailable" detail="Your upcoming and recent matches could not be loaded." action={{ label: 'Try again', onPress: () => void load() }} /> : !loading && !personalMatches.length ? <Text tone="muted">{auth.session ? 'No upcoming or recent matches in your playing history.' : 'Sign in to see your upcoming and recent matches.'}</Text> : null}
    </ScrollView>
  </Screen>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 19, paddingBottom: 30, gap: 14 },
  primary: { minHeight: 46, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.accent },
});
