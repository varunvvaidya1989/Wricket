import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/wricket/ui/Text';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { TeamCrest } from '@/components/wricket/ui/DesignIcon';
import { CricketMatchCard } from '@/components/wricket/ui/CricketMatchCard';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { RosterManagementSheet } from '@/components/wricket/teams/RosterManagementSheet';
import { getSupabaseClient } from '@/lib/supabase/client';
import { teamManagementApi, type TeamRosterMember } from '@/lib/supabase/teamManagementApi';
import { liveMatchApi, type CloudLiveMatch } from '@/lib/supabase/liveMatchApi';
import { rosterPermissions, playerInitials, rosterDescription } from '@/lib/wricket/presentation/teamManagement';
import { colors } from '@/lib/wricket/presentation/design';
import { radius, spacing } from '@/lib/theme/spacing';
import { TeamHeadToHeadItem, TeamInsights, TeamMatchHistoryItem, teamInsightsApi } from '@/lib/supabase/teamInsightsApi';

interface ManagedTeam {
  name: string;
  shortName: string;
  ownerId?: string;
  organizerId?: string;
  colorHex: string;
  tournamentId?: string;
  logoUrl?: string;
  location?: string;
  format?: string;
}

type TeamDetailTab = 'squad' | 'stats' | 'history';

