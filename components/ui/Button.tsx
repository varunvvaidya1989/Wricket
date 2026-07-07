import React from 'react';
import {
  Pressable,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
  GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, palette } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  fullWidth,
  style,
}: ButtonProps) {
  const handlePress = (e: GestureResponderEvent) => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  };

  const v = variantStyles[variant];
  const s = sizeStyles[size];

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        v.container,
        s.container,
        fullWidth && { alignSelf: 'stretch' },
        pressed && { opacity: 0.85 },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text.color} />
      ) : (
        <Text style={[s.text, v.text]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    flexDirection: 'row',
  },
});

const variantStyles = {
  primary: {
    container: { backgroundColor: colors.accent },
    text: { color: colors.accentInk, fontWeight: '700' as const },
  },
  secondary: {
    container: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    text: { color: colors.text, fontWeight: '600' as const },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: colors.text, fontWeight: '500' as const },
  },
  danger: {
    container: { backgroundColor: colors.danger },
    text: { color: palette.white, fontWeight: '700' as const },
  },
} as const;

const sizeStyles = {
  sm: {
    container: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 36 },
    text: { fontSize: 14 },
  },
  md: {
    container: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl, minHeight: 48 },
    text: { fontSize: 15 },
  },
  lg: {
    container: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, minHeight: 56 },
    text: { fontSize: 17 },
  },
} as const;
