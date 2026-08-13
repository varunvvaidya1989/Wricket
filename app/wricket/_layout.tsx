import { Stack, usePathname } from 'expo-router';
import { View } from 'react-native';

import { WricketTabBar } from '@/components/wricket/navigation/WricketTabBar';
import { WricketProfileDrawerProvider } from '@/components/wricket/navigation/WricketProfileDrawer';
import { colors } from '@/lib/theme/colors';

export default function WricketLayout() {
  const pathname = usePathname();
  const isScoring = /^\/wricket\/match\/[^/]+\/score$/.test(pathname);
  return (
    <WricketProfileDrawerProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.bg },
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: 'SpaceGrotesk_700Bold' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="tournament/new" options={{ title: 'New Tournament' }} />
        <Stack.Screen name="tournament/[id]" options={{ title: '' }} />
        <Stack.Screen name="team/join" options={{ title: 'Join team' }} />
        <Stack.Screen name="team/[id]" options={{ title: 'Team' }} />
        <Stack.Screen name="match/new" options={{ title: 'New Match' }} />
        <Stack.Screen name="match/[id]/score" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="match/[id]/live" options={{ title: 'Live score' }} />
        <Stack.Screen name="match/[id]/scorecard" options={{ title: 'Scorecard' }} />
        <Stack.Screen name="player/[id]" options={{ title: '' }} />
        <Stack.Screen name="user/[id]" options={{ title: '' }} />
        <Stack.Screen name="ay-profile-link" options={{ title: 'Connect player profile' }} />
      </Stack>
        {!isScoring ? <WricketTabBar /> : null}
      </View>
    </WricketProfileDrawerProvider>
  );
}
