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
import { tournamentStatsApi, TournamentPlayerStat } from '@/lib/supabase/tournamentStatsApi';

interface ManagedTeam {
  name: string;
  shortName: string;
  ownerId: string;
  colorHex: string;
  tournamentId: string;
  logoUrl?: string;
}

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
  const [record, setRecord] = useState({ won: 0, lost: 0 });
  const [playerStats, setPlayerStats] = useState<TournamentPlayerStat[]>([]);
  const [updatingLogo, setUpdatingLogo] = useState(false);

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
      .select('name, short_name, color_hex, logo_url, tournament_id, tournaments!inner(created_by)')
      .eq('id', id)
      .single();
    if (error) throw error;
    const tournament = Array.isArray(data.tournaments) ? data.tournaments[0] : data.tournaments;
    setTeam({
      name: data.name,
      shortName: data.short_name,
      ownerId: tournament.created_by,
      colorHex: data.color_hex,
      tournamentId: data.tournament_id,
      logoUrl: data.logo_url ?? undefined,
    });
    const [roster, stats, matchResult] = await Promise.all([
      teamManagementApi.listRoster(id),
      tournamentStatsApi.get(data.tournament_id),
      getSupabaseClient().from('matches').select('team_a_id, team_b_id, status, result').eq('tournament_id', data.tournament_id).in('status', ['COMPLETED', 'WALKOVER']),
    ]);
    setMembers(roster);
    setPlayerStats(stats.players.filter(player => roster.some(member => member.playerId === player.id)));
    if (matchResult.error) throw matchResult.error;
    setRecord(matchResult.data.reduce((next, match) => {
      if (match.team_a_id !== id && match.team_b_id !== id) return next;
      const winner = match.result?.winnerTeamId ?? match.result?.winner_team_id;
      if (!winner) return next;
      return winner === id ? { ...next, won: next.won + 1 } : { ...next, lost: next.lost + 1 };
    }, { won: 0, lost: 0 }));
    if (tournament.created_by === auth.session?.user.id) {
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
  const topScorer = [...playerStats].sort((a, b) => b.runs - a.runs)[0];
  const topWicketTaker = [...playerStats].sort((a, b) => b.wickets - a.wickets)[0];

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
      <AppHeader title="Team roster" back />
      <View style={styles.content}>
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
            <Text variant="caption" tone={record.won ? 'accent' : 'muted'}>{record.won}W – {record.lost}L</Text>
          </View>
        </View>

        <View style={styles.statStrip}>
          <RosterStat label="PLAYERS" value={String(activeMembers.length)} />
          <RosterStat label="TOP RUNS" value={topScorer?.name ?? '—'} detail={topScorer ? String(topScorer.runs) : '0'} />
          <RosterStat label="TOP WICKETS" value={topWicketTaker?.name ?? '—'} detail={topWicketTaker ? String(topWicketTaker.wickets) : '0'} />
        </View>

        {roleToAdd && (
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

        {isOwner && !captain && (
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

        <View>
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
        </View>

        {isOwner && activeInvitations.length > 0 && (
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

        {!roleToAdd && !isOwner && !isCaptain && (
          <Text variant="body" tone="muted">Only the tournament owner or team captain can manage this roster.</Text>
        )}
      </View>
    </Screen>
  );
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
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
