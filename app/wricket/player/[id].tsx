import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { getSupabaseClient } from '@/lib/supabase/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { getUser } from '@/lib/wricket/db/repo';
import { User } from '@/lib/wricket/domain/types';
import { PersonalStats, personalStatsApi } from '@/lib/supabase/personalStatsApi';
import { PerformanceTeaser } from '@/components/wricket/performance/PerformanceTeaser';
import { useAuth } from '@/components/providers/AuthProvider';
import { MyTeamsCard } from '@/components/wricket/teams/MyTeamsCard';

interface CloudPlayer {
  id: string;
  profile_id?: string | null;
  display_name: string;
  role?: User['role'] | null;
  batting_hand?: string | null;
  bowling_style?: string | null;
  image_url?: string | null;
  source_system?: string | null;
  source_metadata?: {
    auction_yodha?: {
      matches?: number | null;
      runs?: number | null;
      wickets?: number | null;
    };
  } | null;
}

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const auth = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [cloudPlayer, setCloudPlayer] = useState<CloudPlayer | null>(null);
  const [career, setCareer] = useState<PersonalStats>();
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      if (!id) return;
      setLoading(true);
      const [localPlayer, cloudResult, playerCareer] = await Promise.all([
        getUser(id),
        getSupabaseClient().from('players')
          .select('id, profile_id, display_name, role, batting_hand, bowling_style, image_url, source_system, source_metadata')
          .eq('id', id)
          .maybeSingle(),
        personalStatsApi.getForPlayerIds([id]),
      ]);
      if (cloudResult.error) throw cloudResult.error;
      if (active) {
        setUser(localPlayer);
        setCloudPlayer(cloudResult.data as CloudPlayer | null);
        setCareer(playerCareer);
      }
    })().catch(() => {
      if (active) {
        setUser(null);
        setCloudPlayer(null);
        setCareer(undefined);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]));

  if (loading) return <Screen><Text tone="muted">Loading…</Text></Screen>;
  if (!user && !cloudPlayer) return <Screen><Text tone="muted">Player not found.</Text></Screen>;

  const name = cloudPlayer?.display_name ?? user!.name;
  const role = cloudPlayer?.role ?? user?.role ?? 'AR';
  const legacyStats = cloudPlayer?.source_metadata?.auction_yodha;
  const displayedStats = career?.matches ? career : legacyStats;
  const ownProfile = cloudPlayer?.profile_id === auth.session?.user.id;

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: name }} />
      <View style={styles.content}>
        <View style={styles.profileHeader}>
          {cloudPlayer?.image_url
            ? <Image source={{ uri: cloudPlayer.image_url }} style={styles.avatarImage} />
            : (
              <View style={styles.avatar}>
                <MaterialCommunityIcons name="account" size={48} color={colors.accent} />
              </View>
            )}
          <Text variant="h1">{name}</Text>
          <Text variant="caption" tone="muted">
            {{ BAT: 'Batter', BOWL: 'Bowler', AR: 'All-rounder', WK: 'Wicket-keeper' }[role] ?? 'Cricketer'}
          </Text>
          {cloudPlayer?.source_system === 'auction_yodha' && (
            <Text variant="caption" tone="dim" style={styles.source}>AuctionYodha player</Text>
          )}
        </View>

        <PerformanceTeaser own={ownProfile} stats={displayedStats} onPress={() => ownProfile ? router.push({ pathname: '/wricket/my-wricket', params: { section: 'performance' } }) : router.push({ pathname: '/wricket/stats', params: { playerId: id, playerName: name } })} />

        {ownProfile && auth.session ? (
          <MyTeamsCard
            accountId={auth.session.user.id}
            onOpenTeam={teamId => router.push({ pathname: '/wricket/team/[id]', params: { id: teamId } })}
          />
        ) : null}

        {(cloudPlayer?.batting_hand || cloudPlayer?.bowling_style) && (
          <Card>
            <Text variant="overline" tone="muted">PLAYING STYLE</Text>
            {cloudPlayer.batting_hand && <Text style={styles.styleLine}>Batting: {cloudPlayer.batting_hand}</Text>}
            {cloudPlayer.bowling_style && <Text>Bowling: {cloudPlayer.bowling_style}</Text>}
          </Card>
        )}

      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, gap: spacing.lg },
  profileHeader: { alignItems: 'center', paddingVertical: spacing.lg },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarImage: { width: 96, height: 96, borderRadius: 48, marginBottom: spacing.md },
  source: { marginTop: spacing.xs },
  styleLine: { marginTop: spacing.sm },
});
