import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import mobileAds, { AdsConsent, BannerAd, BannerAdSize, MaxAdContentRating, TestIds } from 'react-native-google-mobile-ads';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const ANDROID_BANNER_AD_UNIT_ID = 'ca-app-pub-1107614471405385/1115015932';
const adUnitId = __DEV__ ? TestIds.ADAPTIVE_BANNER : ANDROID_BANNER_AD_UNIT_ID;
let initialization: Promise<boolean> | undefined;

function initializeAds() {
  initialization ??= (async () => {
    const consent = await AdsConsent.gatherConsent({ tagForUnderAgeOfConsent: false });
    if (!consent.canRequestAds) return false;
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.T,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();
    return true;
  })().catch(() => false);
  return initialization;
}

export function SportStageBannerAd() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void initializeAds().then(canShow => { if (active) setReady(canShow); });
    return () => { active = false; };
  }, []);

  if (!ready || failed) return null;
  return <View style={styles.container} accessibilityLabel="Advertisement">
    <Text variant="caption" tone="dim" style={styles.label}>ADVERTISEMENT</Text>
    <BannerAd unitId={adUnitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} onAdFailedToLoad={() => setFailed(true)} />
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, minHeight: 72, overflow: 'hidden', paddingTop: spacing.xs },
  label: { marginBottom: spacing.xs },
});
