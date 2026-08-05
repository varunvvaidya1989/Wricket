import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AdPrivacyOptions } from '../../../components/ads/AdPrivacyOptions';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export default function MeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const name = auth.profile?.displayName ?? 'SportStage member';

  return <Screen scroll padded={false}>
    <View style={styles.header}><Text variant="overline" tone="muted">PROFILE</Text><Text variant="h1">Me</Text></View>
    <View style={styles.content}>
      <Card>
        <View style={styles.row}>
          <View style={styles.avatar}><Text variant="h2" tone="accent">{name.trim().charAt(0).toUpperCase() || 'P'}</Text></View>
          <View style={{ flex: 1 }}><Text variant="h3">{name}</Text><Text variant="caption" tone="muted">{auth.session?.user.email}</Text><Text variant="caption" style={{ color: colors.success }}>{auth.profile?.primarySport?.name ?? 'SportStage'} account active</Text></View>
        </View>
      </Card>
      <MenuCard icon="account-cog-outline" label="Account & sport" onPress={() => router.push('/account')} />
      <MenuCard icon="apps" label="SportStage apps" accent onPress={() => router.push('/wricket/apps')} />
      <AdPrivacyOptions />
      <MenuCard icon="information-outline" label="About Wricket" />
      <Button title="Sign out" variant="ghost" onPress={() => void auth.signOut()} fullWidth />
    </View>
  </Screen>;
}

function MenuCard({ icon, label, accent, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; accent?: boolean; onPress?: () => void }) {
  return <Card onPress={onPress}><View style={styles.row}><View style={styles.iconBubble}><MaterialCommunityIcons name={icon} size={22} color={accent ? colors.accent : colors.text} /></View><Text variant="bodyStrong" style={{ flex: 1 }}>{label}</Text><MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} /></View></Card>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  iconBubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
});
