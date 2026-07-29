import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
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

interface ManagedTeam {
  name: string;
  shortName: string;
  ownerId: string;
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
      .select('name, short_name, tournaments!inner(created_by)')
      .eq('id', id)
      .single();
    if (error) throw error;
    const tournament = Array.isArray(data.tournaments) ? data.tournaments[0] : data.tournaments;
    setTeam({
      name: data.name,
      shortName: data.short_name,
      ownerId: tournament.created_by,
    });
    const roster = await teamManagementApi.listRoster(id);
    setMembers(roster);
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

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: team?.name ?? 'Team' }} />
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text variant="h2" style={{ color: colors.accentInk }}>{team?.shortName ?? 'TM'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="h1">{team?.name ?? 'Team'}</Text>
            <Text tone="muted">
              {members.filter(member => member.status === 'ACTIVE').length} roster member
              {members.filter(member => member.status === 'ACTIVE').length === 1 ? '' : 's'}
            </Text>
          </View>
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
          <View style={styles.roster}>
            {members.filter(member => member.status === 'ACTIVE').length ? members
              .filter(member => member.status === 'ACTIVE')
              .map(member => (
                <Card
                  key={member.playerId}
                  onPress={() => router.push({
                    pathname: '/wricket/player/[id]',
                    params: { id: member.playerId },
                  })}
                >
                  <View style={styles.member}>
                    <MaterialCommunityIcons
                      name={member.role === 'CAPTAIN' ? 'shield-account' : 'account'}
                      size={24}
                      color={colors.accent}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{member.name}</Text>
                      <Text variant="caption" tone="muted">{member.role}</Text>
                    </View>
                    {((isOwner && member.role === 'CAPTAIN') || (isCaptain && member.role === 'PLAYER')) && (
                      <Button title="Remove" size="sm" variant="ghost" onPress={() => removeMember(member)} />
                    )}
                  </View>
                </Card>
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

function showError(cause: unknown) {
  Alert.alert('Team update failed', cause instanceof Error ? cause.message : 'Please try again.');
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
