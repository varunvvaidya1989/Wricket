import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors, palette } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';

interface SportApp {
  id: string;
  name: string;
  status: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
  enabled: boolean;
  route?: Href;
}

const sportApps: SportApp[] = [
  {
    id: 'wricket',
    name: 'Wricket',
    status: 'Ready',
    description: 'Cricket tournaments, live scoring, innings, scorecards and points tables.',
    icon: 'cricket',
    accent: colors.accent,
    enabled: true,
    route: '/wricket' as Href,
  },
  {
    id: 'football',
    name: 'Football',
    status: 'Planned',
    description: 'Match clock, goals, cards, substitutions and league tables.',
    icon: 'soccer',
    accent: '#5B8DEF',
    enabled: false,
  },
  {
    id: 'basketball',
    name: 'Basketball',
    status: 'Planned',
    description: 'Periods, fouls, timeouts, shot scoring and player stats.',
    icon: 'basketball',
    accent: '#FF6A3D',
    enabled: false,
  },
];

export default function SportStageDashboard() {
  const router = useRouter();

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <MaterialCommunityIcons name="stadium" size={30} color={colors.accentInk} />
        </View>
        <Text variant="overline" tone="muted" style={{ marginTop: spacing.lg }}>
          SportStage
        </Text>
        <Text variant="h1" style={styles.title}>
          Choose your scoring app
        </Text>
        <Text variant="body" tone="muted" style={styles.subtitle}>
          One stage for multiple sports. Start with Wricket today and add more scoring apps as the platform grows.
        </Text>
      </View>

      <View style={styles.grid}>
        {sportApps.map(app => (
          <Pressable
            key={app.id}
            disabled={!app.enabled || !app.route}
            onPress={() => app.route && router.push(app.route)}
            style={({ pressed }) => [
              styles.appCard,
              { borderTopColor: app.accent },
              !app.enabled && styles.appCardDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={styles.cardTop}>
              <View style={[styles.appIcon, { backgroundColor: app.accent }]}>
                <MaterialCommunityIcons
                  name={app.icon}
                  size={28}
                  color={app.enabled ? colors.accentInk : palette.black}
                />
              </View>
              <View style={[styles.statusPill, app.enabled && styles.statusPillReady]}>
                <Text
                  variant="caption"
                  style={{
                    color: app.enabled ? colors.accentInk : colors.textMuted,
                    fontWeight: '700',
                  }}
                >
                  {app.status}
                </Text>
              </View>
            </View>

            <Text variant="h2" style={{ marginTop: spacing.lg }}>
              {app.name}
            </Text>
            <Text variant="body" tone="muted" style={styles.cardCopy}>
              {app.description}
            </Text>

            <View style={styles.cardFooter}>
              <Text variant="bodyStrong" tone={app.enabled ? 'accent' : 'dim'}>
                {app.enabled ? 'Open app' : 'Coming later'}
              </Text>
              {app.enabled && (
                <MaterialCommunityIcons name="arrow-right" size={20} color={colors.accent} />
              )}
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  brandMark: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  subtitle: {
    marginTop: spacing.md,
    maxWidth: 360,
    lineHeight: 22,
  },
  grid: {
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  appCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 4,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  appCardDisabled: {
    opacity: 0.58,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusPillReady: {
    backgroundColor: colors.accent,
  },
  cardCopy: {
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  cardFooter: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
