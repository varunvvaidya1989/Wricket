import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/wricket/presentation/design';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  elevated?: boolean;
  accentColor?: string;
}

export function Card({ children, onPress, style, elevated, accentColor }: CardProps) {
  const containerStyle = [
    styles.card,
    elevated && { backgroundColor: colors.surfaceElevated },
    accentColor ? { borderLeftWidth: 3, borderLeftColor: accentColor } : null,
    style,
  ];

  if (onPress) {
    return (
      <Pressable accessibilityRole="button"
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
        style={({ pressed }) => [containerStyle, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={containerStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
