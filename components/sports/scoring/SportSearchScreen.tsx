import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSportFeatureFlag } from '@/hooks/useSportFeatureFlag';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  type ScoringSportId,
} from '@/lib/sports/scoring';
import { sportCompetitionApi, type CloudCompetition } from '@/lib/supabase/sportCompetitionApi';
import { sportScoringApi, type SportCloudMatchFeed } from '@/lib/supabase/sportScoringApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportAvatarButton } from './SportProfileDrawer';

export function SportSearchScreen({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const cloudCompetitions = useSportFeatureFlag(
    'cloud_competitions',
    presentation.catalogCode,
    auth.session?.user.id,
  );
  const [query, setQuery] = useState('');
  const [competitions, setCompetitions] = useState<readonly CloudCompetition[]>([]);
  const [matches, setMatches] = useState<readonly SportCloudMatchFeed[]>([]);

  const reload = useCallback(() => {
    const connectedSport = auth.profile?.connectedSports.find((sport) => sport.code === presentation.catalogCode);
    const accountId = auth.session?.user.id;
    void Promise.all([
      cloudCompetitions.enabled ? sportCompetitionApi.list(presentation.catalogCode) : [],
      connectedSport && accountId ? sportScoringApi.listMine({ sportId: connectedSport.id, accountId }) : [],
    ])
      .then(([storedCompetitions, storedMatches]) => {
        setCompetitions(storedCompetitions);
        setMatches(storedMatches);
      })
      .catch(() => { setCompetitions([]); setMatches([]); });
  }, [auth.profile?.connectedSports, auth.session?.user.id, cloudCompetitions.enabled, presentation.catalogCode]);
  useFocusEffect(reload);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleCompetitions = useMemo(() => competitions.filter((competition) => !normalizedQuery
    || competition.name.toLowerCase().includes(normalizedQuery)
    || competition.lifecycle.toLowerCase().includes(normalizedQuery)), [competitions, normalizedQuery]);
  const visibleMatches = useMemo(() => matches.filter((match) => !normalizedQuery
    || match.sideAPlayers.some((name) => name.toLowerCase().includes(normalizedQuery))
    || match.sideBPlayers.some((name) => name.toLowerCase().includes(normalizedQuery))), [matches, normalizedQuery]);

  return (
    <Screen scroll padded={false}>
      <AppHeader title="Search" eyebrow={config.name.toUpperCase()} right={<SportAvatarButton />} />
      <View style={styles.content}>
        <View style={styles.searchBox}><MaterialCommunityIcons name="magnify" size={21} color={colors.textDim} /><TextInput value={query} onChangeText={setQuery} placeholder="Search competitions, teams, or players" placeholderTextColor={colors.textDim} style={styles.searchInput} /></View>
        <View style={[styles.viewerNote, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="eye-outline" size={22} color={presentation.accent} /><View style={styles.flex}><Text variant="bodyStrong">Spectator viewing</Text><Text variant="caption" tone="muted">Open any competition or started match without gaining scoring controls.</Text></View></View>

        <View style={styles.sectionHeading}><Text variant="overline" tone="dim">COMPETITIONS</Text><Text variant="caption" tone="muted">{visibleCompetitions.length}</Text></View>
        {cloudCompetitions.enabled ? visibleCompetitions.map((competition) => (
          <Pressable
            key={competition.id}
            onPress={() => router.push(`/${presentation.routeSegment}/competition/${competition.id}?mode=view` as Href)}
            style={({ pressed }) => [styles.resultCard, pressed && styles.pressed]}
          >
            <View style={[styles.resultIcon, { backgroundColor: `${presentation.accent}16` }]}><MaterialCommunityIcons name={competition.kind === 'TOURNAMENT' ? 'trophy-outline' : 'table-large'} size={22} color={presentation.accent} /></View>
            <View style={styles.flex}><Text variant="bodyStrong" numberOfLines={1}>{competition.name}</Text><Text variant="caption" tone="muted">{competition.kind} · {competition.lifecycle.replaceAll('_', ' ')}</Text></View>
            <Text variant="overline" style={{ color: presentation.accent }}>VIEW</Text>
          </Pressable>
        )) : <Empty copy={cloudCompetitions.loading ? 'Checking competition availability…' : 'Competitions are not available yet.'} />}
        {cloudCompetitions.enabled && !visibleCompetitions.length ? <Empty copy="No matching competitions." /> : null}

        <View style={styles.sectionHeading}><Text variant="overline" tone="dim">MATCHES</Text><Text variant="caption" tone="muted">{visibleMatches.length}</Text></View>
        {visibleMatches.map((match) => (
            <Pressable key={match.id} onPress={() => router.push(`/${presentation.routeSegment}/match/${match.id}/feed` as Href)} style={({ pressed }) => [styles.resultCard, pressed && styles.pressed]}>
              <View style={[styles.resultIcon, { backgroundColor: `${presentation.accent}16` }]}><MaterialCommunityIcons name={match.status === 'COMPLETED' ? 'check' : 'access-point'} size={22} color={presentation.accent} /></View>
              <View style={styles.flex}><Text variant="bodyStrong" numberOfLines={1}>{match.participantA} vs {match.participantB}</Text><Text variant="caption" tone="muted">{match.matchFormat} · {match.status} · {match.currentSequence} EVENTS</Text></View>
              <Text variant="overline" style={{ color: presentation.accent }}>VIEW</Text>
            </Pressable>
        ))}
        {!visibleMatches.length ? <Empty copy="No matching matches." /> : null}
      </View>
    </Screen>
  );
}

function Empty({ copy }: { copy: string }) {
  return <View style={styles.empty}><MaterialCommunityIcons name="magnify" size={25} color={colors.textDim} /><Text variant="caption" tone="muted">{copy}</Text></View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  searchBox: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: { flex: 1, color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 15 },
  viewerNote: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionHeading: { marginTop: spacing.sm, flexDirection: 'row', justifyContent: 'space-between' },
  resultCard: { minHeight: 72, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resultIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: spacing.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
