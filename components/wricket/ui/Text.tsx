import React from 'react';
import { Text as NativeText } from 'react-native';
import type { TextProps } from '@/components/ui/Text';
import { colors, typography } from '@/lib/wricket/presentation/design';

export function Text({ variant = 'body', tone = 'default', style, ...props }: TextProps) {
  const color = { default: colors.text, muted: colors.textMuted, dim: colors.textDim,
    accent: colors.accent, danger: colors.danger }[tone];
  return <NativeText {...props} style={[typography[variant], { color }, style]} />;
}
