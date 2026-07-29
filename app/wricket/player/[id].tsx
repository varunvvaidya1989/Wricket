import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { getSupabaseClient } from '@/lib/supabase/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { getUser } from '@/lib/wricket/db/repo';
import { User } from '@/lib/wricket/domain/types';

interface CloudPlayer {
  id: string;
  display_name: string;
  role?: User['role'] | null;
  batting_hand?: string | null;
  bowling_style?: string | null;
  image_url?: string | null;
  cricheroes_url?: string | null;
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
  const [user, setUser] = useState<User | null>(null);
  const [cloudPlayer, setCloudPlayer] = useState<CloudPlayer | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      if (!id) return;
      setLoading(true);
      const [localPlayer, cloudResult] = await Promise.all([
        getUser(id),
        getSupabaseClient().from('players')
          .select('id, display_name, role, batting_hand, bowling_style, image_url, cricheroes_url, source_system, source_metadata')
          .eq('id', id)
          .maybeSingle(),
      ]);
      if (cloudResult.error) throw cloudResult.error;
      if (active) {
        setUser(localPlayer);
        setCloudPlayer(cloudResult.data as CloudPlayer | null);
      }
    })().catch(() => {
      if (active) {
        setUser(null);
        setCloudPlayer(null);
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

        <Card>
          <Text variant="overline" tone="muted">CAREER</Text>
          <View style={styles.stats}>
            <Stat label="MATCHES" value={legacyStats?.matches ?? 0} />
            <Stat label="RUNS" value={legacyStats?.runs ?? 0} />
            <Stat label="WICKETS" value={legacyStats?.wickets ?? 0} />
          </View>
          {!legacyStats && (
            <Text variant="caption" tone="dim" style={styles.emptyStats}>
              Stats appear once this player has been part of matches.
            </Text>
          )}
        </Card>

        {(cloudPlayer?.batting_hand || cloudPlayer?.bowling_style) && (
          <Card>
            <Text variant="overline" tone="muted">PLAYING STYLE</Text>
            {cloudPlayer.batting_hand && <Text style={styles.styleLine}>Batting: {cloudPlayer.batting_hand}</Text>}
            {cloudPlayer.bowling_style && <Text>Bowling: {cloudPlayer.bowling_style}</Text>}
          </Card>
        )}

        {cloudPlayer?.cricheroes_url && (
          <Button
            title="Open CricHeroes profile"
            variant="secondary"
            onPress={() => void Linking.openURL(cloudPlayer.cricheroes_url!)}
            fullWidth
          />
        )}
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text variant="h2">{value}</Text>
      <Text variant="overline" tone="muted">{label}</Text>
    </View>
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
  stats: { flexDirection: 'row', marginTop: spacing.md },
  stat: { flex: 1, alignItems: 'center' },
  emptyStats: { marginTop: spacing.sm },
  styleLine: { marginTop: spacing.sm },
});
