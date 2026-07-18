import { Stack } from 'expo-router';

import { colors } from '@/lib/theme/colors';

export default function WricketLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.bg },
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="tournament/new"
        options={{ presentation: 'modal', title: 'New Tournament' }}
      />
      <Stack.Screen name="tournament/[id]" options={{ title: '' }} />
      <Stack.Screen
        name="match/new"
        options={{ presentation: 'modal', title: 'New Match' }}
      />
      <Stack.Screen
        name="match/[id]/score"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="match/[id]/scorecard" options={{ title: 'Scorecard' }} />
      <Stack.Screen name="player/[id]" options={{ title: '' }} />
    </Stack>
  );
}
