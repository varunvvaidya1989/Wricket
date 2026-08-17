import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  listScoringSessions,
  listSportCompetitions,
  replay,
  type ScoringSportId,
} from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportAvatarButton } from './SportProfileDrawer';
import { SportProfileCard } from './SportProfileCard';

export function SportMySportScreen({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [matchCount, setMatchCount] = useState(0);
  const [competitionCount, setCompetitionCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof listScoringSessions>>>([]);

  const reload = useCallback(() => {
    void Promise.all([listScoringSessions(), listSportCompetitions(sportId)])
      .then(([storedSessions, competitions]) => {
        const sportSessions = storedSessions.filter((session) => session.sportId === sportId);
        setSessions(sportSessions);
        setMatchCount(sportSessions.length);
        setCompetitionCount(competitions.length);
        setCompletedCount(sportSessions.filter((session) => replay(config, session.events, {
          initialServer: session.initialServer,
          options: session.options,
        }).isComplete).length);
      })
      .catch(() => undefined);
  }, [config, sportId]);
  useFocusEffect(reload);

  const base = `/${presentation.routeSegment}`;
  const sections = [
    { label: 'Clubs & teams', detail: 'Verified memberships and reusable rosters', icon: 'account-group-outline' as const, route: `${base}/clubs` },
    { label: 'Matches', detail: `${matchCount} local matches`, icon: 'scoreboard-outline' as const, route: `${base}/matches` },
    { label: 'Competitions', detail: `${competitionCount} tournaments and leagues`, icon: 'trophy-outline' as const, route: `${base}/competitions` },
    { label: 'Performance', detail: `${completedCount} completed results`, icon: 'chart-line' as const, route: `${base}/stats` },
  ];

  return (
    <Screen scroll padded={false}>
      <AppHeader title={`My ${config.name}`} eyebrow="PLAYER HUB" right={<SportAvatarButton />} />
      <View style={styles.content}>
        <SportProfileCard sportId={sportId} sessions={sessions} />
        <View style={styles.sectionHeading}><Text variant="overline" tone="dim">MY {config.name.toUpperCase()}</Text><Text variant="caption" tone="muted">MANAGE</Text></View>
        {sections.map((section) => (
          <Pressable key={section.label} onPress={() => router.push(section.route as Href)} style={({ pressed }) => [styles.sectionCard, pressed && styles.pressed]}>
            <View style={[styles.sectionIcon, { backgroundColor: `${presentation.accent}16` }]}><MaterialCommunityIcons name={section.icon} size={24} color={presentation.accent} /></View>
            <View style={styles.flex}><Text variant="h3">{section.label}</Text><Text variant="caption" tone="muted">{section.detail}</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={23} color={colors.textDim} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  sectionHeading: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionCard: { minHeight: 84, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
