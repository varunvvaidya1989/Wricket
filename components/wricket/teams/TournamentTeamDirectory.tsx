import React, { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { Text } from '@/components/wricket/ui/Text';
import { DesignIcon, TeamCrest } from '@/components/wricket/ui/DesignIcon';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { teamManagementApi, type TeamRosterSummary } from '@/lib/supabase/teamManagementApi';
import { teamDirectorySections } from '@/lib/wricket/presentation/teamManagement';
import { colors } from '@/lib/wricket/presentation/design';
import type { Team } from '@/lib/wricket/domain/types';
import type { GeneratedFixtureSetup } from '@/lib/supabase/fixturesApi';
import { TournamentCaptainInviteSheet, TournamentTeamEntryPanel } from '@/components/wricket/tournament/TournamentTeamEntry';
import { tournamentTeamEntryApi } from '@/lib/supabase/tournamentTeamEntryApi';

export function TournamentTeamDirectory({ teams, setup, plannedCount, canManage, onAdd, onRemove, tournamentId, accountId }: { teams: Team[]; setup: GeneratedFixtureSetup; plannedCount: number; canManage: boolean; onAdd: () => void; onRemove: (team: Team) => Promise<void>; tournamentId?: string; accountId?: string }) {
  const router = useRouter();
  const [rosters, setRosters] = useState<Map<string, TeamRosterSummary>>();
  const [placeholders, setPlaceholders] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState<Team>();
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);
  const [removing, setRemoving] = useState<Team>();
  const [removeError, setRemoveError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<string>();
  const busyRef = useRef(false);
  const confirmRemoval = async () => {
    if (!removing || !canManage || busyRef.current) return;
    busyRef.current = true; setBusy(true); setRemoveError(undefined);
    try { await onRemove(removing); setReceipt(removing.name + ' removed from this tournament.'); setRemoving(undefined); }
    catch (cause) { setRemoveError(cause instanceof Error ? cause.message : 'Could not remove this team. Try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const teamIds = teams.flatMap(team => team.cloudId ? [team.cloudId] : []).join(',');
  useEffect(() => {
    let active = true; setRosters(undefined); setError(undefined);
    Promise.all([teamManagementApi.listRosterSummaries(teamIds ? teamIds.split(',') : []), canManage && tournamentId ? tournamentTeamEntryApi.placeholderIds(tournamentId) : Promise.resolve(new Set<string>())]).then(([summaries, entries]) => { if (active) { setRosters(summaries); setPlaceholders(entries); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load rosters'); });
    return () => { active = false; };
  }, [teamIds, teams, reload, canManage, tournamentId]);
  const sections = teamDirectorySections(teams, setup.groups);
  return <View style={styles.content}>
    <View><Text variant="h1">{teams.length ? `${teams.length} ${teams.length === 1 ? 'team' : 'teams'}.` : 'Your tournament starts here.'}</Text><Text variant="h1">One competition.</Text><Text tone="muted" style={{ marginTop: 9 }}>{teams.length ? 'Meet the clubs taking the field.' : 'Add your tournament teams and build their rosters.'}</Text></View>
    {!canManage && tournamentId && accountId ? <TournamentTeamEntryPanel tournamentId={tournamentId} accountId={accountId} /> : null}
    {canManage ? <View style={{ gap: 10 }}>{teams.length < plannedCount ? <><Text variant="caption" tone="muted">{plannedCount - teams.length} {plannedCount - teams.length === 1 ? 'place' : 'places'} available</Text><Button title="Add tournament team" variant="secondary" onPress={onAdd} /></> : <Text variant="caption" tone="muted">All planned team places are filled.</Text>}</View> : null}
    {error ? <StateNotice error title="Roster counts unavailable" detail={error} action={{ label: 'Retry roster counts', onPress: () => setReload(value => value + 1) }} /> : null}
    {receipt ? <Text accessibilityLiveRegion="polite" variant="caption" tone="accent">{receipt}</Text> : null}
    {sections.map(section => <View key={section.id} style={{ gap: 13 }}><Text variant="overline" tone="muted">{section.title}</Text><Card style={{ paddingVertical: 0, paddingHorizontal: 15 }}>
      {section.teams.map((team, index) => {
        const summary = team.cloudId ? rosters?.get(team.cloudId) : undefined;
        return <View key={team.id} style={index > 0 ? styles.divider : undefined}><Pressable accessibilityRole="button" accessibilityLabel={`Open team ${team.name}`} disabled={!team.cloudId} onPress={() => router.push({ pathname: '/wricket/team/[id]', params: { id: team.cloudId! } })} style={styles.row}>
          {team.logoUrl ? <Image source={{ uri: team.logoUrl }} style={styles.logo} /> : <TeamCrest name={team.name} blue={index % 2 === 1} />}
          <View style={{ flex: 1, minWidth: 0 }}><Text variant="bodyStrong">{team.name}</Text><Text variant="caption" tone="muted" style={{ marginTop: 4 }}>{summary ? `${summary.playerCount} ${summary.playerCount === 1 ? 'player' : 'players'}${summary.hasCaptain || !placeholders.has(team.cloudId ?? '') ? '' : ' · Captain needed'}` : error ? 'Roster unavailable' : 'Loading roster…'}</Text></View><DesignIcon name="arrow" size={17} />
        </Pressable>{canManage ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingBottom: 8 }}>{team.cloudId && placeholders.has(team.cloudId) && summary && !summary.hasCaptain ? <Button title="Invite captain" accessibilityLabel={`Invite captain for ${team.name}`} variant="secondary" size="sm" onPress={() => setInviting(team)} /> : null}<Button title="Remove team" accessibilityLabel={`Remove ${team.name} from tournament`} variant="ghost" size="sm" onPress={() => { setRemoving(team); setRemoveError(undefined); setReceipt(undefined); }} /></View> : null}</View>;
      })}
    </Card></View>)}
    {inviting?.cloudId && tournamentId ? <TournamentCaptainInviteSheet tournamentId={tournamentId} teamId={inviting.cloudId} teamName={inviting.name} onClose={() => { setInviting(undefined); setReload(value => value + 1); }} /> : null}
    <Modal visible={Boolean(removing)} transparent animationType="fade" onRequestClose={() => { if (!busyRef.current) setRemoving(undefined); }}>
      <View style={styles.overlay}><View accessibilityViewIsModal style={styles.dialog}><ScrollView contentContainerStyle={{ gap: 16 }}>
        <Text variant="overline" tone="muted">TOURNAMENT TEAM</Text><Text variant="h2">Remove this team?</Text>
        <Text variant="h3">{removing?.name}</Text><Text tone="muted">This removes its tournament entry, roster assignments and invitations, and frees a team place. The reusable club, player accounts and other tournament entries are retained.</Text>
        <Text variant="caption" tone="muted">Teams used by fixtures, brackets or match history cannot be removed. Remove unplayed fixtures or reset the unstarted plan first.</Text>
        {removeError ? <StateNotice error title="Team could not be removed" detail={removeError} /> : null}
        <Button title="Confirm remove team" variant="secondary" loading={busy} onPress={() => void confirmRemoval()} />
        <Button title="Keep team" variant="ghost" disabled={busy} onPress={() => setRemoving(undefined)} />
      </ScrollView></View></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({ content: { gap: 25, paddingBottom: 30 }, row: { minHeight: 70, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, divider: { borderTopWidth: 1, borderColor: colors.border }, logo: { width: 33, height: 36, borderRadius: 5 }, overlay: { flex: 1, backgroundColor: '#000000aa', padding: 18, alignItems: 'center', justifyContent: 'center' }, dialog: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 20, maxWidth: 420, maxHeight: '85%', width: '100%' } });
