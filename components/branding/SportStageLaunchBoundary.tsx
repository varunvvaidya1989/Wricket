import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { colors } from '@/lib/theme/colors';
import { AnimatedSportStageSplash } from './AnimatedSportStageSplash';

/** Restore the session and mount routes while the brand introduction plays. */
export function SportStageLaunchBoundary({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const [complete, setComplete] = useState(false);
  const finish = useCallback(() => setComplete(true), []);
  const onLayout = useCallback(() => { void SplashScreen.hideAsync().catch(() => undefined); }, []);

  return <View style={styles.root} onLayout={onLayout}>
    <View style={styles.root} pointerEvents={complete ? 'auto' : 'none'} accessibilityElementsHidden={!complete} importantForAccessibility={complete ? 'auto' : 'no-hide-descendants'}>
      {children}
    </View>
    {!complete ? <View role="status" accessibilityLiveRegion="polite" style={styles.overlay}><AnimatedSportStageSplash ready={!loading} onFinish={finish} /></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
});
