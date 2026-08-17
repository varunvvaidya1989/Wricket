import { Stack, usePathname } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { colors } from '@/lib/theme/colors';
import type { ScoringSportId } from '@/lib/sports/scoring';
import { SportAppTabBar } from './SportAppTabBar';
import { SportProfileDrawerProvider } from './SportProfileDrawer';

export function SportAppLayout({ sportId }: { sportId: ScoringSportId }) {
  const pathname = usePathname();
  const hideTabs = /\/match\/[^/]+\/score$/.test(pathname);
  return (
    <SportProfileDrawerProvider sportId={sportId}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        />
        {!hideTabs ? <SportAppTabBar sportId={sportId} /> : null}
      </View>
    </SportProfileDrawerProvider>
  );
}
