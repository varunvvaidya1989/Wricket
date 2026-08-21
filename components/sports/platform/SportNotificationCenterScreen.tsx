import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { sportOperationsApi, type SportNotification } from '@/lib/supabase/sportOperationsApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function SportNotificationCenterScreen() {
  const router = useRouter();
  const [items, setItems] = useState<SportNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    setLoading(true); setError(undefined);
    void sportOperationsApi.notifications().then(setItems)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load notifications.'))
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(load);

  const open = async (item: SportNotification) => {
    try {
      if (!item.readAt) {
        await sportOperationsApi.markRead(item.id);
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
      }
      if (item.deepLink?.startsWith('/')) router.push(item.deepLink as Href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open notification.');
    }
  };

  return <Screen scroll padded={false}>
    <AppHeader title="Notifications" eyebrow="YOUR SPORTSTAGE" back />
    <View style={styles.content}>
      {error ? <View accessibilityRole="alert" style={styles.error}><Text variant="caption" tone="danger">{error}</Text></View> : null}
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.accent} /></View> : null}
      {!loading && !items.length ? <View style={styles.empty}><MaterialCommunityIcons name="bell-sleep-outline" size={34} color={colors.textDim} /><Text variant="h3">All caught up</Text><Text variant="caption" tone="muted">Invitations, lineups, schedules, assignments, starts, and results will appear here.</Text></View> : null}
      {items.map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => void open(item)} style={[styles.item, !item.readAt && styles.unread]}>
        <View style={[styles.icon, !item.readAt && styles.iconUnread]}><MaterialCommunityIcons name={notificationIcon(item.kind)} size={21} color={!item.readAt ? colors.accent : colors.textMuted} /></View>
        <View style={styles.flex}><View style={styles.titleRow}><Text variant="bodyStrong" style={styles.flex}>{item.title}</Text>{!item.readAt ? <View style={styles.dot} /> : null}</View><Text variant="caption" tone="muted">{item.body}</Text><Text variant="overline" tone="dim" style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text></View>
        {item.deepLink ? <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textDim} /> : null}
      </Pressable>)}
    </View>
  </Screen>;
}

function notificationIcon(kind: string) {
  if (kind === 'INVITATION') return 'email-outline';
  if (kind === 'MATCH_START') return 'play-circle-outline';
  if (kind === 'FINAL_RESULT') return 'trophy-outline';
  if (kind === 'OFFICIAL_ASSIGNMENT') return 'whistle-outline';
  return 'bell-outline';
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  item: { minHeight: 88, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  unread: { borderColor: '#385A44', backgroundColor: '#111D17' },
  icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  iconUnread: { backgroundColor: colors.accentMuted },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  time: { marginTop: spacing.xs },
  error: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger },
  center: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 260, padding: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg },
  flex: { flex: 1, minWidth: 0 },
});
