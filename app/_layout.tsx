import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AnimatedSplashScreen } from '@/components/AnimatedSplashScreen';
import { colors } from '@/lib/theme/colors';

export const unstable_settings = {
  anchor: '(tabs)',
};

const wricketTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    border: colors.border,
    text: colors.text,
    primary: colors.accent,
  },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <ThemeProvider value={wricketTheme}>
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
            <Stack.Screen
              name="tournament/[id]"
              options={{ title: '' }}
            />
            <Stack.Screen
              name="match/new"
              options={{ presentation: 'modal', title: 'New Match' }}
            />
            <Stack.Screen
              name="match/[id]/score"
              options={{ headerShown: false, gestureEnabled: false }}
            />
            <Stack.Screen
              name="match/[id]/scorecard"
              options={{ title: 'Scorecard' }}
            />
            <Stack.Screen
              name="player/[id]"
              options={{ title: '' }}
            />
          </Stack>
          <StatusBar style="light" />
          <AnimatedSplashScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
