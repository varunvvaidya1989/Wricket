import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_400Regular, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold, IBMPlexMono_700Bold } from '@expo-google-fonts/ibm-plex-mono';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { colors } from '@/lib/theme/colors';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { RootAccessGate } from '@/components/providers/RootAccessGate';
import { AnimatedSportStageSplash } from '@/components/branding/AnimatedSportStageSplash';
import { SportProfileDrawerProvider } from '@/components/sports/scoring/SportProfileDrawer';

const ANIMATED_SPLASH_DURATION_MS = 1500;

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 500, fade: true });

export const unstable_settings = {
  anchor: 'index',
};

const sportStageTheme = {
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
  const [launchComplete, setLaunchComplete] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
  });

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    void SplashScreen.hideAsync();
    const timer = setTimeout(() => setLaunchComplete(true), ANIMATED_SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return null;
  if (!launchComplete) return <AnimatedSportStageSplash />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootAccessGate>
            <SportProfileDrawerProvider>
              <ThemeProvider value={sportStageTheme}>
              <Stack
                screenOptions={{
                  contentStyle: { backgroundColor: colors.bg },
                  headerStyle: { backgroundColor: colors.bg },
                  headerTintColor: colors.text,
                  headerTitleStyle: { fontFamily: 'SpaceGrotesk_700Bold' },
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="apps" options={{ headerShown: false }} />
                <Stack.Screen name="auth" options={{ headerShown: false }} />
                <Stack.Screen name="auth-link-error" options={{ headerShown: false }} />
                <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
                <Stack.Screen name="reset-password" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                <Stack.Screen name="account" options={{ headerShown: false }} />
                <Stack.Screen name="profile" options={{ headerShown: false }} />
                <Stack.Screen name="live" options={{ headerShown: false }} />
                <Stack.Screen name="feed" options={{ headerShown: false }} />
                <Stack.Screen name="notifications" options={{ headerShown: false }} />
                <Stack.Screen name="player" options={{ headerShown: false }} />
                <Stack.Screen name="tennis" options={{ headerShown: false }} />
                <Stack.Screen name="badminton" options={{ headerShown: false }} />
                <Stack.Screen name="padel" options={{ headerShown: false }} />
                <Stack.Screen name="table-tennis" options={{ headerShown: false }} />
                <Stack.Screen name="pickleball" options={{ headerShown: false }} />
                <Stack.Screen name="change-password" options={{ headerShown: false }} />
                <Stack.Screen name="wricket" options={{ headerShown: false }} />
              </Stack>
              <StatusBar style="light" />
              </ThemeProvider>
            </SportProfileDrawerProvider>
          </RootAccessGate>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
