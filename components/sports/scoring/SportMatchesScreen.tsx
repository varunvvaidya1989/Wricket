import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageField, StageIntro, StageLiveCard, StageNotice, StagePage, StageText, stageColors as colors } from '@/components/sports/platform/StageUI';
import { useSportMatches } from '@/hooks/useSportMatches';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';

export function SportMatchesScreen({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ status?: string; q?: string }>();
  const status = ['LIVE', 'COMPLETED'].includes(params.status ?? '') ? params.status : 'ALL';
  const query = typeof params.q === 'string' ? params.q.slice(0, 120) : '';
  const { matches, loading, error, retry } = useSportMatches(sportId);
  const name = SPORT_CONFIGS[sportId].name;
  const base = `/${SPORT_PRESENTATION[sportId].routeSegment}`;
  const visible = matches.filter(match => (status === 'ALL' || match.status === status) && `${match.participantA} ${match.participantB} ${match.sideAPlayers.join(' ')} ${match.sideBPlayers.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <StagePage focused title="Matches">
    <StageIntro eyebrow={name.toUpperCase()} title="Your time on court." description="Pick up a live match or revisit a result." />
    <StageButton primary title="Start a match" onPress={() => router.push(`${base}/match/new` as Href)} />
    <StageField label="Search your matches" value={query} onChangeText={q => router.setParams({ q })} placeholder="Search by player or team" maxLength={120} />
    <View accessibilityRole="radiogroup" accessibilityLabel="Match status" style={styles.filters}>{[{ value: 'ALL', label: 'All' }, { value: 'LIVE', label: 'In progress' }, { value: 'COMPLETED', label: 'Finished' }].map(item => <Pressable key={item.value} accessibilityRole="radio" aria-checked={status === item.value} accessibilityState={{ checked: status === item.value }} onPress={() => router.setParams({ status: item.value })} style={[styles.filter, status === item.value && styles.selected]}><StageText variant="small" style={{ color: status === item.value ? colors.accent : colors.textMuted }}>{item.label}</StageText></Pressable>)}</View>
    <StageText variant="eyebrow" muted>YOUR MATCHES</StageText>
    {error ? <StageNotice retry={retry}>{error}</StageNotice> : null}
    {loading ? <StageNotice>Loading your matches…</StageNotice> : null}
    {visible.map(match => <StageLiveCard key={match.id} sport={name} competition={match.competitionName} participantA={match.participantA} participantB={match.participantB} score={match.headlineScore || '—'} status={match.status.replaceAll('_', ' ')} onPress={() => router.push(`${base}/match/${match.id}/${match.status === 'LIVE' && match.createdBy === auth.session?.user.id ? 'score' : 'feed'}` as Href)} />)}
    {!loading && !error && !visible.length ? <StageNotice>{matches.length ? 'No matching matches. Try a different name or filter.' : 'Your first match starts here. Start a match and your scores and results will appear here.'}</StageNotice> : null}
  </StagePage>;
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  filter: { minHeight: 44, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 22, justifyContent: 'center' },
  selected: { backgroundColor: '#24361f', borderColor: '#6b8b53' },
});
