import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import { globalSearchApi, GlobalSearchResult, GlobalSearchType } from '@/lib/supabase/globalSearchApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { WricketAvatarButton } from '@/components/wricket/navigation/WricketProfileDrawer';

const RECENT_SEARCHES_KEY = 'wricket.global-search.recent.v1';
const filters: { id: GlobalSearchType; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'TOURNAMENT', label: 'Tournaments' },
  { id: 'MATCH', label: 'Matches' },
  { id: 'USER', label: 'People' },
  { id: 'SCORER', label: 'Scorers' },
];

export default function GlobalSearchScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const requestRef = useRef(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GlobalSearchType>('ALL');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();

  useFocusEffect(useCallback(() => {
    void AsyncStorage.getItem(RECENT_SEARCHES_KEY).then(value => {
      if (value) setRecent(JSON.parse(value) as string[]);
    }).catch(() => undefined);
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, []));

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      requestRef.current += 1;
      setResults([]);
      setSearching(false);
      setError(undefined);
      return;
    }
    const requestId = ++requestRef.current;
    const timer = setTimeout(() => {
      setSearching(true);
      globalSearchApi.search(clean, filter)
        .then(items => {
          if (requestId !== requestRef.current) return;
          setResults(items);
          setError(undefined);
        })
        .catch(cause => {
          if (requestId !== requestRef.current) return;
          setResults([]);
          setError(cause instanceof Error ? cause.message : 'Search is unavailable');
        })
        .finally(() => { if (requestId === requestRef.current) setSearching(false); });
    }, 280);
    return () => clearTimeout(timer);
  }, [filter, query]);

  const visibleResults = useMemo(() => {
    if (filter !== 'ALL') return results;
    const scorerAccounts = new Set(results.filter(item => item.type === 'SCORER').map(item => item.id));
    return results.filter(item => item.type !== 'USER' || !scorerAccounts.has(item.id));
  }, [filter, results]);

  const runRecent = (value: string) => {
    setQuery(value);
    inputRef.current?.focus();
  };

  const openResult = async (item: GlobalSearchResult) => {
    const nextRecent = [query.trim(), ...recent.filter(value => value.toLowerCase() !== query.trim().toLowerCase())].slice(0, 5);
    setRecent(nextRecent);
    void AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextRecent));
    Keyboard.dismiss();
    router.push(resultHref(item));
  };

  const clearRecent = () => {
    setRecent([]);
    void AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  return <Screen padded={false}>
    <View style={styles.header}>
      <View>
        <Text variant="overline" tone="muted">DISCOVER WRICKET</Text>
        <Text variant="h1">Search</Text>
      </View>
      <WricketAvatarButton />
    </View>
    <View style={styles.searchBox}>
      <MaterialCommunityIcons name="magnify" size={21} color={colors.textDim} />
      <TextInput
        ref={inputRef}
        value={query}
        onChangeText={setQuery}
        placeholder="Teams, matches, people, tournaments"
        placeholderTextColor={colors.textDim}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {query.length ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clearButton}>
        <MaterialCommunityIcons name="close-circle" size={19} color={colors.textMuted} />
      </Pressable> : null}
    </View>
    <View style={styles.filters}>{filters.map(item => <Pressable key={item.id} onPress={() => setFilter(item.id)} style={[styles.filter, filter === item.id && styles.filterActive]}>
      <Text variant="caption" tone={filter === item.id ? 'accent' : 'muted'} style={styles.filterLabel}>{item.label}</Text>
    </Pressable>)}</View>

    {query.trim().length < 2 ? <SearchStart recent={recent} onRecent={runRecent} onClear={clearRecent} /> : searching && !visibleResults.length ? <SportStageLoader variant="compact" message="Searching SportStage" detail="" /> : error ? <View style={styles.center}>
      <MaterialCommunityIcons name="cloud-alert-outline" size={30} color={colors.textMuted} />
      <Text variant="h3">Search is unavailable</Text>
      <Text tone="muted" style={styles.centerText}>Check your connection and try again.</Text>
    </View> : !visibleResults.length ? <View style={styles.center}>
      <MaterialCommunityIcons name="magnify-close" size={32} color={colors.textDim} />
      <Text variant="h3">No results for “{query.trim()}”</Text>
      <Text tone="muted" style={styles.centerText}>Try a team name, tournament, player, scorer, or venue.</Text>
    </View> : <FlatList
      data={visibleResults}
      keyExtractor={item => `${item.type}-${item.id}`}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.results}
      ItemSeparatorComponent={() => <View style={styles.divider} />}
      ListHeaderComponent={<Text variant="overline" tone="dim" style={styles.resultCount}>{visibleResults.length} RESULTS</Text>}
      renderItem={({ item }) => <SearchResultRow item={item} onPress={() => void openResult(item)} />}
    />}
  </Screen>;
}

