import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';

const logo = require('@/assets/sportstage/logo/sportstage-mark-rounded-512.png');

export function AnimatedSportStageSplash({ ready = false, onFinish }: { ready?: boolean; onFinish?: () => void }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Static web rendering has no viewport. Keep the first client tree identical.
  const [layoutReady, setLayoutReady] = useState(false);
  const compact = layoutReady && height < 600;
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [introComplete, setIntroComplete] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;
  const rail = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let mounted = true;
    setLayoutReady(true);
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) setReducedMotion(value);
    }).catch(() => { if (mounted) setReducedMotion(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (reducedMotion === null) return;
    if (reducedMotion) {
      entrance.setValue(1);
      setIntroComplete(true);
      return;
    }
    const intro = Animated.timing(entrance, {
      toValue: 1, duration: 680, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    const activity = Animated.loop(Animated.sequence([
      Animated.timing(rail, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(rail, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    intro.start(({ finished }) => { if (finished) setIntroComplete(true); });
    activity.start();
    return () => { intro.stop(); activity.stop(); };
  }, [entrance, rail, reducedMotion]);

  useEffect(() => {
    if (!ready || !introComplete || !onFinish) return;
    if (reducedMotion) { onFinish(); return; }
    const exit = Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true });
    exit.start(({ finished }) => { if (finished) onFinish(); });
    return () => exit.stop();
  }, [introComplete, onFinish, opacity, ready, reducedMotion]);

  const logoSize = compact ? 104 : 144;
  return <Animated.View testID="sportstage-splash" accessibilityRole="progressbar" accessibilityLabel="Opening SportStage" accessibilityState={{ busy: true }}
    style={[styles.root, { opacity, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
    <StatusBar style="light" />
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.background}>
      <View style={styles.outerTrack} /><View style={styles.innerTrack} />
      <View style={styles.sideline} /><View style={styles.crossline} />
      <View style={styles.cornerTop} /><View style={styles.cornerBottom} />
    </View>
    <View style={styles.header}><View style={styles.headerLine} /><Text variant="overline" style={styles.eyebrow}>THE GAME STARTS HERE</Text><View style={styles.headerLine} /></View>
    <View style={styles.center}>
      <Animated.View style={[styles.identity, { transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
        <View style={[styles.markStage, compact && styles.markStageCompact]}>
          <Animated.View style={[styles.halo, { opacity: entrance, transform: [{ rotate: '-12deg' }, { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]} />
          <View style={[styles.markFrame, { width: logoSize, height: logoSize, borderRadius: logoSize * 0.23 }]}>
            <Image source={logo} style={styles.logo} contentFit="contain" accessibilityLabel="SportStage logo" transition={0} />
          </View>
          <View style={styles.brandDot} />
        </View>
        <Animated.View style={[styles.copy, { opacity: entrance }]}>
          <Text variant="h1" style={[styles.wordmark, compact && styles.wordmarkCompact]}>Sport<Text style={[styles.wordmark, compact && styles.wordmarkCompact, styles.wordmarkAccent]}>Stage</Text></Text>
          <Text variant="body" tone="muted" style={styles.tagline}>Every sport. One stage.</Text>
        </Animated.View>
      </Animated.View>
    </View>
    <View style={[styles.footer, compact && styles.footerCompact]}>
      <View style={styles.activity}>
        <View style={styles.rail}><Animated.View style={[styles.railSignal, { transform: [{ translateX: reducedMotion ? 24 : rail.interpolate({ inputRange: [0, 1], outputRange: [0, 48] }) }] }]} /></View>
        <Text variant="caption" tone="muted" style={styles.loading}>Opening your stage</Text>
      </View>
      {!compact ? <View style={styles.sports}>
        <Text variant="caption" tone="dim" style={styles.sportsLine}>Cricket · Tennis · Badminton</Text>
        <Text variant="caption" tone="dim" style={styles.sportsLine}>Padel · Table tennis · Pickleball</Text>
      </View> : null}
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden', alignItems: 'center', paddingHorizontal: 24 },
  background: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  outerTrack: { position: 'absolute', width: 610, height: 860, borderRadius: 305, borderWidth: 1, borderColor: `${colors.accent}0C`, transform: [{ rotate: '28deg' }] },
  innerTrack: { position: 'absolute', width: 470, height: 720, borderRadius: 235, borderWidth: 1, borderColor: `${colors.accent}0A`, transform: [{ rotate: '28deg' }] },
  sideline: { position: 'absolute', left: '12%', height: '100%', width: 1, backgroundColor: `${colors.accent}06` },
  crossline: { position: 'absolute', width: '100%', height: 1, top: '39%', backgroundColor: `${colors.accent}06` },
  cornerTop: { position: 'absolute', top: 28, right: 24, width: 16, height: 16, borderTopWidth: 1, borderRightWidth: 1, borderColor: `${colors.accent}32` },
  cornerBottom: { position: 'absolute', bottom: 28, left: 24, width: 16, height: 16, borderBottomWidth: 1, borderLeftWidth: 1, borderColor: `${colors.accent}32` },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  headerLine: { width: 18, height: 1, backgroundColor: `${colors.accent}66` },
  eyebrow: { fontSize: 9, letterSpacing: 2.5, color: colors.textDim },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  identity: { alignItems: 'center' },
  markStage: { width: 212, height: 212, alignItems: 'center', justifyContent: 'center' },
  markStageCompact: { width: 148, height: 140 },
  halo: { position: 'absolute', width: '100%', height: '100%', borderRadius: 64, borderWidth: 1, borderColor: `${colors.accent}18`, backgroundColor: `${colors.accent}03` },
  markFrame: { overflow: 'hidden', backgroundColor: colors.bg, boxShadow: `0 16px 64px ${colors.accent}12` },
  logo: { width: '100%', height: '100%' },
  brandDot: { position: 'absolute', width: 5, height: 5, borderRadius: 3, top: 15, right: 31, backgroundColor: colors.accent },
  copy: { alignItems: 'center', marginTop: 24 },
  wordmark: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 44, lineHeight: 54, letterSpacing: -1.8, color: colors.text },
  wordmarkCompact: { fontSize: 36, lineHeight: 44 },
  wordmarkAccent: { color: colors.accent },
  tagline: { marginTop: 8, letterSpacing: 0.4, textAlign: 'center' },
  footer: { gap: 38, alignItems: 'center', paddingTop: 20, paddingBottom: 12 },
  footerCompact: { paddingTop: 12, paddingBottom: 0 },
  activity: { alignItems: 'center', gap: 14 },
  rail: { width: 80, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.border },
  railSignal: { width: 32, height: 3, borderRadius: 2, backgroundColor: colors.accent },
  loading: { fontSize: 11, letterSpacing: 0.5 },
  sports: { gap: 4, alignItems: 'center' },
  sportsLine: { fontSize: 11, letterSpacing: 0.5 },
});
