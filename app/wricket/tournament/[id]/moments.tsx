import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '@/components/providers/AuthProvider';
import { MatchMoments } from '@/components/wricket/moments/MatchMoments';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { spacing } from '@/lib/theme/spacing';
import { getTournament, getTournamentByCloudId } from '@/lib/wricket/db/repo';
import { syncTournamentData } from '@/lib/wricket/sync/tournamentSync';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { Tournament } from '@/lib/wricket/domain/types';

export default function TournamentMomentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      let next = await getTournament(id) ?? await getTournamentByCloudId(id);
      if (!next && auth.session) {
        await syncTournamentData(auth.session.user.id);
        next = await getTournament(id) ?? await getTournamentByCloudId(id);
      }
      if (!next) throw new Error('This tournament is unavailable to your account. Sign in or return to My cricket.');
      setTournament(next); setError(undefined);
      setRefreshKey(current => current + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load this tournament.'); }
    finally { setLoading(false); }
  }, [id, auth.session]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return <Screen padded={false}>
    <Stack.Screen options={{ headerShown: false }} />
    <WricketHeader title="Match Moments" backTo="/wricket/my-wricket" />
    {loading && !tournament ? <SportStageLoader variant="section" message="Loading match moments" detail="Gathering photos, reactions, and highlights" /> : (
      <ScrollView keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} contentContainerStyle={styles.content}>
        {error ? <StateNotice error title="Moments unavailable" detail={error} action={{ label: 'Try again', onPress: () => void load() }} /> : null}
        {tournament ? <MatchMoments cloudTournamentId={tournament.cloudId} profileId={auth.session?.user.id} canModerate={tournament.organizerProfileId === auth.session?.user.id} refreshKey={refreshKey} /> : null}
      </ScrollView>
    )}
  </Screen>;
}
const styles = StyleSheet.create({ loader: { marginTop: spacing.xl }, content: { padding: spacing.lg, paddingBottom: spacing.xxxl } });
