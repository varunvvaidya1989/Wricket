import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { AdPrivacyOptions } from '../../../components/ads/AdPrivacyOptions';
import { SportStageSignOutActions } from '@/components/auth/SportStageSignOutActions';
import { useAuth } from '@/components/providers/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { PlayerProfile, playerProfileApi } from '@/lib/supabase/playerProfileApi';
import { LegacyLinkResolution, legacyPlayerLinkApi } from '@/lib/supabase/legacyPlayerLinkApi';

export default function MeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const name = auth.profile?.displayName ?? 'SportStage member';
  const [player, setPlayer] = useState<PlayerProfile>();
  const [ayLink, setAyLink] = useState<LegacyLinkResolution>();

  useFocusEffect(useCallback(() => {
    if (!auth.session || !auth.profile?.connectedSports.some(sport => sport.code === 'CRICKET' && sport.accessStatus === 'ACTIVE')) return undefined;
    let active = true;
    void legacyPlayerLinkApi.resolve(name).then(async resolution => {
      if (active) setAyLink(resolution);
      if (resolution.status === 'CANDIDATES' || resolution.status === 'CONTACT_CONFLICT') return;
      if (resolution.status === 'VERIFIED_MATCH') return;
      const linkedPlayer = resolution.status === 'NO_MATCH'
        ? await playerProfileApi.ensureMine(auth.session!.user.id, name)
        : await playerProfileApi.getMine(auth.session!.user.id);
      if (!linkedPlayer) return;
      if (active) setPlayer(linkedPlayer);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [auth.profile?.connectedSports, auth.session, name]));

  return <Screen scroll padded={false}>
    <View style={styles.header}><Text variant="overline" tone="muted">CRICKET</Text><Text variant="h1">Cricket Profile</Text></View>
    <View style={styles.content}>
      <Card onPress={() => player && router.push({ pathname: '/wricket/player/[id]', params: { id: player.id } })}>
        <View style={styles.row}>
          <View style={styles.avatar}><Text variant="h2" tone="accent">{name.trim().charAt(0).toUpperCase() || 'P'}</Text></View>
          <View style={{ flex: 1 }}><Text variant="h3">{name}</Text><Text variant="caption" tone="muted">{auth.session?.user.email}</Text><Text variant="caption" style={{ color: colors.success }}>{player ? roleLabel(player.role) : auth.profile?.primarySport?.name ?? 'SportStage'} profile</Text></View>
          {player ? <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} /> : null}
        </View>
      </Card>
      <MenuCard icon="account-edit-outline" label="Edit player & account" onPress={() => router.push('/account')} />
      {ayLink?.status === 'VERIFIED_MATCH' || ayLink?.status === 'CONTACT_CONFLICT' ? <MenuCard icon="link-variant" label="Link player from AuctionYodha" accent onPress={() => router.push('/wricket/ay-profile-link')} /> : null}
      <MenuCard icon="apps" label="SportStage apps" accent onPress={() => router.replace('/')} />
      <AdPrivacyOptions />
      <MenuCard icon="information-outline" label="About SportStage" onPress={() => void Linking.openURL('https://www.sportstageapp.com/about').catch(() => Alert.alert('Could not open About SportStage', 'Please check your connection and try again.'))} />
      <SportStageSignOutActions />
    </View>
  </Screen>;
}

function roleLabel(role: PlayerProfile['role']) {
  return { BAT: 'Batter', BOWL: 'Bowler', AR: 'All-rounder', WK: 'Wicket-keeper' }[role];
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
