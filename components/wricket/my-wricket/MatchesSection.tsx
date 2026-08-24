import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import {
  PlayerMatchFilter,
  PlayerMatchItem,
  playerMatchCategory,
  playerMatchesApi,
} from '@/lib/supabase/playerMatchesApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const FILTERS: { id: PlayerMatchFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'LIVE', label: 'Live' },
  { id: 'UPCOMING', label: 'Upcoming' },
  { id: 'COMPLETED', label: 'Past' },
];

export function MatchesSection() {
  const auth = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<PlayerMatchItem[]>([]);
  const [filter, setFilter] = useState<PlayerMatchFilter>('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!auth.session) {
      setMatches([]);
      return;
    }
    setLoading(true);
    try {
      setMatches(await playerMatchesApi.listMine(auth.session.user.id));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your matches');
    } finally {
      setLoading(false);
    }
  }, [auth.session]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const visibleMatches = useMemo(
    () => filter === 'ALL' ? matches : matches.filter(match => playerMatchCategory(match.status) === filter),
    [filter, matches],
  );

  if (!auth.session) {
    return <View style={styles.center}>
      <MaterialCommunityIcons name="account-lock-outline" size={34} color={colors.textMuted} />
      <Text variant="h3">Sign in to see your matches</Text>
      <Text tone="muted" style={styles.centerText}>Matches appear here when your player profile is selected in a playing XI.</Text>
      <Pressable onPress={() => router.push('/account')} style={styles.primaryButton}><Text variant="bodyStrong" style={styles.primaryButtonText}>SIGN IN</Text></Pressable>
    </View>;
  }

  return (
    <View style={styles.root}>
      <View style={styles.filters}>
        {FILTERS.map(item => (
          <Pressable key={item.id} onPress={() => setFilter(item.id)} style={[styles.filter, filter === item.id && styles.filterActive]}>
            <Text variant="caption" tone={filter === item.id ? 'accent' : 'muted'} style={styles.filterLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {loading && matches.length === 0 ? <SportStageLoader variant="compact" message="Loading your matches" detail="" /> : null}
        {error ? <Pressable onPress={() => void load()} style={styles.error}><Text variant="caption" tone="danger">{error} · Tap to retry</Text></Pressable> : null}
        {!loading && !error && visibleMatches.length === 0 ? <View style={styles.empty}>
          <MaterialCommunityIcons name="calendar-blank-outline" size={30} color={colors.textDim} />
          <Text variant="h3">{filter === 'ALL' ? 'No matches yet' : `No ${FILTERS.find(item => item.id === filter)?.label.toLowerCase()} matches`}</Text>
          <Text tone="muted" style={styles.centerText}>Your match list will update when you are named in a playing XI.</Text>
        </View> : null}
        <View style={styles.list}>
          {visibleMatches.map(match => (
            <MatchCard
              key={match.id}
              match={match}
              onPress={() => router.push({ pathname: '/wricket/match/[id]/live', params: { id: match.id, tab: 'summary' } })}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function MatchCard({ match, onPress }: { match: PlayerMatchItem; onPress: () => void }) {
  const category = playerMatchCategory(match.status);
  const contribution = match.runs !== undefined || match.wickets !== undefined
    ? `${match.runs ?? 0} runs · ${match.wickets ?? 0} wickets`
    : undefined;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.matchCard, category === 'LIVE' && styles.liveCard, pressed && styles.pressed]}>
      <View style={styles.matchMeta}>
        <View style={[styles.statusChip, category === 'LIVE' && styles.liveChip]}>
          {category === 'LIVE' ? <View style={styles.liveDot} /> : null}
          <Text variant="overline" tone={category === 'LIVE' ? 'accent' : 'muted'}>{category}</Text>
        </View>
        <Text variant="caption" tone="dim">{formatDate(match.scheduledAt)}</Text>
        <Text variant="caption" tone="dim">· {match.format}</Text>
      </View>
      <Text variant="caption" tone="muted" numberOfLines={1}>{match.tournamentName}</Text>
      <View style={styles.teams}>
        <TeamScore name={match.ownTeamName} score={match.ownScore} align="left" />
        <View style={styles.versus}><Text variant="overline" tone="dim">VS</Text></View>
        <TeamScore name={match.opponentName} score={match.opponentScore} align="right" />
      </View>
      <View style={styles.cardFooter}>
        <Text variant="caption" tone={match.result === 'W' ? 'accent' : 'muted'}>
          {match.result ? `${resultLabel(match.result)}${contribution ? ` · ${contribution}` : ''}` : contribution ?? 'Open match details'}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={19} color={colors.accent} />
      </View>
    </Pressable>
  );
}

function TeamScore({ name, score, align }: { name: string; score?: string; align: 'left' | 'right' }) {
  return <View style={[styles.team, align === 'right' && styles.teamRight]}>
    <Text variant="bodyStrong" numberOfLines={1}>{name}</Text>
    <Text variant="h3" tone={score ? 'default' : 'muted'}>{score ?? '—'}</Text>
  </View>;
}

function resultLabel(result: NonNullable<PlayerMatchItem['result']>) {
  return { W: 'Won', L: 'Lost', T: 'Tied', NR: 'No result' }[result];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date TBC';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.md },
  filters: { marginHorizontal: spacing.lg, marginTop: spacing.sm, flexDirection: 'row', padding: spacing.xs, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filter: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  filterActive: { backgroundColor: colors.accentMuted },
  filterLabel: { fontSize: 10 },
  loader: { marginTop: spacing.xl },
  list: { gap: spacing.md },
  matchCard: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  liveCard: { borderColor: colors.accent },
  matchMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated },
  liveChip: { backgroundColor: colors.accentMuted },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  teams: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  team: { flex: 1, gap: spacing.xs },
  teamRight: { alignItems: 'flex-end' },
  versus: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  cardFooter: { minHeight: 34, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pressed: { opacity: 0.74 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  centerText: { textAlign: 'center' },
  primaryButton: { marginTop: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.accent },
  primaryButtonText: { color: colors.accentInk },
  error: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
