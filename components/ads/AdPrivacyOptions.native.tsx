import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdsConsent, AdsConsentPrivacyOptionsRequirementStatus } from 'react-native-google-mobile-ads';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export function AdPrivacyOptions() {
  const [required, setRequired] = useState(false);
  useEffect(() => {
    let active = true;
    void AdsConsent.requestInfoUpdate({ tagForUnderAgeOfConsent: false }).then(info => {
      if (active) setRequired(info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!required) return null;
  return <Card onPress={() => void AdsConsent.showPrivacyOptionsForm()}><View style={styles.row}>
    <View style={styles.iconBubble}><MaterialCommunityIcons name="shield-account-outline" size={22} color={colors.text} /></View>
    <Text variant="bodyStrong" style={styles.label}>Ad privacy options</Text>
    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} />
  </View></Card>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { flex: 1 },
  iconBubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
});
