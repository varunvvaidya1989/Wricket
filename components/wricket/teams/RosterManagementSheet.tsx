import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { Text } from '@/components/wricket/ui/Text';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { teamManagementApi, type RegisteredPlayerSearchResult, type TeamInvitation, type TeamRosterMember } from '@/lib/supabase/teamManagementApi';
import { rosterPermissions, rosterDescription } from '@/lib/wricket/presentation/teamManagement';
import { colors, fonts } from '@/lib/wricket/presentation/design';

export function RosterManagementSheet({ visible, teamId, teamName, accountId, ownerIds, members, onClose, onChanged }: { visible: boolean; teamId: string; teamName: string; accountId?: string; ownerIds: (string | undefined)[]; members: TeamRosterMember[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const permissions = rosterPermissions(accountId, ownerIds, members);
  const role = permissions.roleToAdd;
  const [query, setQuery] = useState(''); const [results, setResults] = useState<RegisteredPlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false); const [searchError, setSearchError] = useState<string>();
  const [email, setEmail] = useState(''); const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [inviteLink, setInviteLink] = useState<string>(); const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<string>(); const [busy, setBusy] = useState(false); const operation = useRef(false);
  const [removing, setRemoving] = useState<TeamRosterMember>();
  const [reloadInvites, setReloadInvites] = useState(0);
  useEffect(() => {
    let active = true;
    setResults([]); setSearching(false); setSearchError(undefined);
    if (!visible || !role || query.trim().length < 2) return;
    setSearching(true);
    const timer = setTimeout(() => {
      teamManagementApi.searchRegisteredPlayers(teamId, query).then(items => { if (active) setResults(items); }).catch(cause => { if (active) setSearchError(cause instanceof Error ? cause.message : 'Player search failed'); }).finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [visible, role, query, teamId]);
  useEffect(() => {
    if (!visible || !permissions.owner) return;
    let active = true;
    teamManagementApi.listInvitations(teamId).then(items => { if (active) setInvitations(items); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load invitations'); });
    return () => { active = false; };
  }, [visible, permissions.owner, teamId, reloadInvites]);
  const act = async (action: () => Promise<void>, message: string) => {
    if (operation.current || !permissions.canManage) return;
    operation.current = true; setBusy(true); setError(undefined); setReceipt(undefined);
    try { await action(); await onChanged(); setReceipt(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Roster update failed'); }
    finally { operation.current = false; setBusy(false); }
  };
  const activeInvitations = invitations.filter(invite => !invite.revokedAt && invite.useCount < invite.maxUses && Date.parse(invite.expiresAt) > Date.now());
  const close = () => { if (!operation.current) { setRemoving(undefined); onClose(); } };
  return <Modal visible={visible && permissions.canManage} transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}><View style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.heading}><View style={{ flex: 1 }}><Text variant="h2">Manage roster</Text><Text variant="caption" tone="muted">{teamName}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close roster management" disabled={busy} onPress={close} style={styles.close}><DesignIcon name="close" /></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 18, paddingBottom: 20 }}>
        {error ? <Text accessibilityRole="alert" tone="danger">{error}</Text> : null}
        {receipt ? <Text accessibilityRole="text" accessibilityLiveRegion="polite" tone="accent">{receipt}</Text> : null}
        {role ? <Card><Text variant="h3">{role === 'CAPTAIN' ? 'Assign captain' : 'Add players'}</Text><Text variant="caption" tone="muted" style={{ marginTop: 8 }}>{role === 'CAPTAIN' ? 'The captain needs a linked SportStage account.' : 'Search the registered player catalogue. Membership in another team does not exclude a player.'}</Text>
          <TextInput accessibilityLabel="Search player name" editable={!busy} value={query} onChangeText={setQuery} placeholder="Search player name" placeholderTextColor={colors.textDim} style={styles.input} />
          {searching ? <Text variant="caption" tone="muted" style={{ marginTop: 10 }}>Searching…</Text> : searchError ? <Text accessibilityRole="alert" variant="caption" tone="danger">{searchError}</Text> : query.trim().length >= 2 && !results.length ? <Text variant="caption" tone="muted" style={{ marginTop: 10 }}>No matching players. Try another name.</Text> : null}
          {results.map(player => { const needsAccount = role === 'CAPTAIN' && !player.accountId; const disabled = busy || player.currentRole === 'CAPTAIN' || (role === 'PLAYER' && Boolean(player.currentRole)) || needsAccount;
            return <Pressable key={player.playerId} accessibilityRole="button" accessibilityLabel={`Add ${player.name} as ${role.toLowerCase()}`} accessibilityState={{ disabled }} disabled={disabled} style={styles.row} onPress={() => void act(async () => { await teamManagementApi.assignRegisteredPlayer(teamId, player.playerId, role); setQuery(''); }, `${player.name} added as ${role.toLowerCase()}.`)}><View style={{ flex: 1 }}><Text variant="bodyStrong">{player.name}</Text><Text variant="caption" tone="muted">{role === 'CAPTAIN' && player.currentRole === 'PLAYER' ? 'Promote to captain' : player.currentRole ? `Already ${player.currentRole.toLowerCase()}` : needsAccount ? 'Linked account required' : `Add as ${role.toLowerCase()}`}</Text></View><DesignIcon name="plus" color={disabled ? colors.textDim : colors.accent} /></Pressable>;
          })}
        </Card> : <Text tone="muted">The captain adds players. You can manage keeper roles and remove roster members here.</Text>}
        {permissions.owner && !members.some(member => member.status === 'ACTIVE' && member.role === 'CAPTAIN') ? <Card><Text variant="h3">Invite captain</Text><Text variant="caption" tone="muted" style={{ marginTop: 8 }}>Use a one-use invitation if the captain cannot be found in search.</Text><TextInput accessibilityLabel="Captain email" editable={!busy} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Captain email (optional)" placeholderTextColor={colors.textDim} style={styles.input} />
          <Button title="Create captain invitation" loading={busy} style={{ marginTop: 12 }} onPress={() => void act(async () => { const invite = await teamManagementApi.createInvitation({ teamId, role: 'CAPTAIN', invitedEmail: email, maxUses: 1, expiresInHours: 72 }); setInviteLink(invite.link); setEmail(''); setReloadInvites(value => value + 1); }, 'Captain invitation ready to share.')} />
          {inviteLink ? <View style={{ gap: 10, marginTop: 12 }}><Text selectable variant="caption">{inviteLink}</Text><Button title="Share captain invitation" variant="secondary" disabled={busy} onPress={() => void Share.share({ title: `Captain ${teamName}`, message: `Captain invitation for ${teamName}\n${inviteLink}`, url: inviteLink }).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not share invitation'))} /></View> : null}
        </Card> : null}
        {removing ? <Card><Text variant="h3">Remove {removing.role === 'CAPTAIN' ? 'captain' : 'player'}?</Text><Text tone="muted" style={{ marginVertical: 10 }}>{removing.name} will be removed from this team only. Their player account and recorded matches are retained.</Text><Button title="Remove from team" accessibilityLabel={`Confirm remove ${removing.name}`} disabled={busy} onPress={() => { const member = removing; if (permissions.canRemove(member)) void act(async () => { await teamManagementApi.removeTeamPlayer(teamId, member.playerId); setRemoving(undefined); }, `${member.name} removed from this team.`); }} /><Button title="Cancel removal" variant="ghost" disabled={busy} onPress={() => setRemoving(undefined)} /></Card> : null}
        <View><Text variant="overline" tone="muted">ROSTER ROLES</Text>{members.filter(member => member.status === 'ACTIVE').map(member => <View key={member.playerId} style={styles.member}><View style={{ flex: 1 }}><Text variant="bodyStrong">{member.name}</Text><Text variant="caption" tone="muted">{rosterDescription(member)}</Text></View><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Pressable accessibilityRole="checkbox" accessibilityLabel={`Wicketkeeper ${member.name}`} aria-checked={Boolean(member.isKeeper)} accessibilityState={{ checked: Boolean(member.isKeeper), disabled: busy }} disabled={busy} style={[styles.keeper, member.isKeeper && styles.selected]} onPress={() => void act(() => teamManagementApi.setWicketKeeper(teamId, member.playerId, !member.isKeeper), `Wicketkeeper role ${member.isKeeper ? 'removed' : 'assigned'} for ${member.name}.`)}><Text variant="caption" tone={member.isKeeper ? 'accent' : 'muted'}>WK</Text></Pressable>{permissions.canRemove(member) ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${member.name}`} disabled={busy} style={styles.close} onPress={() => setRemoving(member)}><DesignIcon name="close" color={colors.danger} /></Pressable> : null}</View></View>)}</View>
        {permissions.owner && activeInvitations.length ? <View style={{ gap: 10 }}><Text variant="overline" tone="muted">ACTIVE CAPTAIN INVITATIONS</Text>{activeInvitations.map(invite => <Card key={invite.id}><Text variant="bodyStrong">Captain invitation</Text><Text variant="caption" tone="muted">{invite.invitedEmail ?? 'Shareable link'} · expires {new Date(invite.expiresAt).toLocaleDateString()}</Text><Button title="Revoke invitation" accessibilityLabel={`Revoke invitation ${invite.id}`} size="sm" variant="ghost" disabled={busy} onPress={() => void act(async () => { await teamManagementApi.revokeInvitation(invite.id); setInviteLink(undefined); setReloadInvites(value => value + 1); }, 'Captain invitation revoked.')} /></Card>)}</View> : null}
      </ScrollView>
    </View></KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }, sheet: { backgroundColor: colors.bg, maxHeight: '90%', padding: 18, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border }, heading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }, close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, input: { fontFamily: fonts.body, fontSize: 13, color: colors.text, backgroundColor: colors.surface, borderRadius: 11, borderWidth: 1, borderColor: colors.border, padding: 12, marginTop: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border }, member: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }, keeper: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 }, selected: { backgroundColor: colors.accentMuted, borderColor: '#547d43' } });
