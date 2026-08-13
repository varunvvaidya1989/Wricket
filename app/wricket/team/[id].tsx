import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { AppHeader } from '@/components/ui/AppHeader';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  RegisteredPlayerSearchResult,
  TeamInvitation,
  TeamRosterMember,
  TeamRole,
  teamManagementApi,
} from '@/lib/supabase/teamManagementApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import {
  TeamHeadToHeadItem,
  TeamInsights,
  TeamMatchHistoryItem,
  teamInsightsApi,
} from '@/lib/supabase/teamInsightsApi';

interface ManagedTeam {
  name: string;
  shortName: string;
  ownerId: string;
  colorHex: string;
  tournamentId?: string;
  logoUrl?: string;
}

type TeamDetailTab = 'squad' | 'stats' | 'history';

const TEAM_DETAIL_TABS: { id: TeamDetailTab; label: string }[] = [
  { id: 'squad', label: 'Squad' },
  { id: 'stats', label: 'Stats' },
  { id: 'history', label: 'History' },
];

export default function TeamManagementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const auth = useAuth();
  const [team, setTeam] = useState<ManagedTeam>();
  const [members, setMembers] = useState<TeamRosterMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [email, setEmail] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegisteredPlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingPlayerId, setSavingPlayerId] = useState<string>();
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [insights, setInsights] = useState<TeamInsights>();
  const [updatingLogo, setUpdatingLogo] = useState(false);
  const [activeTab, setActiveTab] = useState<TeamDetailTab>('squad');
  const isOwner = team?.ownerId === auth.session?.user.id;
  const captain = members.find(member => member.role === 'CAPTAIN' && member.status === 'ACTIVE');
  const isCaptain = captain?.accountId === auth.session?.user.id;
  const roleToAdd: TeamRole | undefined = isOwner && !captain
    ? 'CAPTAIN'
    : isCaptain
      ? 'PLAYER'
      : undefined;

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await getSupabaseClient().from('teams')
      .select('name, short_name, color_hex, logo_url, tournament_id, entity_owner_id, tournaments(created_by)')
      .eq('id', id)
      .single();
    if (error) throw error;
    const tournament = Array.isArray(data.tournaments) ? data.tournaments[0] : data.tournaments;
    setTeam({
      name: data.name,
      shortName: data.short_name,
      ownerId: data.entity_owner_id ?? tournament?.created_by,
      colorHex: data.color_hex,
      tournamentId: data.tournament_id ?? undefined,
      logoUrl: data.logo_url ?? undefined,
    });
    const [roster, teamInsights] = await Promise.all([
      teamManagementApi.listRoster(id),
      teamInsightsApi.get(id),
    ]);
    setMembers(roster);
    setInsights(teamInsights);
    if ((data.entity_owner_id ?? tournament?.created_by) === auth.session?.user.id) {
      setInvitations(await teamManagementApi.listInvitations(id));
    } else {
      setInvitations([]);
    }
  }, [auth.session?.user.id, id]);

  useFocusEffect(useCallback(() => {
    void load().catch(showError);
  }, [load]));

  useEffect(() => {
    if (!id || !roleToAdd || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      teamManagementApi.searchRegisteredPlayers(id, query)
        .then(setResults)
        .catch(showError)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [id, query, roleToAdd]);

  const activeInvitations = useMemo(
    () => invitations.filter(invite =>
      invite.role === 'CAPTAIN'
      && !invite.revokedAt
      && new Date(invite.expiresAt) > new Date(),
    ),
    [invitations],
  );
  const activeMembers = members.filter(member => member.status === 'ACTIVE');

  const assign = async (player: RegisteredPlayerSearchResult) => {
    if (!id || !roleToAdd || player.currentRole || (roleToAdd === 'CAPTAIN' && !player.accountId)) return;
    setSavingPlayerId(player.playerId);
    try {
      await teamManagementApi.assignRegisteredPlayer(id, player.playerId, roleToAdd);
      setQuery('');
      setResults([]);
      await load();
    } catch (cause) {
      showError(cause);
    } finally {
      setSavingPlayerId(undefined);
    }
  };

  const createCaptainInvite = async () => {
    if (!id) return;
    setCreatingInvite(true);
    try {
      const invite = await teamManagementApi.createInvitation({
        teamId: id,
        role: 'CAPTAIN',
        invitedEmail: email,
        maxUses: 1,
        expiresInHours: 72,
      });
      await Share.share({
        title: `Captain ${team?.name ?? 'team'}`,
        message: `Captain invitation for ${team?.name ?? 'the team'}\n${invite.link}`,
        url: invite.link,
      });
      setEmail('');
      await load();
    } catch (cause) {
      showError(cause);
    } finally {
      setCreatingInvite(false);
    }
  };

  const removeMember = (member: TeamRosterMember) => {
    if (!id) return;
    Alert.alert(
      member.role === 'CAPTAIN' ? 'Remove captain?' : 'Remove player?',
      `${member.name} will be removed from this team only.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => teamManagementApi.removeTeamPlayer(id, member.playerId)
            .then(load)
            .catch(showError),
        },
      ],
    );
  };

  const toggleKeeper = async (member: TeamRosterMember) => {
    if (!id || (!isOwner && !isCaptain)) return;
    try {
      await teamManagementApi.setWicketKeeper(id, member.playerId, !member.isKeeper);
      await load();
    } catch (cause) {
      showError(cause);
    }
  };

  const chooseTeamLogo = async () => {
    if (!id || !auth.session || (!isOwner && !isCaptain)) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to choose a team logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (result.canceled) return;
    setUpdatingLogo(true);
    try {
      await teamManagementApi.updateLogo(id, result.assets[0].uri, auth.session.user.id);
      await load();
    } catch (cause) {
      showError(cause);
    } finally {
      setUpdatingLogo(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title="Team" back />
      <View style={styles.content}>
        <View style={styles.teamHeader}>
          <View style={styles.hero}>
            <Pressable
              disabled={(!isOwner && !isCaptain) || updatingLogo}
              accessibilityRole="button"
              accessibilityLabel={(isOwner || isCaptain) ? 'Change team logo' : 'Team logo'}
              onPress={() => void chooseTeamLogo()}
              style={[styles.badge, { backgroundColor: team?.colorHex ?? colors.accent }]}
            >
              {team?.logoUrl ? <Image source={{ uri: team.logoUrl }} style={styles.teamLogo} /> : <Text variant="h2" style={{ color: colors.accentInk }}>{team?.shortName ?? 'TM'}</Text>}
              {(isOwner || isCaptain) ? <View style={styles.logoEdit}><MaterialCommunityIcons name={updatingLogo ? 'progress-clock' : 'camera'} size={13} color={colors.accentInk} /></View> : null}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text variant="h1">{team?.name ?? 'Team'}</Text>
              <Text variant="caption" tone={insights?.stats.won ? 'accent' : 'muted'}>
                {insights?.stats.played
                  ? `${insights.stats.won}W – ${insights.stats.lost}L · ${insights.stats.played} matches`
                  : team?.tournamentId ? 'Tournament team' : 'Reusable team entity'}
              </Text>
            </View>
          </View>
          <View accessibilityRole="tablist" style={styles.tabs}>
            {TEAM_DETAIL_TABS.map(tab => (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === tab.id }}
                onPress={() => setActiveTab(tab.id)}
                style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              >
                <Text variant="bodyStrong" tone={activeTab === tab.id ? 'accent' : 'muted'}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {activeTab === 'stats' && <>
          <View style={styles.statStrip}>
            <RosterStat label="PLAYED" value={String(insights?.stats.played ?? 0)} />
            <RosterStat label="WON" value={String(insights?.stats.won ?? 0)} />
            <RosterStat label="WIN RATE" value={`${Math.round(insights?.stats.winRate ?? 0)}%`} />
          </View>
          <TeamStats insights={insights} playerCount={activeMembers.length} />
          <HeadToHead
            rows={insights?.headToHead ?? []}
            onOpenTeam={teamId => router.push({ pathname: '/wricket/team/[id]', params: { id: teamId } })}
          />
        </>}

        {activeTab === 'history' && (
          <MatchHistory
            matches={insights?.history ?? []}
            onOpenMatch={matchId => router.push({
              pathname: '/wricket/match/[id]/live',
              params: { id: matchId, tab: 'summary' },
            })}
          />
        )}

        {activeTab === 'squad' && roleToAdd && (
          <Card>
            <Text variant="h3">{roleToAdd === 'CAPTAIN' ? 'Assign captain' : 'Add players'}</Text>
            <Text variant="body" tone="muted" style={styles.helper}>
              Search registered SportStage players. A player may represent multiple teams.
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search player name"
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />
            {searching && <Text variant="caption" tone="muted" style={styles.helper}>Searching…</Text>}
            <View style={styles.searchResults}>
              {results.map(player => {
                const captainNeedsAccount = roleToAdd === 'CAPTAIN' && !player.accountId;
                const disabled = Boolean(player.currentRole) || captainNeedsAccount || Boolean(savingPlayerId);
                return (
                <Pressable
                  key={player.playerId}
                  disabled={disabled}
                  onPress={() => void assign(player)}
                  style={styles.searchResult}
                >
                  <MaterialCommunityIcons name="account-circle-outline" size={30} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{player.name}</Text>
                    <Text variant="caption" tone="muted">
                      {player.currentRole
                        ? `Already ${player.currentRole.toLowerCase()}`
                        : captainNeedsAccount
                          ? 'SportStage account required for captain'
                          : `Add as ${roleToAdd.toLowerCase()}`}
                    </Text>
                  </View>
                  {savingPlayerId === player.playerId
                    ? <Text variant="caption" tone="muted">Adding…</Text>
                    : <MaterialCommunityIcons name="plus-circle-outline" size={24} color={disabled ? colors.textDim : colors.accent} />}
                </Pressable>
                );
              })}
            </View>
          </Card>
        )}

        {activeTab === 'squad' && isOwner && !captain && (
          <Card>
            <Text variant="h3">Invite captain</Text>
            <Text variant="body" tone="muted" style={styles.helper}>
              Use an invitation only when the captain cannot be found in player search.
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Captain email (optional)"
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />
            <Button
              title="Share captain invite"
              loading={creatingInvite}
              onPress={() => void createCaptainInvite()}
              fullWidth
              style={{ marginTop: spacing.md }}
            />
          </Card>
        )}

        {activeTab === 'squad' && <View>
          <Text variant="overline" tone="muted">ROSTER</Text>
          <View style={styles.playerList}>
            {activeMembers.length ? activeMembers.map((member, index) => (
                <Pressable
                  key={member.playerId}
                  onPress={() => router.push({
                    pathname: '/wricket/player/[id]',
                    params: { id: member.playerId },
                  })}
                  style={styles.playerRow}
                >
                  <View style={styles.jerseyBadge}><Text variant="caption">{member.jerseyNo ?? index + 1}</Text></View>
                  <View style={{ flex: 1 }}><Text variant="bodyStrong">{member.name}</Text>{member.role === 'CAPTAIN' ? <Text variant="caption" tone="accent">CAPTAIN</Text> : null}</View>
                  {(isOwner || isCaptain) ? (
                    <Pressable
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: Boolean(member.isKeeper) }}
                      onPress={event => { event.stopPropagation(); void toggleKeeper(member); }}
                      style={[styles.keeperChip, member.isKeeper && styles.keeperChipActive]}
                    >
                      <MaterialCommunityIcons name="shield-account-outline" size={15} color={member.isKeeper ? colors.accentInk : colors.textMuted} />
                      <Text variant="caption" style={{ color: member.isKeeper ? colors.accentInk : colors.textMuted }}>WK</Text>
                    </Pressable>
                  ) : <Text variant="caption" tone="muted">{rosterRole(member)}</Text>}
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textDim} />
                    {((isOwner && member.role === 'CAPTAIN') || (isCaptain && member.role === 'PLAYER')) && (
                      <Pressable hitSlop={8} accessibilityLabel={`Remove ${member.name}`} onPress={event => { event.stopPropagation(); removeMember(member); }}><MaterialCommunityIcons name="close-circle-outline" size={20} color={colors.danger} /></Pressable>
                    )}
                </Pressable>
              )) : <Text tone="muted">No captain or players have been added.</Text>}
          </View>
        </View>}

        {activeTab === 'squad' && isOwner && activeInvitations.length > 0 && (
          <View>
            <Text variant="overline" tone="muted">ACTIVE CAPTAIN INVITATIONS</Text>
            <View style={styles.roster}>
              {activeInvitations.map(invite => (
                <Card key={invite.id}>
                  <View style={styles.member}>
                    <MaterialCommunityIcons name="link-variant" size={22} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">Captain invitation</Text>
                      <Text variant="caption" tone="muted">{invite.invitedEmail ?? 'Shareable link'}</Text>
                    </View>
                    <Button title="Revoke" size="sm" variant="ghost" onPress={() => {
                      teamManagementApi.revokeInvitation(invite.id).then(load).catch(showError);
                    }} />
                  </View>
                </Card>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'squad' && !roleToAdd && !isOwner && !isCaptain && (
          <Text variant="body" tone="muted">Only the team owner or captain can manage this roster.</Text>
        )}
      </View>
    </Screen>
  );
}


function TeamStats({ insights, playerCount }: { insights?: TeamInsights; playerCount: number }) {
  const stats = insights?.stats;
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

function rosterRole(member: TeamRosterMember): string {
  if (member.isKeeper || member.playerRole === 'WK') return 'WK';
  if (member.playerRole === 'AR') return 'ALL';
  return member.playerRole ?? 'ROLE NOT SET';
}

function showError(cause: unknown) {
  Alert.alert('Team update failed', cause instanceof Error ? cause.message : 'Please try again.');
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  teamHeader: { gap: spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  jerseyBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
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
