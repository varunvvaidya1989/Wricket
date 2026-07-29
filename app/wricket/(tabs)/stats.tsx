import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { PersonalStats, personalStatsApi } from '@/lib/supabase/personalStatsApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

type Section = 'overview' | 'batting' | 'bowling';

export default function StatsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<PersonalStats>();
  const [section, setSection] = useState<Section>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!auth.session) {
      setStats(undefined);
      return;
    }
    setLoading(true);
    try {
      setStats(await personalStatsApi.get(auth.session.user.id, auth.profile?.displayName));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your stats');
    } finally {
      setLoading(false);
    }
  }, [auth.profile?.displayName, auth.session]);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));

  if (!auth.session) {
    return <Screen padded={false}>
      <Header />
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons name="chart-box-outline" size={38} color={colors.accent} />
        </View>
        <Text variant="h2">Your cricket record</Text>
        <Text variant="body" tone="muted" style={styles.emptyText}>
          Sign in to see stats belonging only to your player profile.
        </Text>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/wricket/me')}>
          <Text variant="bodyStrong" style={{ color: colors.accentInk }}>Sign in</Text>
        </Pressable>
      </View>
    </Screen>;
  }

  const name = auth.profile?.displayName ?? auth.session.user.email?.split('@')[0] ?? 'Player';
  const noLinkedPlayer = stats && stats.playerIds.length === 0;
  return (
    <Screen padded={false}>
      <Header />
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.profile}>
          <View style={styles.avatar}><Text variant="h2" style={{ color: colors.accentInk }}>{initials(name)}</Text></View>
          <View style={{ flex: 1 }}>
            <Text variant="h2">{name}</Text>
            <Text variant="caption" tone="muted">Personal career statistics</Text>
          </View>
          <MaterialCommunityIcons name="check-decagram" size={22} color={colors.accent} />
        </View>

        {error && <Pressable onPress={() => void load()}><Card style={styles.errorCard}>
          <Text variant="caption">{error} Tap to retry.</Text>
        </Card></Pressable>}

        {noLinkedPlayer ? (
          <Card style={styles.linkCard}>
            <MaterialCommunityIcons name="account-alert-outline" size={32} color={colors.accent} />
            <Text variant="h3">Player profile not linked</Text>
            <Text variant="body" tone="muted" style={{ textAlign: 'center' }}>
              Ask the tournament organiser to add you using the same display name, or link this account to an existing player.
            </Text>
          </Card>
        ) : stats ? (
          <>
            <View style={styles.careerStrip}>
              <CareerValue label="MATCHES" value={stats.matches} />
              <CareerValue label="RUNS" value={stats.runs} />
              <CareerValue label="WICKETS" value={stats.wickets} />
            </View>
            <View style={styles.tabs}>
              {(['overview', 'batting', 'bowling'] as const).map(item => (
                <Pressable key={item} onPress={() => setSection(item)} style={[styles.tab, section === item && styles.tabActive]}>
                  <Text variant="caption" tone={section === item ? 'accent' : 'muted'}>{item.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            {section === 'overview' && <Overview stats={stats} />}
            {section === 'batting' && <Batting stats={stats} />}
            {section === 'bowling' && <Bowling stats={stats} />}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Header() {
  return <View style={styles.header}>
    <Text variant="overline" tone="muted">PLAYER PROFILE</Text>
    <Text variant="h1">My Stats</Text>
  </View>;
}

function Overview({ stats }: { stats: PersonalStats }) {
  return <View style={styles.sections}>
    <Text variant="overline" tone="muted">CAREER AT A GLANCE</Text>
    <View style={styles.grid}>
      <Metric icon="cricket" label="Batting average" value={average(stats)} />
      <Metric icon="speedometer" label="Strike rate" value={strikeRate(stats)} />
      <Metric icon="bullseye-arrow" label="Bowling average" value={bowlingAverage(stats)} />
      <Metric icon="chart-timeline-variant" label="Economy" value={economy(stats)} />
      <Metric icon="hand-back-right-outline" label="Catches" value={String(stats.catches)} />
      <Metric icon="numeric-6-circle-outline" label="Sixes" value={String(stats.sixes)} />
    </View>
  </View>;
}

function Batting({ stats }: { stats: PersonalStats }) {
  return <View style={styles.sections}>
    <Card><Text variant="h3">Batting</Text>
      <StatLine label="Innings" value={stats.innings} />
      <StatLine label="Runs" value={stats.runs} />
      <StatLine label="Highest score" value={stats.highScore} />
      <StatLine label="Average" value={average(stats)} />
      <StatLine label="Strike rate" value={strikeRate(stats)} />
      <StatLine label="Fours / Sixes" value={`${stats.fours} / ${stats.sixes}`} />
      <StatLine label="Balls faced" value={stats.ballsFaced} />
    </Card>
  </View>;
}

function Bowling({ stats }: { stats: PersonalStats }) {
  return <View style={styles.sections}>
    <Card><Text variant="h3">Bowling</Text>
      <StatLine label="Wickets" value={stats.wickets} />
      <StatLine label="Best in a match" value={`${stats.bestWickets} wickets`} />
      <StatLine label="Overs" value={formatOvers(stats.bowlingBalls)} />
      <StatLine label="Runs conceded" value={stats.runsConceded} />
      <StatLine label="Average" value={bowlingAverage(stats)} />
      <StatLine label="Economy" value={economy(stats)} />
    </Card>
  </View>;
}

function CareerValue({ label, value }: { label: string; value: number }) {
  return <View style={{ flex: 1, alignItems: 'center' }}><Text variant="h2">{value}</Text><Text variant="caption" tone="dim">{label}</Text></View>;
}
function Metric({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <Card style={styles.metric}><MaterialCommunityIcons name={icon} size={21} color={colors.accent} />
    <Text variant="h2" style={{ marginTop: spacing.md }}>{value}</Text><Text variant="caption" tone="muted">{label}</Text>
  </Card>;
}
function StatLine({ label, value }: { label: string; value: string | number }) {
  return <View style={styles.statLine}><Text variant="body" tone="muted">{label}</Text><Text variant="bodyStrong">{value}</Text></View>;
}
function average(stats: PersonalStats) {
  return stats.dismissals ? (stats.runs / stats.dismissals).toFixed(2) : stats.runs ? '—' : '0.00';
}
function strikeRate(stats: PersonalStats) {
  return stats.ballsFaced ? ((stats.runs / stats.ballsFaced) * 100).toFixed(2) : '0.00';
}
function bowlingAverage(stats: PersonalStats) {
  return stats.wickets ? (stats.runsConceded / stats.wickets).toFixed(2) : '—';
}
function economy(stats: PersonalStats) {
  return stats.bowlingBalls ? ((stats.runsConceded / stats.bowlingBalls) * 6).toFixed(2) : '—';
}
function formatOvers(balls: number) { return `${Math.floor(balls / 6)}.${balls % 6}`; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join(''); }

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  content: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl, gap: spacing.lg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyText: { textAlign: 'center' },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  errorCard: { borderColor: colors.danger },
  linkCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  careerStrip: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.xl, paddingVertical: spacing.lg, borderWidth: 1, borderColor: colors.border },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  sections: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { width: '48%' },
  statLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
});
