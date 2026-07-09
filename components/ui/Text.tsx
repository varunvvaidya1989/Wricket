import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { colors } from '@/lib/theme/colors';
import { typography } from '@/lib/theme/typography';

type Variant = keyof typeof typography;
type Tone = 'default' | 'muted' | 'dim' | 'accent' | 'danger';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
}

const toneColor: Record<Tone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  dim: colors.textDim,
  accent: colors.accent,
  danger: colors.danger,
};

export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  return (
    <RNText
      style={[typography[variant], { color: toneColor[tone] }, style]}
      {...rest}
    />
  );
}
