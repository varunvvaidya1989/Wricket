import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { getUser } from '@/lib/wricket/db/repo';
import { User } from '@/lib/wricket/domain/types';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (!id) return;
        const u = await getUser(id);
        setUser(u);
      })();
    }, [id]),
  );

  if (!user) return <Screen><Text tone="muted">Loading…</Text></Screen>;

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: user.name }} />
      <View style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <MaterialCommunityIcons name="account" size={48} color={colors.accent} />
          </View>
          <Text variant="h1">{user.name}</Text>
          <Text variant="caption" tone="muted">
            {{ BAT: 'Batter', BOWL: 'Bowler', AR: 'All-rounder', WK: 'Wicket-keeper' }[user.role]}
          </Text>
        </View>

        <Card>
          <Text variant="overline" tone="muted">CAREER</Text>
          <Text variant="caption" tone="dim" style={{ marginTop: spacing.sm }}>
            Stats appear once this player has been part of matches.
          </Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
});
