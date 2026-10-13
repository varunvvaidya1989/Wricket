import { svgDataUri } from '@/lib/wricket/presentation/svg';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { iconPaths } from '@/lib/wricket/presentation/icons';
import { colors } from '@/lib/wricket/presentation/design';
import { Text } from './Text';

export function DesignIcon({ name, size = 18, color = colors.text }: {
  name: keyof typeof iconPaths; size?: number; color?: string;
}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]}</svg>`;
  return <Image accessible={false} source={{ uri: svgDataUri(svg) }} style={{ width: size, height: size }} />;
}

export function TeamCrest({ name, blue = false }: { name: string; blue?: boolean }) {
  const fill = blue ? '#243242' : '#24352b';
  const stroke = blue ? '#475e73' : '#405c43';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="33" height="36" viewBox="0 0 33 36"><path d="M.5 .5H32.5V27.5L16.5 35.5 .5 27.5Z" fill="${fill}" stroke="${stroke}"/></svg>`;
  return <View style={styles.crest} accessible={false}>
    <Image source={{ uri: svgDataUri(svg) }} style={StyleSheet.absoluteFill} />
    <Text style={{ fontSize: 12, color: blue ? '#a9cde9' : '#d7f3cd' }}>{name.trim()[0]?.toUpperCase() ?? '?'}</Text>
  </View>;
}
const styles = StyleSheet.create({ crest: { width: 33, height: 36, alignItems: 'center', justifyContent: 'center' } });
