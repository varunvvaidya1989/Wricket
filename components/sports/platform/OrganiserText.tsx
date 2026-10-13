import React from 'react';
import { Text as BaseText, type TextProps } from '@/components/ui/Text';
import { colors, fonts } from '@/lib/wricket/presentation/design';

// Scoped presentation: legacy scoring and cricket typography remain independent.
export function OrganiserText({ variant = 'body', tone = 'default', style, ...props }: TextProps) {
  const typography = variant === 'h1' ? { fontFamily: fonts.display, fontSize: 29, lineHeight: 33.35, letterSpacing: -0.8 }
    : variant === 'h2' || variant === 'h3' ? { fontFamily: fonts.display, fontSize: 17, lineHeight: 22.1 }
      : variant === 'overline' ? { fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }
        : variant === 'bodyStrong' ? { fontFamily: fonts.display, fontSize: 14, lineHeight: 19.6 }
          : variant === 'caption' ? { fontFamily: fonts.body, fontSize: 11, lineHeight: 17.05 }
            : variant === 'body' ? { fontFamily: fonts.body, fontSize: 12, lineHeight: 19.8 } : undefined;
  const color = tone === 'muted' ? colors.textMuted : tone === 'dim' ? colors.textDim
    : tone === 'accent' ? colors.accent : tone === 'danger' ? colors.danger : colors.text;
  const heading = variant === 'h1' || variant === 'h2' || variant === 'h3';
  return <BaseText role={heading ? 'heading' : undefined} aria-level={variant === 'h1' ? 1 : variant === 'h2' ? 2 : variant === 'h3' ? 3 : undefined} {...props} variant={variant} tone={tone} style={[typography, { color }, style]} />;
}
