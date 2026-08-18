import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { SPORT_CONFIGS, SPORT_PRESENTATION, listSportCompetitions, type ScoringSportId } from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportAvatarButton } from './SportProfileDrawer';

export function SportCloudCompetitionUnavailable({
  loading,
  sportId,
}: {
  loading: boolean;
  sportId: ScoringSportId;
}) {
  const router = useRouter();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [legacyCount, setLegacyCount] = useState(0);
  useEffect(() => { void listSportCompetitions(sportId).then((items) => setLegacyCount(items.length)); }, [sportId]);
  return (
    <Screen padded={false}>
      <AppHeader title="Competitions" eyebrow={config.name.toUpperCase()} right={<SportAvatarButton />} />
      <View style={styles.center}>
        {loading ? <ActivityIndicator color={presentation.accent} /> : (
          <View style={[styles.card, { borderColor: presentation.accent }]}>
            <MaterialCommunityIcons name="cloud-lock-outline" size={34} color={presentation.accent} />
            <Text variant="h2">Cloud competitions are not available yet</Text>
            <Text variant="caption" tone="muted" style={styles.copy}>
              Tournament and league rollout for {config.name} is still being validated.
            </Text>
            {legacyCount ? <Button title={`Open ${legacyCount} legacy competition${legacyCount === 1 ? '' : 's'}`} onPress={() => router.push(`/${presentation.routeSegment}/legacy-competitions` as Href)} fullWidth style={{ backgroundColor: presentation.accent }} /> : null}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 540, padding: spacing.xl, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center', gap: spacing.md },
  copy: { textAlign: 'center' },
});
