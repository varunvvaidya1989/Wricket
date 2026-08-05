import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors, palette } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { AppHeader } from '@/components/ui/AppHeader';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { SportStageLogo } from '@/components/branding/SportStageLogo';

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
];

export default function SportStageDashboard() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const nested = pathname !== '/';
  const [signingOut, setSigningOut] = useState(false);
  const cricketEnabled = auth.profile?.primarySport?.code === 'CRICKET'
    && auth.profile.primarySport.accessStatus === 'ACTIVE';
  const selectedSport = auth.profile?.primarySport;

  const signOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
    } catch (cause) {
      Alert.alert('Could not sign out', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen scroll padded={!nested}>
      {nested ? <AppHeader title="SportStage apps" back /> : null}
      <View style={[styles.header, nested && styles.nestedSection]}>
        <SportStageLogo size={60} />
        <Text variant="overline" tone="muted" style={{ marginTop: spacing.lg }}>
          SportStage
        </Text>
        {!nested ? <Text variant="h1" style={styles.title}>{cricketEnabled ? 'Your cricket stage' : `${selectedSport?.name ?? 'Your sport'} is coming soon`}</Text> : null}
        <Text variant="body" tone="muted" style={styles.subtitle}>
          {cricketEnabled
            ? 'Follow tournaments, manage teams and score every ball with Wricket.'
            : 'Your SportStage account is ready. Tournament discovery, team management, live scoring and role-based access will unlock here when your sport launches.'}
        </Text>
      </View>

      <View style={[styles.grid, nested && styles.nestedSection]}>
        {sportApps.map(app => {
          const enabled = app.enabled && cricketEnabled;
          return (
          <Pressable
            key={app.id}
            disabled={!enabled || !app.route}
            onPress={() => app.route && router.push(app.route)}
            style={({ pressed }) => [
              styles.appCard,
              { borderTopColor: app.accent },
              !enabled && styles.appCardDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={styles.cardTop}>
              <View style={[styles.appIcon, { backgroundColor: app.accent }]}>
                <MaterialCommunityIcons
                  name={app.icon}
                  size={28}
                  color={enabled ? colors.accentInk : palette.black}
                />
              </View>
              <View style={[styles.statusPill, enabled && styles.statusPillReady]}>
                <Text
                  variant="caption"
                  style={{
                    color: enabled ? colors.accentInk : colors.textMuted,
                    fontWeight: '700',
                  }}
                >
                  {enabled ? app.status : 'Unavailable'}
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
              <Text variant="bodyStrong" tone={enabled ? 'accent' : 'dim'}>
                {enabled ? 'Open app' : 'Available to Cricket accounts'}
              </Text>
              {enabled && (
                <MaterialCommunityIcons name="arrow-right" size={20} color={colors.accent} />
              )}
            </View>
          </Pressable>
          );
        })}
      </View>

      {!cricketEnabled && !nested ? (
        <View style={styles.accountActions}>
          <Text variant="overline" tone="muted">ACCOUNT</Text>
          <Text variant="caption" tone="muted">
            You can switch your primary sport whenever you want. Selecting Cricket unlocks Wricket immediately.
          </Text>
          <Button
            title="Change primary sport"
            variant="secondary"
            onPress={() => router.push('/account')}
            disabled={signingOut}
            fullWidth
          />
          <Button
            title="Sign out"
            variant="ghost"
            onPress={() => void signOut()}
            loading={signingOut}
            fullWidth
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
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
  accountActions: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  nestedSection: { paddingHorizontal: spacing.lg },
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
