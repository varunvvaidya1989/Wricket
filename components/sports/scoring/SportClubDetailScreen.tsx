import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import {
  sportRosterApi,
  type SportClubMembership,
  type SportClubSummary,
  type SportPlayerSearchResult,
  type SportTeamSummary,
} from '@/lib/supabase/sportRosterApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function SportClubDetailScreen({ sportId }: { sportId: ScoringSportId }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const router = useRouter();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [club, setClub] = useState<SportClubSummary>();
  const [members, setMembers] = useState<SportClubMembership[]>([]);
  const [teams, setTeams] = useState<SportTeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SportPlayerSearchResult[]>([]);
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamShortName, setTeamShortName] = useState('');
  const [teamColor, setTeamColor] = useState('#2563EB');

  const reload = useCallback(() => {
    if (!id) return;
    setLoading(true);
    void Promise.all([
      sportRosterApi.getClub(id),
      sportRosterApi.listClubMemberships(id),
      sportRosterApi.listTeams(id),
      sportRosterApi.canManageClub(id),
    ]).then(([nextClub, nextMembers, nextTeams, nextCanManage]) => {
      setClub(nextClub);
      setMembers(nextMembers);
      setTeams(nextTeams);
      setCanManage(nextCanManage);
    }).catch((cause) => Alert.alert('Could not load club', message(cause)))
      .finally(() => setLoading(false));
  }, [id]);
  useFocusEffect(reload);

  useEffect(() => {
    if (!inviteOpen || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void sportRosterApi.searchPlayers(presentation.catalogCode, query)
        .then((next) => { if (active) setResults(next); })
        .catch((cause) => Alert.alert('Could not search players', message(cause)));
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [inviteOpen, presentation.catalogCode, query]);

  const invite = async (player: SportPlayerSearchResult) => {
    if (!club || saving) return;
    setSaving(true);
    try {
      await sportRosterApi.inviteClubMember(club.id, player.sportProfileId);
      setResults((current) => current.filter((item) => item.sportProfileId !== player.sportProfileId));
      reload();
    } catch (cause) {
      Alert.alert('Could not invite player', message(cause));
    } finally {
      setSaving(false);
    }
  };

  const createTeam = async () => {
    if (!club || !teamName.trim() || saving) return;
    setSaving(true);
    try {
      const teamId = await sportRosterApi.createTeam({
        clubId: club.id,
        name: teamName,
        shortName: teamShortName,
        colorHex: teamColor,
      });
      setTeamOpen(false);
      setTeamName('');
      setTeamShortName('');
      router.push(`/${presentation.routeSegment}/team/${teamId}` as Href);
    } catch (cause) {
      Alert.alert('Could not create team', message(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggleManager = async (member: SportClubMembership) => {
    if (!club || !member.accountId || saving) return;
    setSaving(true);
    try {
      if (member.isManager) {
        await sportRosterApi.revokeAccess({ accessType: 'CLUB', resourceId: club.id, accountId: member.accountId, role: 'MANAGER' });
      } else {
        await sportRosterApi.inviteAccess({ accessType: 'CLUB', resourceId: club.id, accountId: member.accountId, role: 'MANAGER' });
      }
      if (!member.isManager) Alert.alert('Manager invited', `${member.displayName} can accept the manager role from Clubs & teams.`);
      reload();
    } catch (cause) {
      Alert.alert('Could not invite manager', message(cause));
    } finally {
      setSaving(false);
    }
  };

  const endMembership = (member: SportClubMembership) => {
    const remove = member.accountId !== auth.session?.user.id;
    Alert.alert(remove ? 'Remove club member?' : 'Leave club?', 'Active team memberships must be ended first.', [
      { text: 'Cancel', style: 'cancel' },
      { text: remove ? 'Remove' : 'Leave', style: 'destructive', onPress: () => {
        setSaving(true);
        void sportRosterApi.endClubMembership(member.id, remove).then(reload)
          .catch((cause) => Alert.alert('Could not end membership', message(cause)))
          .finally(() => setSaving(false));
      } },
    ]);
  };

  if (loading) return <Screen><View style={styles.center}><ActivityIndicator color={presentation.accent} /><Text variant="caption" tone="muted">Loading club…</Text></View></Screen>;
  if (!club) return <Screen padded={false}><AppHeader title="Club" back /><View style={styles.center}><Text variant="h3">Club unavailable</Text></View></Screen>;

  return (
    <Screen scroll padded={false}>
      <AppHeader title={club.name} eyebrow={`${config.name.toUpperCase()} CLUB`} back />
      <View style={styles.content}>
        <View style={[styles.hero, { borderColor: presentation.accent }]}><View style={[styles.heroIcon, { backgroundColor: `${presentation.accent}16` }]}><MaterialCommunityIcons name="shield-account-outline" size={30} color={presentation.accent} /></View><View style={styles.flex}><Text variant="h1">{club.name}</Text><Text variant="caption" tone="muted">{club.visibility} · {canManage ? 'OWNED BY YOU' : 'MEMBER'}</Text></View></View>

        <View style={styles.headingRow}><Text variant="overline" tone="dim">MEMBERS · {members.filter((item) => item.status === 'ACTIVE').length}</Text>{canManage ? <Pressable onPress={() => setInviteOpen(true)} style={[styles.smallAction, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="account-plus-outline" size={17} color={presentation.accent} /><Text variant="caption" style={{ color: presentation.accent }}>INVITE</Text></Pressable> : null}</View>
        {members.map((member) => <View key={member.id} style={styles.row}><View style={[styles.avatar, { backgroundColor: `${presentation.accent}16` }]}><Text variant="bodyStrong" style={{ color: presentation.accent }}>{initials(member.displayName)}</Text></View><View style={styles.flex}><Text variant="bodyStrong">{member.displayName}</Text><Text variant="caption" tone="muted">{member.status}{member.isManager ? ' · MANAGER' : ''}</Text></View>{member.status === 'ACTIVE' && member.accountId && member.accountId !== club.ownerAccountId ? <View style={styles.rowActions}>{canManage ? <Pressable disabled={saving} onPress={() => void toggleManager(member)}><Text variant="overline" style={{ color: member.isManager ? colors.danger : presentation.accent }}>{member.isManager ? 'REVOKE ROLE' : 'MANAGER'}</Text></Pressable> : null}{canManage || member.accountId === auth.session?.user.id ? <Pressable disabled={saving} onPress={() => endMembership(member)}><MaterialCommunityIcons name={member.accountId === auth.session?.user.id ? 'exit-to-app' : 'account-remove-outline'} size={19} color={colors.danger} /></Pressable> : null}</View> : member.status === 'ACTIVE' ? <MaterialCommunityIcons name="check-decagram" size={19} color={presentation.accent} /> : null}</View>)}

        <View style={styles.headingRow}><Text variant="overline" tone="dim">REUSABLE TEAMS · {teams.length}</Text>{canManage ? <Pressable onPress={() => setTeamOpen(true)} style={[styles.smallAction, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="plus" size={17} color={presentation.accent} /><Text variant="caption" style={{ color: presentation.accent }}>CREATE</Text></Pressable> : null}</View>
        {teams.length ? teams.map((team) => <Pressable key={team.id} onPress={() => router.push(`/${presentation.routeSegment}/team/${team.id}` as Href)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><View style={[styles.teamMark, { backgroundColor: team.colorHex ?? presentation.accent }]} /><View style={styles.flex}><Text variant="bodyStrong">{team.name}</Text><Text variant="caption" tone="muted">{team.shortName || 'CLUB TEAM'}</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color={colors.textDim} /></Pressable>) : <View style={styles.empty}><Text variant="caption" tone="muted">No reusable teams yet.</Text></View>}
      </View>

      <Modal visible={inviteOpen} transparent animationType="fade" onRequestClose={() => setInviteOpen(false)}><View style={styles.overlay}><View style={styles.modalCard}><View style={styles.headingRow}><Text variant="h2">Invite player</Text><Pressable onPress={() => setInviteOpen(false)}><MaterialCommunityIcons name="close" size={24} color={colors.textMuted} /></Pressable></View><Text variant="caption" tone="muted">Only active SportStage {config.name} profiles are shown.</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search players" placeholderTextColor={colors.textDim} style={styles.input} />{results.map((player) => <Pressable key={player.sportProfileId} disabled={saving || members.some((member) => member.sportProfileId === player.sportProfileId && ['ACTIVE', 'INVITED'].includes(member.status))} onPress={() => void invite(player)} style={styles.row}><View style={styles.flex}><Text variant="bodyStrong">{player.displayName}</Text><Text variant="caption" tone="muted">SportStage account</Text></View><Text variant="overline" style={{ color: presentation.accent }}>INVITE</Text></Pressable>)}</View></View></Modal>

      <Modal visible={teamOpen} transparent animationType="fade" onRequestClose={() => setTeamOpen(false)}><View style={styles.overlay}><View style={styles.modalCard}><View style={styles.headingRow}><Text variant="h2">Create reusable team</Text><Pressable onPress={() => setTeamOpen(false)}><MaterialCommunityIcons name="close" size={24} color={colors.textMuted} /></Pressable></View><TextInput value={teamName} onChangeText={setTeamName} placeholder="Team name" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={teamShortName} onChangeText={setTeamShortName} placeholder="Short name (optional)" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={teamColor} onChangeText={setTeamColor} autoCapitalize="characters" maxLength={7} placeholder="#2563EB" placeholderTextColor={colors.textDim} style={styles.input} /><Button title="Create team" disabled={!teamName.trim()} loading={saving} onPress={() => void createTeam()} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>
    </Screen>
  );
}

function initials(value: string): string { return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(''); }
function message(cause: unknown): string { return cause instanceof Error ? cause.message : 'Please try again.'; }

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  hero: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headingRow: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  smallAction: { minHeight: 36, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: { minHeight: 66, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  teamMark: { width: 8, height: 42, borderRadius: radius.pill },
  empty: { padding: spacing.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, alignItems: 'center' },
  overlay: { flex: 1, padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '82%', padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.surface, gap: spacing.md },
  input: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontFamily: 'Inter_500Medium' },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
