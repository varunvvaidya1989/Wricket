import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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

  const reload = useCallback(() => {
    const connectedSport = auth.profile?.connectedSports.find((sport) => sport.code === presentation.catalogCode);
    const accountId = auth.session?.user.id;
    if (!connectedSport || !accountId) { setMatches([]); return; }
    void sportScoringApi.listMine({ sportId: connectedSport.id, accountId })
      .then(setMatches)
      .catch(() => setMatches([]));
  }, [auth.profile?.connectedSports, auth.session?.user.id, presentation.catalogCode]);
  useFocusEffect(reload);

  return (
    <Screen scroll padded={false}>
      <AppHeader title="Matches" eyebrow={config.name.toUpperCase()} right={<SportAvatarButton />} />
      <View style={styles.content}>
        <Button title="New singles or doubles match" size="lg" fullWidth onPress={() => router.push(`/${presentation.routeSegment}/match/new` as Href)} style={{ backgroundColor: presentation.accent }} />
        <View style={styles.sectionHeading}><Text variant="overline" tone="dim">ALL MATCHES</Text><Text variant="caption" tone="muted">{matches.length}</Text></View>
        {matches.length ? matches.map((match) => {
          const initialServer = match.rulesSnapshot.initial_server === 1 ? 1 : 0;
          const events = activePointEvents(match.events);
          const state = replay(config, events, { initialServer, options: optionsFromMatch(match) });
          return <Pressable key={match.id} onPress={() => router.push(`/${presentation.routeSegment}/match/${match.id}/score` as Href)} style={({ pressed }) => [styles.match, pressed && styles.pressed]}>
            <View style={[styles.status, { backgroundColor: state.isComplete ? colors.goldMuted : `${presentation.accent}16` }]}><MaterialCommunityIcons name={state.isComplete ? 'check' : 'play'} size={19} color={state.isComplete ? colors.gold : presentation.accent} /></View>
            <View style={styles.flex}><Text variant="bodyStrong" numberOfLines={1}>{match.sideAPlayers.join(' / ')} vs {match.sideBPlayers.join(' / ')}</Text><Text variant="caption" tone="dim">{match.matchFormat} - {state.isComplete ? 'FINAL' : 'IN PROGRESS'} - {events.length} RALLIES</Text></View>
            <Text variant="scoreMd">{state.root.score[0]}-{state.root.score[1]}</Text>
          </Pressable>;
        }) : <View style={styles.empty}><MaterialCommunityIcons name="scoreboard-outline" size={30} color={colors.textDim} /><Text variant="bodyStrong">No matches yet</Text><Text variant="caption" tone="muted">Your synchronized singles and doubles matches will appear here.</Text></View>}
      </View>
    </Screen>
  );
}

function optionsFromMatch(match: SportCloudMatchFeed): Record<string, boolean | number | string | undefined> {
  const options = match.rulesSnapshot.options;
  return options && typeof options === 'object' && !Array.isArray(options) ? options as Record<string, boolean | number | string | undefined> : {};
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  sectionHeading: { marginTop: spacing.sm, flexDirection: 'row', justifyContent: 'space-between' },
  match: { minHeight: 74, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  status: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
