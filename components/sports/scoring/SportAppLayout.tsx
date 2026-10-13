import { Stack, usePathname } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { stageColors as colors } from '@/components/sports/platform/StageUI';
import { SportStageNavigation } from '@/components/sports/platform/SportStageNavigation';
import { SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import { SportProfileDrawerProvider } from './SportProfileDrawer';

export function SportAppLayout({ sportId }: { sportId: ScoringSportId }) {
  const pathname = usePathname();
  const base = `/${SPORT_PRESENTATION[sportId].routeSegment}`;
  const isRoot = [base, `${base}/my-sport`, `${base}/stats`, `${base}/search`].includes(pathname);
  return (
    <SportProfileDrawerProvider sportId={sportId}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {isRoot ? <SportStageNavigation sportId={sportId} /> : null}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        />
      </View>
    </SportProfileDrawerProvider>
  );
}