function SearchStart({ recent, onRecent, onClear }: { recent: string[]; onRecent: (value: string) => void; onClear: () => void }) {
  return <View style={styles.start}>
    {recent.length ? <>
      <View style={styles.startHeader}><Text variant="overline" tone="muted">RECENT SEARCHES</Text><Pressable onPress={onClear}><Text variant="caption" tone="dim">CLEAR</Text></Pressable></View>
      {recent.map(value => <Pressable key={value} onPress={() => onRecent(value)} style={styles.recentRow}><MaterialCommunityIcons name="history" size={19} color={colors.textDim} /><Text style={styles.recentText}>{value}</Text><MaterialCommunityIcons name="arrow-top-left" size={17} color={colors.textDim} /></Pressable>)}
    </> : <View style={styles.center}>
      <View style={styles.searchIllustration}><MaterialCommunityIcons name="magnify" size={34} color={colors.accent} /></View>
      <Text variant="h3">Find anything in Wricket</Text>
      <Text tone="muted" style={styles.centerText}>Search across tournaments, matches, players, members, scorers, and venues.</Text>
    </View>}
  </View>;
}

function SearchResultRow({ item, onPress }: { item: GlobalSearchResult; onPress: () => void }) {
  const meta = resultMeta(item.type);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}>
    {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.resultImage} /> : <View style={[styles.resultIcon, { backgroundColor: meta.background }]}><MaterialCommunityIcons name={meta.icon} size={21} color={meta.color} /></View>}
    <View style={styles.resultMain}><View style={styles.resultTitleLine}><Text variant="bodyStrong" numberOfLines={1} style={styles.resultTitle}>{item.title}</Text>{item.type === 'SCORER' ? <View style={styles.scorerChip}><Text variant="overline" tone="accent" style={styles.scorerChipText}>SCORER</Text></View> : null}</View><Text variant="caption" tone="dim" numberOfLines={1}>{item.subtitle || meta.label}</Text></View>
    <View style={styles.typeLabel}><Text variant="overline" style={{ color: meta.color }}>{meta.label}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={19} color={colors.textDim} />
  </Pressable>;
}

function resultHref(item: GlobalSearchResult): Href {
  if (item.type === 'TOURNAMENT') return { pathname: '/wricket/tournament/[id]', params: { id: item.id } };
  if (item.type === 'MATCH') return { pathname: '/wricket/match/[id]/live', params: { id: item.id, tab: 'summary' } };
  return { pathname: '/wricket/user/[id]', params: { id: item.id } };
}

function resultMeta(type: GlobalSearchResult['type']) {
  if (type === 'TOURNAMENT') return { icon: 'trophy-outline' as const, label: 'TOURNAMENT', color: colors.gold, background: colors.goldMuted };
  if (type === 'MATCH') return { icon: 'scoreboard-outline' as const, label: 'MATCH', color: colors.boundary, background: 'rgba(61,217,214,0.12)' };
  if (type === 'SCORER') return { icon: 'whistle-outline' as const, label: 'SCORER', color: colors.accent, background: colors.accentMuted };
  return { icon: 'account-outline' as const, label: 'PERSON', color: colors.textMuted, background: colors.surfaceElevated };
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  searchBox: { marginHorizontal: spacing.lg, minHeight: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm },
  input: { flex: 1, color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 15, paddingVertical: spacing.md },
  clearButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  filter: { flex: 1, minWidth: 0, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  filterActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  filterLabel: { fontSize: 9 },
  start: { flex: 1, paddingHorizontal: spacing.lg },
  startHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  recentRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  recentText: { flex: 1 },
  center: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  centerText: { textAlign: 'center', lineHeight: 21 },
  searchIllustration: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  results: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  resultCount: { marginVertical: spacing.sm },
  resultRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  resultImage: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  resultIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  resultMain: { flex: 1, minWidth: 0, gap: 3 },
  resultTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  resultTitle: { flexShrink: 1 },
  scorerChip: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.accentMuted },
  scorerChipText: { fontSize: 8 },
  typeLabel: { display: 'none' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 50 },
  pressed: { opacity: 0.68 },
});
