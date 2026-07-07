import React from 'react';
import { View, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export default function StatsScreen() {
  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="overline" tone="muted">Insights</Text>
        <Text variant="h1">Stats</Text>
      </View>

      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons name="chart-line" size={36} color={colors.accent} />
        </View>
        <Text variant="h2" style={{ marginTop: spacing.lg }}>Play a few matches</Text>
        <Text variant="body" tone="muted" style={{ textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xl }}>
          Personal insights, top scorers and bowling leaderboards appear here once you have some match data.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
