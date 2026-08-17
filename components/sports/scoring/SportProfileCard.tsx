import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  replay,
  type ScoringSessionRecord,
  type ScoringSportId,
} from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function SportProfileCard({
  sportId,
  sessions,
}: {
  sportId: ScoringSportId;
  sessions: readonly ScoringSessionRecord[];
}) {
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const name = auth.profile?.displayName ?? auth.session?.user.email?.split('@')[0] ?? 'SportStage player';
  const sportProfile = auth.profile?.connectedSports.find(
    (sport) => sport.code === presentation.catalogCode,
  );
  const activity = useMemo(() => {
    let completed = 0;
    let rallies = 0;
    sessions.forEach((session) => {
      const state = replay(config, session.events, {
        initialServer: session.initialServer,
        options: session.options,
      });
      if (state.isComplete) completed += 1;
      rallies += session.events.length;
    });
    return { completed, rallies };
  }, [config, sessions]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${config.name} profile`}
      onPress={() => router.push('/profile')}
      style={({ pressed }) => [
        styles.card,
        { borderColor: `${presentation.accent}70` },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: `${presentation.accent}16` }]}>
        {auth.profile?.avatarUrl
          ? <Image source={{ uri: auth.profile.avatarUrl }} style={styles.avatarImage} />
          : <Text variant="h2" style={{ color: presentation.accent }}>{initials(name)}</Text>}
      </View>
      <View style={styles.main}>
        <View style={styles.identityRow}>
          <View style={styles.flex}>
            <Text variant="h3" numberOfLines={1}>{name}</Text>
            <Text variant="overline" style={{ color: presentation.accent }}>
              {config.name.toUpperCase()} PROFILE
            </Text>
          </View>
          <View style={[styles.status, { backgroundColor: `${presentation.accent}16` }]}>
            <View style={[styles.statusDot, { backgroundColor: presentation.accent }]} />
            <Text variant="overline" style={{ color: presentation.accent }}>
              {sportProfile?.accessStatus === 'ACTIVE' ? 'ACTIVE' : 'LOCAL'}
            </Text>
          </View>
        </View>
        <View style={styles.metrics}>
          <ProfileMetric value={sessions.length} label="MATCHES" />
          <ProfileMetric value={activity.completed} label="RESULTS" />
          <ProfileMetric value={activity.rallies} label="RALLIES" />
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} />
    </Pressable>
  );
}

function ProfileMetric({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.metric}>
      <Text variant="bodyStrong">{value}</Text>
      <Text variant="overline" tone="dim">{label}</Text>
    </View>
  );
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P';
}

const styles = StyleSheet.create({
  card: { minHeight: 116, padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 58, height: 58, borderRadius: 29, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  main: { flex: 1, minWidth: 0, gap: spacing.sm },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  status: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  metrics: { flexDirection: 'row' },
  metric: { minWidth: 62, paddingRight: spacing.md },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
