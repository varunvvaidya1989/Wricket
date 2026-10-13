import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { StagePage, StageField, StageNotice, StageButton } from '@/components/sports/platform/StageUI';
import { OrganiserButton as Button } from '@/components/sports/platform/OrganiserButton';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { OrganiserText as Text } from '@/components/sports/platform/OrganiserText';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import {
  sportRosterApi,
  type SportClubMembership,
  type SportClubSummary,
  type SportPlayerSearchResult,
  type SportTeamSummary,
} from '@/lib/supabase/sportRosterApi';
import { colors } from '@/lib/wricket/presentation/design';
import { radius, spacing } from '@/lib/theme/spacing';

export function SportClubDetailScreen({ sportId }: { sportId: ScoringSportId }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const router = useRouter();
  const config = SPORT_CONFIGS[sportId];
  const presentation = { ...SPORT_PRESENTATION[sportId], accent: colors.accent };
  const [club, setClub] = useState<SportClubSummary>();
  const [members, setMembers] = useState<SportClubMembership[]>([]);
  const [teams, setTeams] = useState<SportTeamSummary[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const generation = useRef(0);
  const owner = `${auth.session?.user.id ?? 'guest'}:${id}`;
  const [loadedOwner, setLoadedOwner] = useState<string>();
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
    const request = ++generation.current;
    setLoading(true); setLoadError(undefined);
    void Promise.all([
      sportRosterApi.getClub(id),
      sportRosterApi.listClubMemberships(id),
      sportRosterApi.listTeams(id),
      sportRosterApi.canManageClub(id),
    ]).then(([nextClub, nextMembers, nextTeams, nextCanManage]) => {
      if (request !== generation.current) return;
      setLoadedOwner(owner);
      setClub(nextClub);
      setMembers(nextMembers);
      setTeams(nextTeams);
      setCanManage(nextCanManage);
    }).catch((cause) => { if (request === generation.current) { setClub(undefined); setLoadError(message(cause)); } })
      .finally(() => { if (request === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [id, owner]);
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

  if (loading || (club && loadedOwner !== owner)) return <Screen padded={false}><SportStageLoader message={`Opening ${config.name} club`} detail="Loading members, teams, and invitations" accent={presentation.accent} /></Screen>;
  if (!club) return <StagePage focused title="Club" eyebrow={config.name.toUpperCase()}><StageNotice>{loadError ?? "This club could not be opened."}</StageNotice><StageButton title="Try again" onPress={reload} /></StagePage>;

  return (
    <StagePage focused title={club.name} eyebrow={`${config.name.toUpperCase()} CLUB`}>
      <View style={styles.content}>
        <View style={[styles.hero, { borderColor: presentation.accent }]}><View style={[styles.heroIcon, { backgroundColor: `${presentation.accent}16` }]}><MaterialCommunityIcons name="shield-account-outline" size={30} color={presentation.accent} /></View><View style={styles.flex}><Text variant="h1">{club.name}</Text><Text variant="caption" tone="muted">{club.visibility} · {club.ownerAccountId === auth.session?.user.id ? 'OWNER' : canManage ? 'MANAGER' : members.some(member => member.accountId === auth.session?.user.id && member.status === 'ACTIVE') ? 'MEMBER' : 'VIEWER'}</Text></View></View>

        <View style={styles.headingRow}><Text variant="overline" tone="dim">MEMBERS · {members.filter((item) => item.status === 'ACTIVE').length}</Text>{canManage ? <Pressable accessibilityRole="button" accessibilityLabel="Invite player" onPress={() => setInviteOpen(true)} style={[styles.smallAction, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="account-plus-outline" size={17} color={presentation.accent} /><Text variant="caption" style={{ color: presentation.accent }}>INVITE</Text></Pressable> : null}</View>
        {members.map((member) => <View key={member.id} style={styles.row}><View style={[styles.avatar, { backgroundColor: `${presentation.accent}16` }]}><Text variant="bodyStrong" style={{ color: presentation.accent }}>{initials(member.displayName)}</Text></View><View style={styles.flex}><Text variant="bodyStrong">{member.displayName}</Text><Text variant="caption" tone="muted">{member.status}{member.isManager ? ' · MANAGER' : ''}</Text></View>{member.status === 'ACTIVE' && member.accountId && member.accountId !== club.ownerAccountId ? <View style={styles.rowActions}>{canManage ? <Pressable accessibilityRole="button" accessibilityLabel={`${member.isManager ? 'Revoke manager role for' : 'Assign manager role to'} ${member.displayName}`} style={styles.close} disabled={saving} onPress={() => void toggleManager(member)}><Text variant="overline" style={{ color: member.isManager ? colors.danger : presentation.accent }}>{member.isManager ? 'REVOKE ROLE' : 'MANAGER'}</Text></Pressable> : null}{canManage || member.accountId === auth.session?.user.id ? <Pressable accessibilityRole="button" accessibilityLabel={member.accountId === auth.session?.user.id ? 'Leave membership' : `Remove ${member.displayName}`} style={styles.close} disabled={saving} onPress={() => endMembership(member)}><MaterialCommunityIcons name={member.accountId === auth.session?.user.id ? 'exit-to-app' : 'account-remove-outline'} size={19} color={colors.danger} /></Pressable> : null}</View> : member.status === 'ACTIVE' ? <MaterialCommunityIcons name="check-decagram" size={19} color={presentation.accent} /> : null}</View>)}

        <View style={styles.headingRow}><Text variant="overline" tone="dim">REUSABLE TEAMS · {teams.length}</Text>{canManage ? <Pressable accessibilityRole="button" accessibilityLabel="Create reusable team" onPress={() => setTeamOpen(true)} style={[styles.smallAction, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="plus" size={17} color={presentation.accent} /><Text variant="caption" style={{ color: presentation.accent }}>CREATE</Text></Pressable> : null}</View>
        {teams.length ? teams.map((team) => <Pressable key={team.id} onPress={() => router.push(`/${presentation.routeSegment}/team/${team.id}` as Href)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><View style={[styles.teamMark, { backgroundColor: team.colorHex ?? presentation.accent }]} /><View style={styles.flex}><Text variant="bodyStrong">{team.name}</Text><Text variant="caption" tone="muted">{team.shortName || 'CLUB TEAM'}</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color={colors.textDim} /></Pressable>) : <View style={styles.empty}><Text variant="caption" tone="muted">No reusable teams yet.</Text></View>}
      </View>

      <Modal accessibilityLabel="Invite player" visible={inviteOpen} transparent animationType="fade" onRequestClose={() => setInviteOpen(false)}><View style={styles.overlay}><View style={styles.modalCard}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogContent}><View style={styles.headingRow}><Text variant="h2">Invite player</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.close} onPress={() => setInviteOpen(false)}><MaterialCommunityIcons name="close" size={24} color={colors.textMuted} /></Pressable></View><Text variant="caption" tone="muted">Only active SportStage {config.name} profiles are shown.</Text><StageField label="Search players" value={query} onChangeText={setQuery} placeholder="Search players" placeholderTextColor={colors.textDim} style={styles.input} />{results.map((player) => <Pressable accessibilityRole="button" accessibilityLabel={`Invite ${player.displayName}`} key={player.sportProfileId} disabled={saving || members.some((member) => member.sportProfileId === player.sportProfileId && ['ACTIVE', 'INVITED'].includes(member.status))} onPress={() => void invite(player)} style={styles.row}><View style={styles.flex}><Text variant="bodyStrong">{player.displayName}</Text><Text variant="caption" tone="muted">SportStage account</Text></View><Text variant="overline" style={{ color: presentation.accent }}>INVITE</Text></Pressable>)}</ScrollView></View></View></Modal>

      <Modal accessibilityLabel="Create reusable team" visible={teamOpen} transparent animationType="fade" onRequestClose={() => setTeamOpen(false)}><View style={styles.overlay}><View style={styles.modalCard}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogContent}><View style={styles.headingRow}><Text variant="h2">Create reusable team</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.close} onPress={() => setTeamOpen(false)}><MaterialCommunityIcons name="close" size={24} color={colors.textMuted} /></Pressable></View><StageField label="Team name" value={teamName} onChangeText={setTeamName} placeholder="Team name" placeholderTextColor={colors.textDim} style={styles.input} /><StageField label="Short name (optional)" value={teamShortName} onChangeText={setTeamShortName} placeholder="Short name (optional)" placeholderTextColor={colors.textDim} style={styles.input} /><StageField label="Team colour" value={teamColor} onChangeText={setTeamColor} autoCapitalize="characters" maxLength={7} placeholder="#2563EB" placeholderTextColor={colors.textDim} style={styles.input} /><Button title="Create team" disabled={!teamName.trim()} loading={saving} onPress={() => void createTeam()} fullWidth style={{ backgroundColor: presentation.accent }} /></ScrollView></View></View></Modal>
    </StagePage>
  );
}

function initials(value: string): string { return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(''); }
function message(cause: unknown): string { return cause instanceof Error ? cause.message : 'Please try again.'; }

const styles = StyleSheet.create({
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dialogContent: { gap: 14 },
  content: { gap: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  hero: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headingRow: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  smallAction: { minHeight: 44, minWidth: 44, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: { minHeight: 66, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowActions: { flexWrap: 'wrap', maxWidth: '45%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  teamMark: { width: 8, height: 42, borderRadius: radius.pill },
  empty: { padding: spacing.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, alignItems: 'center' },
  overlay: { flex: 1, padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '82%', padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.surface, gap: spacing.md },
  input: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: 13, fontFamily: 'Inter_400Regular' },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
