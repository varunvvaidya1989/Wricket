import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/wricket/ui/Button';
import { Text } from '@/components/wricket/ui/Text';
import { colors } from '@/lib/wricket/presentation/design';
import { radius, spacing } from '@/lib/theme/spacing';

export function StateNotice({ title, detail, action, error = false }: {
  title: string; detail: string; action?: { label: string; onPress: () => void }; error?: boolean;
}) {
  return <View style={styles.card} accessibilityRole={error ? 'alert' : undefined}>
    <Text variant="h3">{title}</Text>
    <Text tone="muted">{detail}</Text>
    {action ? <Button title={action.label} onPress={action.onPress} variant="secondary" /> : null}
  </View>;
}
const styles = StyleSheet.create({ card: { gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.surface,
  borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border } });
