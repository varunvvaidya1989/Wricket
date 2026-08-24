import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import {
  sportRosterApi,
  type SportClubMembership,
  type SportFormatEligibility,
  type SportTeamMembership,
  type SportTeamSummary,
} from '@/lib/supabase/sportRosterApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function SportTeamDetailScreen({ sportId }: { sportId: ScoringSportId }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [team, setTeam] = useState<SportTeamSummary>();
  const [members, setMembers] = useState<SportTeamMembership[]>([]);
  const [clubMembers, setClubMembers] = useState<SportClubMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedClubMembershipId, setSelectedClubMembershipId] = useState<string>();
  const [eligibility, setEligibility] = useState<SportFormatEligibility[]>(['SINGLES', 'DOUBLES']);
  const [editingMember, setEditingMember] = useState<SportTeamMembership>();

  const reload = useCallback(() => {
    if (!id) return;
    setLoading(true);
    void sportRosterApi.getTeam(id).then(async (nextTeam) => {
      const [nextMembers, nextClubMembers, nextCanManage] = await Promise.all([
        sportRosterApi.listTeamMemberships(id),
        sportRosterApi.listClubMemberships(nextTeam.clubId),
        sportRosterApi.canManageTeam(id),
      ]);
      setTeam(nextTeam);
      setMembers(nextMembers);
      setClubMembers(nextClubMembers.filter((member) => member.status === 'ACTIVE'));
      setCanManage(nextCanManage);
    }).catch((cause) => Alert.alert('Could not load team', message(cause)))
      .finally(() => setLoading(false));
  }, [id]);
  useFocusEffect(reload);

  const invite = async () => {
    if (!team || !selectedClubMembershipId || !eligibility.length || saving) return;
    setSaving(true);
    try {
      await sportRosterApi.inviteTeamMember({
        teamId: team.id,
        clubMembershipId: selectedClubMembershipId,
        eligibility,
      });
      setInviteOpen(false);
      setSelectedClubMembershipId(undefined);
      reload();
    } catch (cause) {
      Alert.alert('Could not invite team member', message(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggleEligibility = (format: SportFormatEligibility) => {
    setEligibility((current) => current.includes(format)
      ? current.length === 1 ? current : current.filter((item) => item !== format)
      : [...current, format]);
  };

  const toggleCaptain = async (member: SportTeamMembership) => {
    if (!team || !member.accountId || saving) return;
    setSaving(true);
    try {
      if (member.isCaptain) {
        await sportRosterApi.revokeAccess({ accessType: 'TEAM', resourceId: team.id, accountId: member.accountId, role: 'CAPTAIN' });
      } else {
        await sportRosterApi.inviteAccess({ accessType: 'TEAM', resourceId: team.id, accountId: member.accountId, role: 'CAPTAIN' });
      }
      if (!member.isCaptain) Alert.alert('Captain invited', `${member.displayName} can accept the captain role from Clubs & teams.`);
      reload();
    } catch (cause) {
      Alert.alert('Could not invite captain', message(cause));
    } finally {
      setSaving(false);
    }
  };

  const openEligibility = (member: SportTeamMembership) => {
    setEligibility([...member.eligibility]);
    setEditingMember(member);
  };

  const saveEligibility = async () => {
    if (!editingMember || !eligibility.length || saving) return;
    setSaving(true);
    try {
      await sportRosterApi.updateEligibility(editingMember.id, eligibility);
      setEditingMember(undefined);
      reload();
    } catch (cause) {
      Alert.alert('Could not update eligibility', message(cause));
    } finally {
      setSaving(false);
    }
  };

  const endMembership = (member: SportTeamMembership) => {
    const remove = member.accountId !== auth.session?.user.id;
    Alert.alert(remove ? 'Remove team member?' : 'Leave team?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: remove ? 'Remove' : 'Leave', style: 'destructive', onPress: () => {
        setSaving(true);
        void sportRosterApi.endTeamMembership(member.id, remove).then(reload)
          .catch((cause) => Alert.alert('Could not end membership', message(cause)))
          .finally(() => setSaving(false));
      } },
    ]);
  };

  if (loading) return <Screen padded={false}><SportStageLoader message={`Opening ${config.name} team`} detail="Loading roster, roles, and eligibility" accent={presentation.accent} /></Screen>;
  if (!team) return <Screen padded={false}><AppHeader title="Team" back /><View style={styles.center}><Text variant="h3">Team unavailable</Text></View></Screen>;

  const eligibleClubMembers = clubMembers.filter((clubMember) => !members.some((member) => (
    member.sportProfileId === clubMember.sportProfileId && ['ACTIVE', 'INVITED'].includes(member.status)
  )));

  return (
    <Screen scroll padded={false}>
      <AppHeader title={team.name} eyebrow={`${config.name.toUpperCase()} TEAM`} back />
      <View style={styles.content}>
        <View style={[styles.hero, { borderColor: team.colorHex ?? presentation.accent }]}><View style={[styles.heroIcon, { backgroundColor: `${team.colorHex ?? presentation.accent}22` }]}><MaterialCommunityIcons name="account-multiple-outline" size={30} color={team.colorHex ?? presentation.accent} /></View><View style={styles.flex}><Text variant="h1">{team.name}</Text><Text variant="caption" tone="muted">{team.shortName || 'REUSABLE CLUB TEAM'} · {canManage ? 'OWNED BY YOU' : 'MEMBER'}</Text></View></View>

        <View style={styles.rules}><MaterialCommunityIcons name="account-check-outline" size={21} color={presentation.accent} /><View style={styles.flex}><Text variant="bodyStrong">Verified roster</Text><Text variant="caption" tone="muted">Players must first accept membership in this club. Eligibility is recorded for singles, doubles, or both.</Text></View></View>

        <View style={styles.headingRow}><Text variant="overline" tone="dim">ROSTER · {members.filter((item) => item.status === 'ACTIVE').length}</Text>{canManage ? <Pressable disabled={!eligibleClubMembers.length} onPress={() => setInviteOpen(true)} style={[styles.smallAction, { borderColor: presentation.accent }, !eligibleClubMembers.length && styles.disabled]}><MaterialCommunityIcons name="account-plus-outline" size={17} color={presentation.accent} /><Text variant="caption" style={{ color: presentation.accent }}>INVITE</Text></Pressable> : null}</View>
        {members.map((member) => <View key={member.id} style={styles.member}><View style={[styles.avatar, { backgroundColor: `${presentation.accent}16` }]}><Text variant="bodyStrong" style={{ color: presentation.accent }}>{initials(member.displayName)}</Text></View><View style={styles.flex}><Text variant="bodyStrong">{member.displayName}</Text><Text variant="caption" tone="muted">{member.status} · {member.eligibility.join(' + ')}{member.isCaptain ? ' · CAPTAIN' : ''}</Text></View>{member.status === 'ACTIVE' && member.accountId ? <View style={styles.rowActions}>{canManage || member.accountId === auth.session?.user.id ? <Pressable disabled={saving} onPress={() => openEligibility(member)}><MaterialCommunityIcons name="tune-variant" size={19} color={presentation.accent} /></Pressable> : null}{canManage && member.accountId !== team.ownerAccountId ? <Pressable disabled={saving} onPress={() => void toggleCaptain(member)}><Text variant="overline" style={{ color: member.isCaptain ? colors.danger : presentation.accent }}>{member.isCaptain ? 'REVOKE ROLE' : 'CAPTAIN'}</Text></Pressable> : null}{member.accountId !== team.ownerAccountId && (canManage || member.accountId === auth.session?.user.id) ? <Pressable disabled={saving} onPress={() => endMembership(member)}><MaterialCommunityIcons name={member.accountId === auth.session?.user.id ? 'exit-to-app' : 'account-remove-outline'} size={19} color={colors.danger} /></Pressable> : null}</View> : member.status === 'ACTIVE' ? <MaterialCommunityIcons name="check-decagram" size={19} color={presentation.accent} /> : <Text variant="overline" tone="dim">PENDING</Text>}</View>)}
      </View>

      <Modal visible={inviteOpen} transparent animationType="fade" onRequestClose={() => setInviteOpen(false)}><View style={styles.overlay}><View style={styles.modalCard}><View style={styles.headingRow}><Text variant="h2">Invite club member</Text><Pressable onPress={() => setInviteOpen(false)}><MaterialCommunityIcons name="close" size={24} color={colors.textMuted} /></Pressable></View><Text variant="caption" tone="muted">Only accepted members of this club can join the reusable team.</Text><View style={styles.choiceRow}>{(['SINGLES', 'DOUBLES'] as const).map((format) => <Pressable key={format} onPress={() => toggleEligibility(format)} style={[styles.choice, eligibility.includes(format) && { borderColor: presentation.accent, backgroundColor: `${presentation.accent}14` }]}><MaterialCommunityIcons name={format === 'SINGLES' ? 'account-outline' : 'account-multiple-outline'} size={20} color={eligibility.includes(format) ? presentation.accent : colors.textMuted} /><Text variant="caption" style={eligibility.includes(format) ? { color: presentation.accent } : undefined}>{format}</Text></Pressable>)}</View><View style={styles.memberList}>{eligibleClubMembers.map((member) => <Pressable key={member.id} onPress={() => setSelectedClubMembershipId(member.id)} style={[styles.member, selectedClubMembershipId === member.id && { borderColor: presentation.accent, backgroundColor: `${presentation.accent}10` }]}><View style={styles.flex}><Text variant="bodyStrong">{member.displayName}</Text><Text variant="caption" tone="muted">Accepted club member</Text></View>{selectedClubMembershipId === member.id ? <MaterialCommunityIcons name="check-circle" size={20} color={presentation.accent} /> : null}</Pressable>)}</View><Button title="Send team invitation" disabled={!selectedClubMembershipId || !eligibility.length} loading={saving} onPress={() => void invite()} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>

      <Modal visible={Boolean(editingMember)} transparent animationType="fade" onRequestClose={() => setEditingMember(undefined)}><View style={styles.overlay}><View style={styles.modalCard}><View style={styles.headingRow}><Text variant="h2">Format eligibility</Text><Pressable onPress={() => setEditingMember(undefined)}><MaterialCommunityIcons name="close" size={24} color={colors.textMuted} /></Pressable></View><Text variant="caption" tone="muted">Choose where {editingMember?.displayName ?? 'this player'} can be selected.</Text><View style={styles.choiceRow}>{(['SINGLES', 'DOUBLES'] as const).map((format) => <Pressable key={format} onPress={() => toggleEligibility(format)} style={[styles.choice, eligibility.includes(format) && { borderColor: presentation.accent, backgroundColor: `${presentation.accent}14` }]}><MaterialCommunityIcons name={format === 'SINGLES' ? 'account-outline' : 'account-multiple-outline'} size={20} color={eligibility.includes(format) ? presentation.accent : colors.textMuted} /><Text variant="caption" style={eligibility.includes(format) ? { color: presentation.accent } : undefined}>{format}</Text></Pressable>)}</View><Button title="Save eligibility" disabled={!eligibility.length} loading={saving} onPress={() => void saveEligibility()} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>
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
  rules: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.sm },
  headingRow: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  smallAction: { minHeight: 36, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 },
  member: { minHeight: 66, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '82%', padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.surface, gap: spacing.md },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: { flex: 1, minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 4 },
  memberList: { gap: spacing.sm },
  disabled: { opacity: 0.45 },
  flex: { flex: 1, minWidth: 0 },
});
