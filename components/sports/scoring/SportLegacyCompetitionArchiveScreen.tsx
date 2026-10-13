import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StageButton, StageIntro, StageList, StageNotice, StagePage, StageRow, stageColors as colors } from '@/components/sports/platform/StageUI';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { OrganiserText as Text } from '@/components/sports/platform/OrganiserText';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  getSportCompetition,
  listSportCompetitions,
  type ScoringSportId,
  type SportCompetitionRecord,
} from '@/lib/sports/scoring';
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
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const reload = useCallback(() => {
    const request = ++generation.current;
    setLoading(true);
    setError(undefined);
    setCompetition(undefined);
    setCompetitions([]);
    void (async () => {
      try {
        if (detail) {
          const value = id ? await getSportCompetition(id) : undefined;
          if (request === generation.current) setCompetition(value?.sportId === sportId ? value : undefined);
        } else {
          const values = await listSportCompetitions(sportId);
          if (request === generation.current) setCompetitions(values);
        }
      } catch {
        if (request === generation.current) setError('Saved competitions could not be read. Your archive has not been changed.');
      } finally {
        if (request === generation.current) setLoading(false);
      }
    })();
  }, [detail, id, sportId]);
  useFocusEffect(useCallback(() => { reload(); return () => { generation.current++; }; }, [reload]));
  const current = () => router.push(`/${presentation.routeSegment}/competitions` as Href);
  const browse = <StageButton title="Browse current competitions" onPress={current} />;
  if (error) return <StagePage focused title="Archive" eyebrow={config.name.toUpperCase()}><StageIntro title="Your archive is unavailable" description="Try reading the saved records again." /><StageNotice retry={reload}>{error}</StageNotice>{browse}</StagePage>;
  if (loading) return <StagePage focused title="Archive" eyebrow={config.name.toUpperCase()}><SportStageLoader message={`Loading ${config.name} archive`} detail="Restoring saved competitions and match history" accent={presentation.accent} /></StagePage>;
  if (detail) {
    if (!competition || competition.sportId !== sportId) return <StagePage focused title="Archived competition" eyebrow={config.name.toUpperCase()}><StageIntro title="Archive not found" description="This record is not saved for this sport on this device." />{browse}</StagePage>;
    const entrants = new Map(competition.entrants.map((entrant) => [entrant.id, entrant.name]));
    return <StagePage focused title="Archived competition" eyebrow={config.name.toUpperCase()}><StageIntro eyebrow="READ-ONLY DEVICE ARCHIVE" title={competition.name} description={`${config.name} · ${competition.kind} · ${competition.matchFormat}`} /><View style={styles.content}><View style={[styles.notice, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="archive-lock-outline" size={25} color={presentation.accent} /><Text variant="caption" tone="muted" style={styles.flex}>This older competition is preserved read-only on this device. It cannot create or score new matches.</Text></View><Info label="FORMAT" value={`${competition.kind} · ${competition.matchFormat}`} /><Info label="CREATOR" value={competition.creatorName} /><Info label="POINTS" value={`Win ${competition.pointsRule.win} · Loss ${competition.pointsRule.loss}`} /><Text variant="overline" tone="dim">ENTRANTS · {competition.entrants.length}</Text>{competition.entrants.map((entrant) => <View key={entrant.id} style={styles.card}><Text variant="bodyStrong">{entrant.name}</Text><Text variant="caption" tone="muted">Seed {entrant.seed} · {entrant.entrantType}</Text></View>)}{!competition.entrants.length ? <StageNotice>No entrants were saved in this archive.</StageNotice> : null}<Text variant="overline" tone="dim">FIXTURES · {competition.fixtures.length}</Text>{competition.fixtures.map((fixture) => <View key={fixture.id} style={styles.card}><Text variant="bodyStrong">{entrants.get(fixture.entrantAId ?? '') ?? 'TBD'} vs {entrants.get(fixture.entrantBId ?? '') ?? 'TBD'}</Text><Text variant="caption" tone="muted">{fixture.roundLabel}{fixture.scheduledAt ? ` · ${new Date(fixture.scheduledAt).toLocaleString()}` : ''}{fixture.court ? ` · ${fixture.court}` : ''}</Text></View>)}</View>{!competition.fixtures.length ? <StageNotice>No fixtures were saved in this archive.</StageNotice> : null}{browse}</StagePage>;
  }

  return <StagePage focused title="Archive" eyebrow={config.name.toUpperCase()}>
    <StageIntro eyebrow="COMPETITION ARCHIVE" title="Past games still count." description="Older competitions are kept here for reference." />
    {competitions.length ? <StageList>{competitions.map(item => <StageRow key={item.id} title={item.name} detail={`${item.kind} · Read-only · ${item.entrants.length} entrants`} symbol="◇" onPress={() => router.push(`/${presentation.routeSegment}/legacy-competition/${item.id}` as Href)} />)}</StageList> : <ArchiveEmpty />}
    <StageNotice>Current competitions live in the main competition list.</StageNotice>{browse}
  </StagePage>;
}

function Info({ label, value }: { label: string; value: string }) { return <View style={styles.card}><Text variant="overline" tone="dim">{label}</Text><Text variant="bodyStrong">{value}</Text></View>; }
function ArchiveEmpty() { return <View style={styles.empty}><MaterialCommunityIcons name="archive-off-outline" size={30} color={colors.textMuted} /><Text variant="bodyStrong">No archived competitions on this device yet</Text></View>; }
const styles = StyleSheet.create({ content: { gap: spacing.md }, notice: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, row: { minHeight: 70, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' }, card: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, gap: 4 }, empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm }, flex: { flex: 1 } });
