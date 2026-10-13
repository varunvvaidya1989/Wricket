import React from 'react';
import { Button as BaseButton } from '@/components/ui/Button';
import { colors, fonts } from '@/lib/wricket/presentation/design';

export function OrganiserButton({ style, variant = 'primary', ...props }: React.ComponentProps<typeof BaseButton>) {
  return <BaseButton {...props} variant={variant} textStyle={{ fontFamily: fonts.display, fontSize: 13, lineHeight: 19.5 }}
    style={{ minHeight: 46, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10,
      backgroundColor: variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : colors.surface,
      borderColor: colors.borderStrong, ...style }} />;
}
