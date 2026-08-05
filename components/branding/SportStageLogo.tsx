import { Image } from 'expo-image';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

const logo = require('@/assets/sportstage/logo/sportstage-mark-rounded-512.png');

export function SportStageLogo({ size = 60, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.frame, { width: size, height: size, borderRadius: size * 0.22 }, style]}>
    <Image source={logo} style={styles.image} contentFit="cover" accessibilityLabel="SportStage logo" />
  </View>;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