export default function TeamManagementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const auth = useAuth();
  const [team, setTeam] = useState<ManagedTeam>();
  const [members, setMembers] = useState<TeamRosterMember[]>([]);
  const [insights, setInsights] = useState<TeamInsights>();
  const [onField, setOnField] = useState<CloudLiveMatch | null>();
  const [updatingLogo, setUpdatingLogo] = useState(false);
  const [activeTab, setActiveTab] = useState<TeamDetailTab>('squad');
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string>();
  const [insightsError, setInsightsError] = useState<string>();
  const permissions = rosterPermissions(auth.session?.user.id, [team?.ownerId, team?.organizerId], members);
  const activeMembers = members.filter(member => member.status === 'ACTIVE');

  const load = useCallback(async () => {
    if (!id) throw new Error('Team link is missing.');
    const { data, error: teamError } = await getSupabaseClient().from('teams')
      .select('name,short_name,color_hex,logo_url,tournament_id,entity_owner_id,tournaments(created_by,location,format)')
      .eq('id', id).single();
    if (teamError) throw teamError;
    const tournament = Array.isArray(data.tournaments) ? data.tournaments[0] : data.tournaments;
    const roster = await teamManagementApi.listRoster(id);
    setTeam({ name: data.name, shortName: data.short_name, ownerId: data.entity_owner_id ?? undefined,
      organizerId: tournament?.created_by, colorHex: data.color_hex, tournamentId: data.tournament_id ?? undefined,
      logoUrl: data.logo_url ?? undefined, location: tournament?.location, format: tournament?.format });
    setMembers(roster); setError(undefined);
    const [stats, current] = await Promise.allSettled([teamInsightsApi.get(id), teamManagementApi.onFieldMatch(id)]);
    setInsightsError(undefined);
    if (stats.status === 'fulfilled') setInsights(stats.value);
    else setInsightsError(stats.reason instanceof Error ? stats.reason.message : 'Could not load team stats');
    if (current.status === 'fulfilled') setOnField(current.value);
    else { setOnField(undefined); setInsightsError(current.reason instanceof Error ? current.reason.message : 'Could not load current match'); }
  }, [id]);

  useFocusEffect(useCallback(() => {
    void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load team'));
  }, [load]));

  const currentMatchId = onField?.id;
  useFocusEffect(useCallback(() => {
    if (!currentMatchId) return;
    return liveMatchApi.subscribe(currentMatchId,
      () => { void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not refresh team activity')); },
      message => setInsightsError(message));
  }, [currentMatchId, load]));

  const chooseTeamLogo = async () => {
    if (!id || !auth.session || !permissions.canManage || updatingLogo) return;
    setUpdatingLogo(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Allow photo access to choose a team logo.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.82 });
      if (!result.canceled) { await teamManagementApi.updateLogo(id, result.assets[0].uri, auth.session.user.id); await load(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update team logo'); }
    finally { setUpdatingLogo(false); }
  };

  return <Screen padded={false}>
    <Stack.Screen options={{ headerShown: false }} />
    <WricketHeader title="Team" backTo="/wricket/my-wricket" />
    {!team ? error ? <StateNotice error title="Team unavailable" detail={error} action={{ label: 'Try again', onPress: () => void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load team')) }} />
      : <SportStageLoader message="Opening team" detail="Loading the current roster" /> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {error ? <StateNotice error title="Team update failed" detail={error} action={{ label: 'Retry team', onPress: () => void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not refresh team')) }} /> : null}
      <View style={{ gap: 20 }}>
        <View style={styles.hero}>
          <Pressable accessibilityRole="button" accessibilityLabel={permissions.canManage ? 'Change team logo' : 'Team logo'} disabled={!permissions.canManage || updatingLogo} onPress={() => void chooseTeamLogo()}>
            {team.logoUrl ? <Image source={{ uri: team.logoUrl }} style={{ width: 33, height: 36, borderRadius: 5 }} /> : <TeamCrest name={team.name} />}
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}><Text variant="overline" tone="muted">{[team.location, team.format ? team.format.replaceAll('_', ' ') + ' CRICKET' : 'CRICKET CLUB'].filter(Boolean).join(' · ')}</Text><Text variant="h1" style={{ marginTop: 8 }}>{team.name}</Text></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="overline" tone="muted" style={styles.membership}>{permissions.owner ? 'YOUR TEAM' : permissions.isCaptain ? 'TEAM CAPTAIN' : auth.session?.user.id && members.some(member => member.accountId === auth.session?.user.id) ? 'YOUR TEAM' : 'TEAM ROSTER'}</Text>
          {permissions.canManage ? <Button title="Manage roster" size="sm" variant="ghost" onPress={() => setManaging(true)} /> : null}
        </View>
        {updatingLogo ? <Text variant="caption" tone="muted">Updating team logo…</Text> : null}
      </View>
      {activeTab === 'squad' ? <>
        <View style={{ gap: 13 }}><Text variant="overline" tone="muted">ON THE FIELD</Text>
          {onField ? <CricketMatchCard match={onField} onPress={() => router.push({ pathname: '/wricket/match/[id]/live', params: { id: onField.id } })} />
            : <Card><Text variant="bodyStrong">{onField === undefined ? insightsError ? 'Current match unavailable' : 'Loading team activity…' : 'No match on the field yet.'}</Text><Text variant="caption" tone="muted" style={{ marginTop: 8 }}>Live and upcoming fixtures appear here when this team has a match.</Text></Card>}
        </View>
        <View style={{ gap: 13 }}><Text variant="overline" tone="muted">{'PLAYING ROSTER · ' + activeMembers.length}</Text>
          <Card style={{ paddingVertical: 0, paddingHorizontal: 16 }}>
            {activeMembers.length ? activeMembers.map((member, index) => <Pressable key={member.playerId} accessibilityRole="button" accessibilityLabel={'View player ' + member.name} onPress={() => router.push({ pathname: '/wricket/player/[id]', params: { id: member.playerId } })} style={[styles.playerRow, index === activeMembers.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.jerseyBadge}><Text variant="caption" style={{ fontSize: 9, color: '#d7f3cd' }}>{playerInitials(member.name)}</Text></View><View style={{ flex: 1, minWidth: 0 }}><Text variant="bodyStrong">{member.name}</Text><Text variant="caption" tone="muted" style={{ marginTop: 3 }}>{rosterDescription(member)}</Text></View>
            </Pressable>) : <View style={{ paddingVertical: 18, gap: 8 }}><Text variant="bodyStrong">Build your playing roster.</Text><Text variant="caption" tone="muted">{permissions.owner ? 'Assign a captain first. The captain can then add registered players.' : 'The team owner assigns a captain, who adds the players.'}</Text>{permissions.canManage ? <Button title="Open roster management" variant="secondary" onPress={() => setManaging(true)} /> : null}</View>}
          </Card>
        </View>
      </> : activeTab === 'stats' ? insights ? <>
        {insights.stats.played > 0 ? <View style={styles.statStrip}><RosterStat label="PLAYED" value={String(insights.stats.played)} /><RosterStat label="WON" value={String(insights.stats.won)} /><RosterStat label="WIN RATE" value={Math.round(insights.stats.winRate) + '%'} /></View> : null}
        <TeamStats insights={insights} playerCount={activeMembers.length} /><HeadToHead rows={insights.headToHead} onOpenTeam={teamId => router.push({ pathname: '/wricket/team/[id]', params: { id: teamId } })} />
      </> : <Text tone="muted">Team stats unavailable. Try refreshing this team.</Text> : insights ? <MatchHistory matches={insights.history} onOpenMatch={matchId => router.push({ pathname: '/wricket/match/[id]/live', params: { id: matchId, tab: 'summary' } })} /> : <Text tone="muted">Team history unavailable. Try refreshing this team.</Text>}
      {insightsError ? <StateNotice error title="Team activity unavailable" detail={insightsError} action={{ label: 'Retry activity', onPress: () => void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not refresh team')) }} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>{(['squad', 'stats', 'history'] as const).map(value => <Button key={value} title={value === 'squad' ? 'Squad' : value === 'stats' ? 'Stats' : 'History'} variant={activeTab === value ? 'secondary' : 'ghost'} style={{ flex: 1 }} onPress={() => setActiveTab(value)} />)}</View>
      {permissions.canManage && id ? <RosterManagementSheet key={id} visible={managing} teamId={id} teamName={team.name} accountId={auth.session?.user.id} ownerIds={[team.ownerId, team.organizerId]} members={members} onClose={() => setManaging(false)} onChanged={load} /> : null}
    </ScrollView>}
  </Screen>;
}


function TeamStats({ insights, playerCount }: { insights?: TeamInsights; playerCount: number }) {
  const stats = insights?.stats;
  if (!stats?.played) return <Card><Text variant="h3">Team stats start with your first result.</Text><Text variant="caption" tone="muted" style={styles.helper}>Completed matches build the team record across tournament entries and friendly matches.</Text></Card>;
  return <Card>
    <Text variant="h3">Team stats</Text>
    <Text variant="caption" tone="muted" style={styles.helper}>Across every tournament entry and friendly match.</Text>
    <View style={styles.metricGrid}>
      <TeamMetric label="PLAYERS" value={String(playerCount)} />
      <TeamMetric label="RUNS SCORED" value={String(stats?.runsFor ?? 0)} />
      <TeamMetric label="RUNS CONCEDED" value={String(stats?.runsAgainst ?? 0)} />
      <TeamMetric label="HIGHEST INNINGS" value={String(stats?.highestScore ?? 0)} />
      <TeamMetric label="LOST" value={String(stats?.lost ?? 0)} />
      <TeamMetric label="TIED / NR" value={String((stats?.tied ?? 0) + (stats?.noResult ?? 0))} />
    </View>
  </Card>;
}

function TeamMetric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text variant="overline" tone="dim">{label}</Text><Text variant="h3">{value}</Text></View>;
}

function HeadToHead({ rows, onOpenTeam }: {
  rows: TeamHeadToHeadItem[];
  onOpenTeam: (teamId: string) => void;
}) {
  return <View>
    <Text variant="overline" tone="muted">HEAD TO HEAD</Text>
    <View style={styles.insightList}>
      {rows.length ? rows.map(row => (
        <Pressable key={row.opponentTeamId} onPress={() => onOpenTeam(row.opponentTeamId)} style={styles.insightRow}>
          <View style={styles.opponentBadge}><Text variant="caption">{row.opponentShortName.slice(0, 3).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{row.opponentName}</Text>
            <Text variant="caption" tone="muted">{row.played} played · Last {formatMatchDate(row.lastPlayedAt)}</Text>
          </View>
          <View style={styles.h2hRecord}>
            <Text variant="bodyStrong" tone="accent">{row.won}W</Text>
            <Text variant="caption" tone="muted">{row.lost}L · {row.tied + row.noResult}T/NR</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textDim} />
        </Pressable>
      )) : <Card><Text variant="caption" tone="muted">Head-to-head records appear after this team completes a match.</Text></Card>}
    </View>
  </View>;
}

function MatchHistory({ matches, onOpenMatch }: {
  matches: TeamMatchHistoryItem[];
  onOpenMatch: (matchId: string) => void;
}) {
  return <View>
    <Text variant="overline" tone="muted">MATCH HISTORY</Text>
    <View style={styles.insightList}>
      {matches.length ? matches.map(match => (
        <Pressable key={match.id} onPress={() => onOpenMatch(match.id)} style={styles.historyRow}>
          <View style={[styles.outcomeBadge, outcomeStyle(match.outcome)]}>
            <Text variant="bodyStrong" style={outcomeTextStyle(match.outcome)}>{match.outcome}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">vs {match.opponentName}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {formatMatchDate(match.playedAt)} · {match.tournamentName ?? 'Friendly match'} · {match.format}
            </Text>
          </View>
          <View style={styles.historyScore}>
            <Text variant="bodyStrong">{match.runsFor}</Text>
            <Text variant="caption" tone="muted">– {match.runsAgainst}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textDim} />
        </Pressable>
      )) : <Card><Text variant="caption" tone="muted">No completed matches yet.</Text></Card>}
    </View>
  </View>;
}

function formatMatchDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function outcomeStyle(outcome: TeamMatchHistoryItem['outcome']) {
  if (outcome === 'W') return styles.outcomeWin;
  if (outcome === 'L') return styles.outcomeLoss;
  return styles.outcomeNeutral;
}

function outcomeTextStyle(outcome: TeamMatchHistoryItem['outcome']) {
  if (outcome === 'W') return { color: colors.accent };
  if (outcome === 'L') return { color: colors.danger };
  return { color: colors.textMuted };
}
function RosterStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <Card style={styles.statCard}><Text variant="overline" tone="dim">{label}</Text><Text variant={detail ? 'bodyStrong' : 'h2'} numberOfLines={1}>{value}</Text>{detail ? <Text variant="caption" tone="accent">{detail}</Text> : null}</Card>;
}

const styles = StyleSheet.create({
  content: { gap: 25, paddingHorizontal: 18, paddingTop: 19, paddingBottom: spacing.xxxl },
  membership: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 4, fontSize: 8, letterSpacing: 0 },
  teamHeader: { gap: spacing.md },
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  badge: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamLogo: { width: '100%', height: '100%', borderRadius: radius.md },
  logoEdit: { position: 'absolute', right: -5, bottom: -5, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  statStrip: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, minWidth: 0, padding: spacing.md, gap: spacing.xs },
  helper: { marginTop: spacing.sm },
  input: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    padding: spacing.md,
  },
  searchResults: { marginTop: spacing.sm },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  roster: { gap: spacing.sm, marginTop: spacing.sm },
  playerList: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  playerRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  jerseyBadge: { width: 33, height: 33, borderRadius: 17, backgroundColor: '#34472f', borderWidth: 1, borderColor: '#65755d', alignItems: 'center', justifyContent: 'center' },
  keeperChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  keeperChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  metricGrid: { marginTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { minWidth: 92, flexBasis: '30%', flexGrow: 1, padding: spacing.md, gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  insightList: { marginTop: spacing.sm, gap: spacing.sm },
  insightRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  opponentBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderStrong },
  h2hRecord: { alignItems: 'flex-end', gap: 2 },
  historyRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  outcomeBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  outcomeWin: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  outcomeLoss: { backgroundColor: 'rgba(224, 57, 75, 0.12)', borderColor: colors.danger },
  outcomeNeutral: { backgroundColor: colors.surfaceElevated, borderColor: colors.borderStrong },
  historyScore: { minWidth: 42, alignItems: 'flex-end' },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
