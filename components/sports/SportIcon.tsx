import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';

const sportIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  CRICKET: 'cricket',
  BADMINTON: 'badminton',
  TENNIS: 'tennis',
  TABLE_TENNIS: 'table-tennis',
  PADEL: 'racquetball',
  PICKLEBALL: 'tennis-ball',
};

export function SportIcon({ code, color, size = 24 }: { code: string; color: string; size?: number }) {
  return (
    <MaterialCommunityIcons
      name={sportIcons[code] ?? 'trophy-outline'}
      color={color}
      size={size}
    />
  );
}
