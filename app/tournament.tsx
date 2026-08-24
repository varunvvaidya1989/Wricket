import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SportStageLogo } from '@/components/branding/SportStageLogo';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import { getTournamentByCloudId } from '@/lib/wricket/db/repo';
import { syncTournamentData } from '@/lib/wricket/sync/tournamentSync';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export default function SharedTournamentScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const auth = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const returnTo = id ? `/tournament?id=${encodeURIComponent(id)}` : '/tournament';
  const hasCricket = Boolean(auth.profile?.connectedSports.some(
    sport => sport.code === 'CRICKET' && sport.accessStatus === 'ACTIVE',
  ));

  const openTournament = useCallback(async () => {
    if (!id || !auth.session || !hasCricket) return;
    setLoading(true);
    setError(undefined);
    try {
      await syncTournamentData(auth.session.user.id);
      const tournament = await getTournamentByCloudId(id);
      if (!tournament) throw new Error('This tournament is no longer available to your account.');
      router.replace({ pathname: '/wricket/tournament/[id]', params: { id: tournament.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this tournament.');
      setLoading(false);
    }
  }, [auth.session, hasCricket, id, router]);

  useEffect(() => { void openTournament(); }, [openTournament]);

  if (loading) {
    return <Screen padded={false}><SportStageLoader message="Opening tournament stage" detail="Syncing tournament info, teams, captains, and fixtures" /></Screen>;
  }

  return <Screen>
    <View style={styles.page}>
      <View style={styles.brandRow}><SportStageLogo size={54} /><View><Text variant="overline" tone="accent">SPORTSTAGE INVITE</Text><Text variant="caption" tone="muted">Every sport. One stage.</Text></View></View>
      <View style={styles.card}>
        <View style={styles.icon}><MaterialCommunityIcons name="trophy-outline" size={34} color={colors.gold} /></View>
        <Text variant="h1">Tournament shared with you</Text>
        <Text tone="muted" style={styles.copy}>
          {auth.session
            ? hasCricket
              ? error ?? 'Preparing the complete tournament page.'
              : 'Add Cricket to your SportStage apps to view this tournament.'
            : 'Sign in to view tournament information, teams, captains, fixtures, and live updates.'}
        </Text>
        {!id ? <Text variant="caption" tone="danger">This tournament link is incomplete.</Text> : null}
        {!auth.session && id ? <Button title="Sign in to SportStage" onPress={() => router.push({ pathname: '/auth', params: { returnTo } })} fullWidth /> : null}
        {auth.session && !hasCricket ? <Button title="Choose your sports" onPress={() => router.push('/apps')} fullWidth /> : null}
        {auth.session && hasCricket && error ? <Button title="Try again" onPress={() => void openTournament()} fullWidth /> : null}
        <Pressable onPress={() => router.replace('/live')} style={styles.back}><MaterialCommunityIcons name="arrow-left" size={17} color={colors.textMuted} /><Text variant="caption" tone="muted">BACK TO LIVE SCORES</Text></Pressable>
      </View>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', gap: spacing.xl, paddingVertical: spacing.xxl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  card: { gap: spacing.md, padding: spacing.xl, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.xl, backgroundColor: colors.surface },
  icon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.goldMuted },
  copy: { lineHeight: 22 },
  back: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
