import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_400Regular, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold, IBMPlexMono_700Bold } from '@expo-google-fonts/ibm-plex-mono';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import 'react-native-reanimated';

import { colors } from '@/lib/theme/colors';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { RootAccessGate } from '@/components/providers/RootAccessGate';
import { SportStageLaunchBoundary } from '@/components/branding/SportStageLaunchBoundary';
import { SportProfileDrawerProvider } from '@/components/sports/scoring/SportProfileDrawer';
import { SportStageNavigation } from '@/components/sports/platform/SportStageNavigation';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 220, fade: true });

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
  const pathname = usePathname();
  // Exported HTML and the first web render must agree while browser fonts load.
  // Routes mount after hydration; the existing launch boundary restores auth.
  const [webMounted, setWebMounted] = useState(Platform.OS !== 'web');
  useEffect(() => { setWebMounted(true); }, []);
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

  if (!webMounted || (!fontsLoaded && !fontError)) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SportStageLaunchBoundary>
          <RootAccessGate>
            <SportProfileDrawerProvider>
              <ThemeProvider value={sportStageTheme}>
              <Head><title>SportStage</title></Head>
              {['/live', '/apps', '/explore'].includes(pathname) ? <SportStageNavigation /> : null}
              <View role={Platform.OS === 'web' ? 'main' : undefined} style={{ flex: 1 }}>
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
                <Stack.Screen name="explore" options={{ headerShown: false }} />
                <Stack.Screen name="switch-sport" options={{ headerShown: false }} />
                <Stack.Screen name="start-match" options={{ headerShown: false }} />
                <Stack.Screen name="auth" options={{ headerShown: false }} />
                <Stack.Screen name="auth-link-error" options={{ headerShown: false }} />
                <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
                <Stack.Screen name="reset-password" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                <Stack.Screen name="account" options={{ headerShown: false }} />
                <Stack.Screen name="manual" options={{ headerShown: false }} />
                <Stack.Screen name="profile" options={{ headerShown: false }} />
                <Stack.Screen name="live" options={{ headerShown: false }} />
                <Stack.Screen name="feed" options={{ headerShown: false }} />
                <Stack.Screen name="notifications" options={{ headerShown: false }} />
                <Stack.Screen name="player/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="tournament" options={{ headerShown: false }} />
                <Stack.Screen name="tennis" options={{ headerShown: false }} />
                <Stack.Screen name="badminton" options={{ headerShown: false }} />
                <Stack.Screen name="padel" options={{ headerShown: false }} />
                <Stack.Screen name="table-tennis" options={{ headerShown: false }} />
                <Stack.Screen name="pickleball" options={{ headerShown: false }} />
                <Stack.Screen name="change-password" options={{ headerShown: false }} />
                <Stack.Screen name="wricket" options={{ headerShown: false }} />
              </Stack>
              </View>
              <StatusBar style="light" />
              </ThemeProvider>
            </SportProfileDrawerProvider>
          </RootAccessGate>
          </SportStageLaunchBoundary>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
