import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { legacyPlayerLinkApi } from '@/lib/supabase/legacyPlayerLinkApi';
import { PerformanceFormEntry, PersonalStats, personalStatsApi } from '@/lib/supabase/personalStatsApi';
import { playerProfileApi } from '@/lib/supabase/playerProfileApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { formBarPercent, formTrend, isPeakForm, formatRate } from '@/lib/wricket/performance';

type Section = 'overview' | 'batting' | 'bowling';
type FormMode = 'batting' | 'bowling';

export default function StatsScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const auth = useAuth();
  const router = useRouter();
  const { playerId, playerName } = useLocalSearchParams<{ playerId?: string; playerName?: string }>();
  const [stats, setStats] = useState<PersonalStats>();
  const [section, setSection] = useState<Section>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [linkNeeded, setLinkNeeded] = useState(false);

  const load = useCallback(async () => {
    if (!auth.session) { setStats(undefined); return; }
    setLoading(true);
    try {
      if (playerId) {
        setLinkNeeded(false);
        setStats(await personalStatsApi.getForPlayerIds([playerId]));
        setError(undefined);
        return;
      }
      const resolution = await legacyPlayerLinkApi.resolve(auth.profile?.displayName ?? 'Player');
      if (resolution.status === 'CANDIDATES' || resolution.status === 'CONTACT_CONFLICT') {
        setLinkNeeded(true); setStats(undefined); return;
      }
      setLinkNeeded(false);
      if (resolution.status === 'NO_MATCH') await playerProfileApi.ensureMine(auth.session.user.id, auth.profile?.displayName ?? 'Player');
      setStats(await personalStatsApi.get(auth.session.user.id));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not load ${playerId ? 'player' : 'your'} performance`);
    } finally { setLoading(false); }
  }, [auth.profile?.displayName, auth.session, playerId]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  if (!auth.session) {
    return <SectionScreen embedded={embedded}>{!embedded ? <Header player={Boolean(playerId)} /> : null}<View style={styles.signedOut}>
      <View style={styles.signedOutIcon}><MaterialCommunityIcons name="chart-box-outline" size={38} color={colors.accent} /></View>
      <Text variant="h2">Your cricket record</Text>
      <Text tone="muted" style={styles.centeredText}>Sign in to see performance belonging to your player profile.</Text>
      <Pressable style={styles.primaryButton} onPress={() => router.push('/account')}><Text variant="bodyStrong" style={{ color: colors.accentInk }}>Sign in</Text></Pressable>
    </View></SectionScreen>;
  }

  const name = playerId ? playerName ?? 'Player' : auth.profile?.displayName ?? auth.session.user.email?.split('@')[0] ?? 'Player';
  const profilePlayerId = playerId ?? stats?.playerIds[0];
  return <SectionScreen embedded={embedded}>
    {!embedded ? <Header player={Boolean(playerId)} /> : null}
    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} contentContainerStyle={styles.content}>
      <Pressable style={styles.profile} disabled={!profilePlayerId} onPress={() => profilePlayerId && router.push({ pathname: '/wricket/player/[id]', params: { id: profilePlayerId } })}>
        <View style={styles.avatar}><Text variant="h2" tone="accent">{initials(name)}</Text></View>
        <View style={{ flex: 1 }}><Text variant="h2">{name}</Text><Text variant="caption" tone="muted">{playerId ? 'Player performance record' : 'Personal performance record'}</Text></View>
        <MaterialCommunityIcons name="check-decagram" size={22} color={colors.accent} />
      </Pressable>

      {error && <Pressable onPress={() => void load()}><Card style={styles.errorCard}><Text variant="caption">{error} Tap to retry.</Text></Card></Pressable>}
      {linkNeeded && <Card style={styles.linkCard}><MaterialCommunityIcons name="account-search-outline" size={32} color={colors.accent} /><Text variant="h3">Connect your previous player record</Text><Text tone="muted" style={styles.centeredText}>Review the possible AuctionYodha profile before creating a new player.</Text><Pressable style={styles.primaryButton} onPress={() => router.push('/account')}><Text variant="bodyStrong" style={{ color: colors.accentInk }}>Review profiles</Text></Pressable></Card>}

      {stats?.matches === 0 ? <PerformanceEmpty player={Boolean(playerId)} onExplore={() => router.navigate({ pathname: '/wricket/my-wricket', params: { section: 'tournaments' } })} /> : stats ? <>
        <View style={styles.careerStrip}><CareerValue label="MATCHES" value={stats.matches} /><CareerValue label="RUNS" value={stats.runs} /><CareerValue label="WICKETS" value={stats.wickets} /></View>
        <View style={styles.tabs}>{(['overview', 'batting', 'bowling'] as const).map(item => <Pressable key={item} onPress={() => setSection(item)} style={[styles.tab, section === item && styles.tabActive]}><Text variant="caption" tone={section === item ? 'accent' : 'muted'} style={styles.tabLabel}>{item.toUpperCase()}</Text></Pressable>)}</View>
        {section === 'overview' && <Overview stats={stats} />}
        {section === 'batting' && <Batting stats={stats} />}
        {section === 'bowling' && <Bowling stats={stats} />}
      </> : null}
    </ScrollView>
  </SectionScreen>;
}

function SectionScreen({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  return embedded ? <View style={styles.embeddedScreen}>{children}</View> : <Screen padded={false}>{children}</Screen>;
}

function Header({ player = false }: { player?: boolean }) {
  return <View style={styles.header}><Text variant="overline" tone="muted">PLAYER PROFILE</Text><Text variant="h1">{player ? 'Player Performance' : 'My Performance'}</Text></View>;
}

function Overview({ stats }: { stats: PersonalStats }) {
  return <View style={styles.sections}>
    <CurrentForm stats={stats} />
    <Text variant="overline" tone="muted">CAREER AT A GLANCE</Text>
    <View style={styles.grid}>
      <Metric icon="cricket" label="Batting average" value={formatRate(stats.runs, stats.dismissals)} />
      <Metric icon="speedometer" label="Strike rate" value={formatRate(stats.runs, stats.ballsFaced, 100)} />
      <Metric icon="bullseye-arrow" label="Bowling average" value={formatRate(stats.runsConceded, stats.wickets)} />
      <Metric icon="chart-timeline-variant" label="Economy" value={formatRate(stats.runsConceded, stats.bowlingBalls, 6)} />
      <Metric icon="hand-back-right-outline" label="Catches" value={String(stats.catches)} />
      <Metric icon="numeric-6-circle-outline" label="Sixes" value={String(stats.sixes)} />
    </View>
  </View>;
}

function CurrentForm({ stats }: { stats: PersonalStats }) {
  const primaryMode: FormMode = stats.bowlingBalls > stats.ballsFaced ? 'bowling' : 'batting';
  const [mode, setMode] = useState<FormMode>(primaryMode);
  useEffect(() => setMode(primaryMode), [primaryMode]);
  const entries = mode === 'batting' ? stats.recentScores : stats.recentWickets;
  const trend = formTrend(entries);
  const trendMeta = trend === 'up' ? { symbol: '↑', label: 'TRENDING UP', accent: true } : trend === 'down' ? { symbol: '↓', label: 'FORM DIP', accent: false } : { symbol: '→', label: 'STEADY', accent: false };
  return <View style={styles.formCard}>
    <View style={styles.formHeader}><Text variant="bodyStrong">Current Form</Text><Text variant="caption" tone={trendMeta.accent ? 'accent' : 'dim'}>{trendMeta.symbol} {trendMeta.label}</Text></View>
    <View style={styles.formToggle}>
      <FormToggle label="RUNS" active={mode === 'batting'} disabled={!stats.recentScores.length} onPress={() => setMode('batting')} />
      <FormToggle label="WICKETS" active={mode === 'bowling'} disabled={!stats.recentWickets.length} onPress={() => setMode('bowling')} />
    </View>
    {entries.length ? <View style={styles.formChart}>{[...entries].reverse().map((entry, index) => <FormBar key={`${entry.matchId}-${index}`} entry={entry} entries={entries} />)}</View> : <View style={styles.formEmpty}><Text variant="caption" tone="dim">No {mode} form recorded yet.</Text></View>}
  </View>;
}

function FormToggle({ label, active, disabled, onPress }: { label: string; active: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.formToggleItem, active && styles.formToggleActive, disabled && { opacity: 0.35 }]}><Text variant="overline" tone={active ? 'accent' : 'muted'}>{label}</Text></Pressable>;
}

function FormBar({ entry, entries }: { entry: PerformanceFormEntry; entries: PerformanceFormEntry[] }) {
  return <View style={styles.formBarWrap}><Text variant="caption" tone="muted" style={styles.formBarValue}>{entry.value}</Text><View style={styles.formBarArea}><View style={[styles.formBar, { height: `${formBarPercent(entry.value, entries)}%` }, isPeakForm(entry.value, entries) && styles.formBarBest]} /></View><Text variant="overline" tone="dim" style={styles.formBarLabel}>{entry.label}</Text></View>;
}

function Batting({ stats }: { stats: PersonalStats }) {
  return <View style={styles.sections}><Card><Text variant="h3">Batting</Text><StatLine label="Innings" value={stats.innings} /><StatLine label="Runs" value={stats.runs} /><StatLine label="Highest score" value={stats.highScore} /><StatLine label="Average" value={formatRate(stats.runs, stats.dismissals)} /><StatLine label="Strike rate" value={formatRate(stats.runs, stats.ballsFaced, 100)} /><StatLine label="Fours / Sixes" value={`${stats.fours} / ${stats.sixes}`} /><StatLine label="Balls faced" value={stats.ballsFaced} /></Card></View>;
}

function Bowling({ stats }: { stats: PersonalStats }) {
  return <View style={styles.sections}><Card><Text variant="h3">Bowling</Text><StatLine label="Wickets" value={stats.wickets} /><StatLine label="Best in a match" value={`${stats.bestWickets} wickets`} /><StatLine label="Overs" value={formatOvers(stats.bowlingBalls)} /><StatLine label="Runs conceded" value={stats.runsConceded} /><StatLine label="Average" value={formatRate(stats.runsConceded, stats.wickets)} /><StatLine label="Economy" value={formatRate(stats.runsConceded, stats.bowlingBalls, 6)} /></Card></View>;
}

function PerformanceEmpty({ onExplore, player }: { onExplore: () => void; player?: boolean }) {
  return <View style={styles.performanceEmpty}><MaterialCommunityIcons name="chart-line" size={24} color={colors.textMuted} /><Text variant="h3">{player ? 'No performance recorded yet' : 'Your performance starts here'}</Text><Text tone="muted" style={styles.emptyBody}>{player ? 'Form and milestones will appear after this player completes a match.' : 'Complete your first match and your form, milestones, and career record will appear automatically.'}</Text>{!player ? <Pressable onPress={onExplore} style={styles.emptyCta}><Text variant="caption" style={{ color: colors.accentInk }}>EXPLORE TOURNAMENTS</Text></Pressable> : null}</View>;
}

function CareerValue({ label, value }: { label: string; value: number }) { return <View style={styles.careerValue}><Text variant="h2">{value}</Text><Text variant="caption" tone="dim">{label}</Text></View>; }
function Metric({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) { const undefinedValue = value === '—'; return <Card style={styles.metric}><MaterialCommunityIcons name={icon} size={21} color={undefinedValue ? colors.textDim : colors.accent} /><Text variant="h2" style={[styles.metricValue, undefinedValue && { color: colors.textDim }]}>{value}</Text><Text variant="caption" tone="muted">{label}</Text></Card>; }
function StatLine({ label, value }: { label: string; value: string | number }) { const undefinedValue = value === '—'; return <View style={styles.statLine}><Text tone="muted">{label}</Text><Text variant="bodyStrong" style={undefinedValue ? { color: colors.textDim } : undefined}>{value}</Text></View>; }
function formatOvers(balls: number) { return `${Math.floor(balls / 6)}.${balls % 6}`; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join(''); }

const styles = StyleSheet.create({
  embeddedScreen: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  content: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl, gap: spacing.lg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  signedOut: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  signedOutIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  centeredText: { textAlign: 'center' },
  primaryButton: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  errorCard: { borderColor: colors.danger },
  linkCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  careerStrip: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.lg, borderWidth: 1, borderColor: colors.border },
  careerValue: { flex: 1, alignItems: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabLabel: { fontSize: 9.5 },
  sections: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { width: '48%' },
  metricValue: { marginTop: spacing.md },
  statLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  formCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  formToggle: { flexDirection: 'row', alignSelf: 'flex-start', gap: spacing.xs, marginBottom: spacing.md, padding: 3, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  formToggleItem: { minWidth: 64, alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: 4 },
  formToggleActive: { backgroundColor: colors.accentMuted },
  formChart: { height: 102, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.xs },
  formBarWrap: { width: 46, alignItems: 'center', gap: 4 },
  formBarArea: { width: '100%', height: 68, justifyContent: 'flex-end' },
  formBar: { width: '100%', minHeight: 10, borderTopLeftRadius: 5, borderTopRightRadius: 5, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.accentMuted },
  formBarBest: { backgroundColor: colors.accent },
  formBarLabel: { fontSize: 8.5 },
  formBarValue: { fontSize: 9 },
  formEmpty: { height: 70, alignItems: 'center', justifyContent: 'center' },
  performanceEmpty: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: 26, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  emptyBody: { maxWidth: 300, textAlign: 'center', lineHeight: 20 },
  emptyCta: { marginTop: spacing.xs, paddingHorizontal: 18, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.accent },
});
