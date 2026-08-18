import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
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
import { SportAvatarButton } from './SportProfileDrawer';

export function SportMatchesScreen({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [sessions, setSessions] = useState<readonly ScoringSessionRecord[]>([]);
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
    'The event log will be removed from this device.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void removeScoringSession(session.id).then(reload) },
    ],
  );

  return (
    <Screen scroll padded={false}>
      <AppHeader title="Matches" eyebrow={config.name.toUpperCase()} right={<SportAvatarButton />} />
      <View style={styles.content}>
        <Button
          title="New singles or doubles match"
          size="lg"
          fullWidth
          onPress={() => router.push(`/${presentation.routeSegment}/match/new` as Href)}
          style={{ backgroundColor: presentation.accent }}
        />
        <View style={styles.sectionHeading}>
          <Text variant="overline" tone="dim">ALL MATCHES</Text>
          <Text variant="caption" tone="muted">{sessions.length}</Text>
        </View>
        {sessions.length ? sessions.map((session) => {
          const state = replay(config, session.events, { initialServer: session.initialServer, options: session.options });
          const canDelete = Boolean(auth.session?.user.id
            && session.createdByAccountId === auth.session.user.id);
          return (
            <Pressable
              key={session.id}
              onPress={() => router.push(`/${presentation.routeSegment}/match/${session.id}/score` as Href)}
              style={({ pressed }) => [styles.match, pressed && styles.pressed]}
            >
              <View style={[styles.status, { backgroundColor: state.isComplete ? colors.goldMuted : `${presentation.accent}16` }]}>
                <MaterialCommunityIcons name={state.isComplete ? 'check' : 'play'} size={19} color={state.isComplete ? colors.gold : presentation.accent} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>{session.sideNames[0]} vs {session.sideNames[1]}</Text>
                <Text variant="caption" tone="dim">{session.matchFormat} · {state.isComplete ? 'FINAL' : 'IN PROGRESS'} · {session.events.length} RALLIES</Text>
              </View>
              <Text variant="scoreMd">{state.root.score[0]}–{state.root.score[1]}</Text>
              {canDelete ? <Pressable accessibilityLabel="Delete match" hitSlop={8} onPress={(event) => { event.stopPropagation(); remove(session); }} style={styles.delete}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.textDim} />
              </Pressable> : null}
            </Pressable>
          );
        }) : (
          <View style={styles.empty}><MaterialCommunityIcons name="scoreboard-outline" size={30} color={colors.textDim} /><Text variant="bodyStrong">No matches yet</Text><Text variant="caption" tone="muted">Singles, doubles, and competition matches will appear here.</Text></View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  sectionHeading: { marginTop: spacing.sm, flexDirection: 'row', justifyContent: 'space-between' },
  match: { minHeight: 74, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  status: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  delete: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
