import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '@/components/providers/AuthProvider';
import { MatchMoments } from '@/components/wricket/moments/MatchMoments';
import { AppHeader } from '@/components/ui/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { spacing } from '@/lib/theme/spacing';
import { getTournament } from '@/lib/wricket/db/repo';
import { Tournament } from '@/lib/wricket/domain/types';

export default function TournamentMomentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { if (!id) return; setLoading(true); setTournament(await getTournament(id)); setLoading(false); }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return <Screen padded={false}>
    <Stack.Screen options={{ headerShown: false }} />
    <AppHeader title="Match Moments" eyebrow={tournament?.name} back />
    {loading ? <SportStageLoader variant="section" message="Loading match moments" detail="Gathering photos, reactions, and highlights" /> : (
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} contentContainerStyle={styles.content}>
        <MatchMoments cloudTournamentId={tournament?.cloudId} profileId={auth.session?.user.id} canModerate={tournament?.organizerProfileId === auth.session?.user.id} />
      </ScrollView>
    )}
  </Screen>;
}
const styles = StyleSheet.create({ loader: { marginTop: spacing.xl }, content: { padding: spacing.lg, paddingBottom: spacing.xxxl } });
