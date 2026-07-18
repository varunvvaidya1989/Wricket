import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export default function MeScreen() {
  const router = useRouter();

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="overline" tone="muted">Profile</Text>
        <Text variant="h1">Me</Text>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={styles.avatar}>
              <MaterialCommunityIcons name="account" size={28} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="h3">Set up your profile</Text>
              <Text variant="caption" tone="muted">Add your name and role to track personal stats</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} />
          </View>
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={styles.iconBubble}>
              <MaterialCommunityIcons name="cog-outline" size={22} color={colors.text} />
            </View>
            <Text variant="bodyStrong" style={{ flex: 1 }}>Settings</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} />
          </View>
        </Card>

        <Card onPress={() => router.push('/')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={styles.iconBubble}>
              <MaterialCommunityIcons name="apps" size={22} color={colors.accent} />
            </View>
            <Text variant="bodyStrong" style={{ flex: 1 }}>SportStage apps</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} />
          </View>
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={styles.iconBubble}>
              <MaterialCommunityIcons name="information-outline" size={22} color={colors.text} />
            </View>
            <Text variant="bodyStrong" style={{ flex: 1 }}>About Wricket</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} />
          </View>
        </Card>
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
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
