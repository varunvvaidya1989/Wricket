import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  getSportCompetition,
  listSportCompetitions,
  type ScoringSportId,
  type SportCompetitionRecord,
} from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function SportLegacyCompetitionArchiveScreen({
  detail,
  sportId,
}: {
  detail?: boolean;
  sportId: ScoringSportId;
}) {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [competitions, setCompetitions] = useState<readonly SportCompetitionRecord[]>([]);
  const [competition, setCompetition] = useState<SportCompetitionRecord>();
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    const request = detail && id ? getSportCompetition(id).then((value) => setCompetition(value))
      : listSportCompetitions(sportId).then(setCompetitions);
    void request.finally(() => setLoading(false));
  }, [detail, id, sportId]);
  useFocusEffect(reload);

  if (loading) return <Screen><ActivityIndicator color={presentation.accent} /></Screen>;
  if (detail) {
    if (!competition || competition.sportId !== sportId) return <Screen padded={false}><AppHeader title="Legacy competition" back /><ArchiveEmpty /></Screen>;
    const entrants = new Map(competition.entrants.map((entrant) => [entrant.id, entrant.name]));
    return <Screen scroll padded={false}><AppHeader title={competition.name} eyebrow="READ-ONLY DEVICE ARCHIVE" back /><View style={styles.content}><View style={[styles.notice, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="archive-lock-outline" size={25} color={presentation.accent} /><Text variant="caption" tone="muted" style={styles.flex}>This pre-cloud competition is preserved read-only. It cannot create or score new matches.</Text></View><Info label="FORMAT" value={`${competition.kind} · ${competition.matchFormat}`} /><Info label="CREATOR" value={competition.creatorName} /><Info label="POINTS" value={`Win ${competition.pointsRule.win} · Loss ${competition.pointsRule.loss}`} /><Text variant="overline" tone="dim">ENTRANTS · {competition.entrants.length}</Text>{competition.entrants.map((entrant) => <View key={entrant.id} style={styles.card}><Text variant="bodyStrong">{entrant.name}</Text><Text variant="caption" tone="muted">Seed {entrant.seed} · {entrant.entrantType}</Text></View>)}<Text variant="overline" tone="dim">FIXTURES · {competition.fixtures.length}</Text>{competition.fixtures.map((fixture) => <View key={fixture.id} style={styles.card}><Text variant="bodyStrong">{entrants.get(fixture.entrantAId ?? '') ?? 'TBD'} vs {entrants.get(fixture.entrantBId ?? '') ?? 'TBD'}</Text><Text variant="caption" tone="muted">{fixture.roundLabel}{fixture.scheduledAt ? ` · ${new Date(fixture.scheduledAt).toLocaleString()}` : ''}{fixture.court ? ` · ${fixture.court}` : ''}</Text></View>)}</View></Screen>;
  }

  return <Screen scroll padded={false}><AppHeader title="Legacy competitions" eyebrow={`${config.name.toUpperCase()} · READ ONLY`} back /><View style={styles.content}><View style={[styles.notice, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="archive-outline" size={25} color={presentation.accent} /><Text variant="caption" tone="muted" style={styles.flex}>Competitions previously stored on this device remain available as a read-only archive.</Text></View>{competitions.map((item) => <Pressable key={item.id} onPress={() => router.push(`/${presentation.routeSegment}/legacy-competition/${item.id}` as Href)} style={styles.row}><View style={styles.flex}><Text variant="bodyStrong">{item.name}</Text><Text variant="caption" tone="muted">{item.kind} · {item.matchFormat} · {item.entrants.length} entrants</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} /></Pressable>)}{!competitions.length ? <ArchiveEmpty /> : null}</View></Screen>;
}

function Info({ label, value }: { label: string; value: string }) { return <View style={styles.card}><Text variant="overline" tone="dim">{label}</Text><Text variant="bodyStrong">{value}</Text></View>; }
function ArchiveEmpty() { return <View style={styles.empty}><MaterialCommunityIcons name="archive-off-outline" size={30} color={colors.textDim} /><Text variant="bodyStrong">No legacy competition found</Text></View>; }
const styles = StyleSheet.create({ content: { padding: spacing.lg, gap: spacing.md }, notice: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, row: { minHeight: 70, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' }, card: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, gap: 4 }, empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm }, flex: { flex: 1 } });
