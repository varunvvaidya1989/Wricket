import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  activePointEvents,
  replay,
  type ScoringSportId,
} from '@/lib/sports/scoring';
import { sportScoringApi, type SportCloudMatchFeed } from '@/lib/supabase/sportScoringApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportAvatarButton } from './SportProfileDrawer';

export function SportMatchesScreen({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [matches, setMatches] = useState<readonly SportCloudMatchFeed[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'LIVE' | 'COMPLETED'>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const reload = useCallback(() => {
    const connectedSport = auth.profile?.connectedSports.find((sport) => sport.code === presentation.catalogCode);
    const accountId = auth.session?.user.id;
    if (!connectedSport || !accountId) { setMatches([]); setLoading(false); return; }
    setLoading(true);
    setError(undefined);
    void sportScoringApi.listMine({ sportId: connectedSport.id, accountId })
      .then(setMatches)
      .catch(() => setError('Your matches couldn’t be loaded. Check your connection and try again.'))
      .finally(() => setLoading(false));
  }, [auth.profile?.connectedSports, auth.session?.user.id, presentation.catalogCode]);
  useFocusEffect(reload);
  const filteredMatches = matches.filter(match => (filter === 'ALL' || match.status === filter)
    && `${match.participantA} ${match.participantB} ${match.sideAPlayers.join(' ')} ${match.sideBPlayers.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Screen scroll padded={false}>
      <AppHeader title="Matches" eyebrow={config.name.toUpperCase()} right={<SportAvatarButton />} />
      <View style={styles.content}>
        <Button title="Start a match" size="lg" fullWidth onPress={() => router.push(`/${presentation.routeSegment}/match/new` as Href)} style={{ backgroundColor: presentation.accent }} />
        <View style={styles.search}><MaterialCommunityIcons name="magnify" size={22} color={colors.textMuted} /><TextInput accessibilityLabel="Search your matches" value={query} onChangeText={setQuery} placeholder="Search by player or team" placeholderTextColor={colors.textDim} style={styles.input} /></View>
        <View style={styles.filters}>{(['ALL', 'LIVE', 'COMPLETED'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterSelected]}><Text variant="bodyStrong" tone={filter === value ? 'accent' : 'muted'}>{value === 'ALL' ? 'All' : value === 'LIVE' ? 'In progress' : 'Finished'}</Text></Pressable>)}</View>
        <View style={styles.sectionHeading}><Text variant="overline" tone="dim">YOUR MATCHES</Text><Text variant="caption" tone="muted">{filteredMatches.length}</Text></View>
        {error ? <View style={styles.empty}><Text tone="muted">{error}</Text><Button title="Try again" onPress={reload} variant="secondary" /></View> : null}
        {loading && !matches.length ? <View style={styles.empty}><Text tone="muted">Loading your matches…</Text></View> : filteredMatches.length ? filteredMatches.map((match) => {
          const initialServer = match.rulesSnapshot.initial_server === 1 ? 1 : 0;
          const events = activePointEvents(match.events);
          const state = replay(config, events, { initialServer, options: optionsFromMatch(match) });
          return <Pressable key={match.id} accessibilityRole="button" accessibilityLabel={`Open ${match.participantA} versus ${match.participantB}`} onPress={() => router.push(`/${presentation.routeSegment}/match/${match.id}/score` as Href)} style={({ pressed }) => [styles.match, pressed && styles.pressed]}>
            <View style={[styles.status, { backgroundColor: state.isComplete ? colors.goldMuted : `${presentation.accent}16` }]}><MaterialCommunityIcons name={state.isComplete ? 'check' : 'play'} size={19} color={state.isComplete ? colors.gold : presentation.accent} /></View>
            <View style={styles.flex}><Text variant="bodyStrong">{match.sideAPlayers.join(' / ')} vs {match.sideBPlayers.join(' / ')}</Text><Text variant="caption" tone="dim">{match.matchFormat} · {state.isComplete ? 'Final' : 'In progress'}</Text><Text variant="scoreMd">{match.headlineScore || `${state.root.score[0]}-${state.root.score[1]}`}</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
          </Pressable>;
        }) : !error ? <View style={styles.empty}><MaterialCommunityIcons name="scoreboard-outline" size={30} color={colors.textDim} /><Text variant="bodyStrong">{matches.length ? 'No matching games' : 'Your first match starts here'}</Text><Text variant="caption" tone="muted">{matches.length ? 'Try a different name or match filter.' : 'Start a match above. Your scores and results will appear here.'}</Text></View> : null}
      </View>
    </Screen>
  );
}

function optionsFromMatch(match: SportCloudMatchFeed): Record<string, boolean | number | string | undefined> {
  const options = match.rulesSnapshot.options;
  return options && typeof options === 'object' && !Array.isArray(options) ? options as Record<string, boolean | number | string | undefined> : {};
}

const styles = StyleSheet.create({
  search: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 14, backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, minHeight: 52, color: colors.text, fontSize: 15, fontFamily: 'Inter_400Regular' },
  filters: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: radius.lg, backgroundColor: colors.surface },
  filter: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  filterSelected: { backgroundColor: colors.accentMuted },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  sectionHeading: { marginTop: spacing.sm, flexDirection: 'row', justifyContent: 'space-between' },
  match: { minHeight: 74, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  status: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
