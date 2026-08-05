import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { Text } from './Text';

export function AppHeader({
  title,
  eyebrow,
  back = false,
  right,
}: {
  title: string;
  eyebrow?: string;
  back?: boolean;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <View style={styles.root}>
      {back && (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.action}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </Pressable>
      )}
      <View style={styles.copy}>
        {eyebrow ? <Text variant="overline" tone="dim">{eyebrow}</Text> : null}
        <Text variant={back ? 'h2' : 'h1'} numberOfLines={1}>{title}</Text>
      </View>
      {right ?? (back ? <View style={styles.action} /> : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 64, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.bg, zIndex: 20 },
  copy: { flex: 1 },
  action: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
});
