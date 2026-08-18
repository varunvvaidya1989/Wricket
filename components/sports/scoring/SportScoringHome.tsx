import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportIcon } from '@/components/sports/SportIcon';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  listScoringSessions,
  removeScoringSession,
  replay,
  type ScoringSessionRecord,
  type ScoringSportId,
} from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportProfileCard } from './SportProfileCard';
import { SportAvatarButton } from './SportProfileDrawer';

export function SportScoringHome({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [sessions, setSessions] = useState<readonly ScoringSessionRecord[]>([]);
  const newMatchRoute = `/${presentation.routeSegment}/match/new` as Href;

  const reload = useCallback(() => {
    void listScoringSessions()
      .then((stored) => {
        setSessions(stored.filter((session) => session.sportId === sportId));
      })
      .catch(() => setSessions([]));
  }, [sportId]);
  useFocusEffect(reload);

  const remove = (session: ScoringSessionRecord) => Alert.alert(
    'Delete local match?',
    `${session.sideNames[0]} vs ${session.sideNames[1]} will be removed from this device.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void removeScoringSession(session.id).then(reload),
      },
    ],
  );

  return (
    <Screen scroll padded={false}>
      <AppHeader title={config.name} eyebrow="SPORTSTAGE" right={<SportAvatarButton />} />
      <View style={styles.content}>
        <View style={[styles.hero, { borderColor: presentation.accent }]}>
          <View style={[styles.heroIcon, { backgroundColor: `${presentation.accent}16` }]}>
            <SportIcon code={presentation.catalogCode} size={34} color={presentation.accent} />
          </View>
          <View style={styles.heroCopy}>
            <Text variant="h1">{config.name}</Text>
            <Text tone="muted" style={styles.heroText}>{presentation.tagline}</Text>
          </View>
        </View>

        <SportProfileCard sportId={sportId} sessions={sessions} />

        <Button
          title="New match"
          size="lg"
          fullWidth
          onPress={() => router.push(newMatchRoute)}
          style={{ backgroundColor: presentation.accent }}
        />

        <View style={styles.rulesCard}>
          <View style={[styles.ruleIcon, { backgroundColor: `${presentation.accent}16` }]}>
            <MaterialCommunityIcons name="format-list-checks" size={22} color={presentation.accent} />
          </View>
          <View style={styles.flex}>
            <Text variant="overline" tone="dim">DEFAULT FORMAT</Text>
            <Text variant="caption" tone="muted" style={styles.rulesCopy}>{presentation.rulesSummary}</Text>
            {presentation.option ? (
              <Text variant="caption" style={[styles.optionCopy, { color: presentation.accent }]}>
                Optional: {presentation.option.label}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text variant="overline" tone="dim">MATCHES ON THIS DEVICE</Text>
          <Text variant="caption" tone="muted">{sessions.length}</Text>
        </View>

        {sessions.length > 0 ? sessions.map((session) => (
          <RecentMatch
            key={session.id}
            session={session}
            accent={presentation.accent}
            onOpen={() => router.push(`/${presentation.routeSegment}/match/${session.id}/score` as Href)}
            onDelete={auth.session?.user.id && session.createdByAccountId === auth.session.user.id
              ? () => remove(session) : undefined}
          />
        )) : (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="scoreboard-outline" size={28} color={colors.textDim} />
            <Text variant="bodyStrong">No matches yet</Text>
            <Text variant="caption" tone="muted" style={styles.emptyCopy}>
              Start a match and its rally log will appear here for quick resume.
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

function RecentMatch({
  session,
  accent,
  onOpen,
  onDelete,
}: {
  session: ScoringSessionRecord;
  accent: string;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const config = SPORT_CONFIGS[session.sportId];
  const state = replay(config, session.events, {
    initialServer: session.initialServer,
    options: session.options,
  });
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.recentCard, pressed && styles.pressed]}>
      <View style={[styles.recentAccent, { backgroundColor: accent }]} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {session.sideNames[0]} <Text tone="dim">vs</Text> {session.sideNames[1]}
        </Text>
        <Text variant="caption" tone="dim">
          {state.isComplete ? 'FINAL' : `${session.events.length} RALLIES`} · {new Date(session.updatedAt).toLocaleDateString()}
        </Text>
      </View>
      <Text variant="scoreMd">{state.root.score[0]}–{state.root.score[1]}</Text>
      {onDelete ? <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete local match"
        onPress={(event) => { event.stopPropagation(); onDelete(); }}
        hitSlop={8}
        style={styles.deleteButton}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={19} color={colors.textDim} />
      </Pressable> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  hero: { padding: spacing.lg, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 64, height: 64, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, gap: 4 },
  heroText: { lineHeight: 20 },
  rulesCard: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.md },
  ruleIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rulesCopy: { marginTop: 4, lineHeight: 17 },
  optionCopy: { marginTop: spacing.sm },
  sectionHeading: { marginTop: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentCard: { minHeight: 72, paddingRight: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md, overflow: 'hidden' },
  recentAccent: { alignSelf: 'stretch', width: 3 },
  deleteButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, alignItems: 'center', gap: spacing.sm },
  emptyCopy: { maxWidth: 300, textAlign: 'center', lineHeight: 18 },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
