import AsyncStorage from '@react-native-async-storage/async-storage';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/wricket/ui/Text';
import { globalSearchApi, GlobalSearchResult, GlobalSearchType } from '@/lib/supabase/globalSearchApi';
import { colors } from '@/lib/wricket/presentation/design';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { LinkRow } from '@/components/wricket/ui/DesignRows';

const RECENT_SEARCHES_KEY = 'wricket.global-search.recent.v1';
const filters: { id: GlobalSearchType; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'TOURNAMENT', label: 'Tournaments' },
  { id: 'TEAM', label: 'Teams' },
  { id: 'USER', label: 'Players' },
];

export default function GlobalSearchScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const requestRef = useRef(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GlobalSearchType>('ALL');
  const [suggestions, setSuggestions] = useState<GlobalSearchResult[]>([]);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();

  useFocusEffect(useCallback(() => {
    void AsyncStorage.getItem(RECENT_SEARCHES_KEY).then(value => {
      if (value) setRecent(JSON.parse(value) as string[]);
    }).catch(() => undefined);
    let active = true;
    void globalSearchApi.suggested().then(items => { if (active) setSuggestions(items); }).catch(() => { if (active) setError('Could not load cricket suggestions'); });
    return () => { active = false; };
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
    setSearching(true);
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

  const shown = query.trim().length < 2 ? suggestions.filter(item => filter === 'ALL' || item.type === filter) : visibleResults;
  return <Screen padded={false} edges={['left', 'right', 'bottom']}>
    <View style={styles.content}>
      <Text variant="h1">Find your next game.</Text>
      <View style={styles.searchBox}>
        <DesignIcon name="search" size={18} color={colors.textMuted} />
        <TextInput ref={inputRef} value={query} onChangeText={setQuery} placeholder="Team, tournament or player" accessibilityLabel="Search cricket"
          placeholderTextColor={colors.textDim} returnKeyType="search" autoCapitalize="none" autoCorrect={false} style={styles.input} />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clear}><Text tone="muted">×</Text></Pressable> : null}
      </View>
      <View style={styles.filters}>{filters.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label}
        accessibilityState={{ selected: filter === item.id }} onPress={() => setFilter(item.id)} style={[styles.filter, filter === item.id && styles.filterActive]}>
        <Text style={{ fontSize: 10, lineHeight: 15 }} tone={filter === item.id ? 'accent' : 'muted'}>{item.label}</Text>
      </Pressable>)}</View>
      <Text variant="overline" tone="muted">{query.trim().length < 2 ? 'Around your game' : 'Search results'}</Text>
      {searching ? <SportStageLoader variant="compact" message="Searching cricket" detail="" /> : error ? <Text tone="danger">Search is unavailable. Check your connection and try again.</Text> :
        <FlatList data={shown} keyExtractor={item => `${item.type}-${item.id}`} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 30 }}
          ListEmptyComponent={<View style={styles.empty}><Text variant="h3">No cricket found here yet.</Text><Text variant="caption" tone="muted">Try another name or choose All to widen your search.</Text>
            {recent.length ? recent.map(value => <Pressable key={value} accessibilityRole="button" onPress={() => runRecent(value)}><Text tone="accent">{value}</Text></Pressable>) : null}
            {recent.length ? <Pressable accessibilityRole="button" onPress={clearRecent}><Text tone="muted">Clear recent searches</Text></Pressable> : null}
          </View>}
          renderItem={({ item }) => <LinkRow title={item.title} detail={item.subtitle} icon={item.type === 'TOURNAMENT' ? 'trophy' : item.type === 'TEAM' ? 'users' : item.type === 'MATCH' ? 'ball' : 'bat'} onPress={() => void openResult(item)} />} />}
    </View>
  </Screen>;
}

function resultHref(item: GlobalSearchResult): Href {
  if (item.type === 'TEAM') return { pathname: '/wricket/team/[id]', params: { id: item.id } };
  if (item.type === 'TOURNAMENT') return { pathname: '/wricket/tournament/[id]', params: { id: item.id } };
  if (item.type === 'MATCH') return { pathname: '/wricket/match/[id]/live', params: { id: item.id, tab: 'summary' } };
  return { pathname: '/wricket/user/[id]', params: { id: item.id } };
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 18, paddingTop: 19, gap: 14 },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: '#465e38', backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 20, color: colors.text, paddingVertical: 12 },
  clear: { minWidth: 28, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filter: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 11 },
  filterActive: { backgroundColor: '#233a24', borderColor: '#4e7142' },
  empty: { paddingVertical: 24, gap: 12 },
});
