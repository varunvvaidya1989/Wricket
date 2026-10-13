import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageIntro, StageList, StageNotice, StagePage, StageRow, StageText, stageColors as colors } from '@/components/sports/platform/StageUI';
import { connectedStageSports, exploreCategory, filterExplore, sportEntry, sportLetters, stageSports, type ExploreCategory, type ExploreItem } from '@/lib/sports/platform/connectedExperience';
import { discoveryExploreItems, loadExploreDirectory } from '@/lib/sports/platform/exploreData';
import { useStageDiscovery } from '@/hooks/useStageDiscovery';

export default function Explore() {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const query = typeof params.q === 'string' ? params.q.slice(0, 120) : '';
  const category = exploreCategory(params.category);
  const discovery = useStageDiscovery();
  const [directory, setDirectory] = useState<{ accountId?: string; query: string; items: ExploreItem[]; partial: boolean }>({ query: '', items: [], partial: false });
  const [searching, setSearching] = useState(false);
  const [revision, setRevision] = useState(0);
  const accountId = auth.session?.user.id;
  const directorySportKey = connectedStageSports(auth.profile?.connectedSports ?? []).map(sport => sport.code).join(',');
  useEffect(() => {
    let active = true;
    if (!accountId) { setDirectory({ query, items: [], partial: false }); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      void loadExploreDirectory(query, directorySportKey.split(',')).then(result => {
        if (active) { setDirectory({ ...result, query, accountId }); setSearching(false); }
      }).catch(() => {
        if (active) { setDirectory({ query, accountId, items: [], partial: true }); setSearching(false); }
      });
    }, query.trim().length >= 2 ? 300 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [accountId, directorySportKey, query, revision]);
  const currentDirectory = directory.accountId === accountId && directory.query === query ? directory.items : [];
  const items = filterExplore([...discoveryExploreItems(discovery.page.items, discovery.upcoming), ...currentDirectory], query, category);
  const retry = () => { discovery.reload(); setRevision(value => value + 1); };
  return <StagePage>
    <StageIntro eyebrow="DISCOVER" title="Find your next game." description="Search by player, team or competition." />
    <View style={{ gap: 8 }}><StageText>Search all sports</StageText><TextInput accessibilityLabel="Search all sports" value={query} onChangeText={q => router.setParams({ q })} maxLength={120} placeholder="Player, team or competition" placeholderTextColor={colors.textDim} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={styles.input} /></View>
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Explore results filter">{(['All', 'Matches', 'Teams', 'Competitions'] as ExploreCategory[]).map(value => <Pressable key={value} accessibilityRole="radio" aria-checked={category === value} accessibilityState={{ checked: category === value }} onPress={() => router.setParams({ category: value })} style={[styles.chip, category === value && styles.selected]}><StageText variant="small" style={{ color: category === value ? colors.accent : colors.textMuted }}>{value}</StageText></Pressable>)}</View>
    <StageText variant="eyebrow" muted>{query.trim() ? 'SEARCH RESULTS' : 'AROUND YOUR GAME'}</StageText>
    {discovery.loading || searching ? <StageNotice>Finding games…</StageNotice> : null}
    {discovery.error || (directory.accountId === accountId && directory.query === query && directory.partial) ? <StageNotice retry={retry}>Some results could not be loaded. Check your connection and try again.</StageNotice> : null}
    {items.length ? <StageList>{items.map(item => <StageRow key={item.key} title={item.title} detail={item.detail} symbol={sportLetters[item.sportCode]} onPress={() => router.push(item.route as Href)} />)}</StageList>
      : !searching && !discovery.loading && !discovery.error && !directory.partial ? <StageNotice>{auth.session ? 'No matching results here yet. Try another name or choose All.' : 'No matching public games here yet. Sign in to search the player and team directory.'}</StageNotice> : null}
    {discovery.page.hasMore ? <StageButton title={discovery.loadingMore ? 'Loading more…' : 'Load more live matches'} onPress={() => { void discovery.loadMore(); }} /> : null}
    {!auth.session ? <StageButton title="Sign in to explore players and teams" onPress={() => router.push({ pathname: '/auth', params: { returnTo: '/explore' } })} /> : null}
    {category === 'Teams' ? <>
      <StageText variant="eyebrow" muted>CLUBS AND TEAMS BY SPORT</StageText>
      <StageList>{stageSports.filter(sport => sport.code !== 'CRICKET').map(sport => <StageRow key={sport.code} title={sport.name} detail="Browse clubs and teams in this sport" symbol={sportLetters[sport.code]} onPress={() => {
        const route = sportEntry(sport.code, Boolean(auth.session), auth.profile?.connectedSports ?? []);
        if (route) router.push(route as Href);
      }} />)}</StageList>
    </> : null}
  </StagePage>;
}

const styles = StyleSheet.create({
  input: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#41543b', borderRadius: 10, backgroundColor: '#111b13', color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 44, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 22, justifyContent: 'center' },
  selected: { backgroundColor: '#24361f', borderColor: '#6b8b53' },
});
