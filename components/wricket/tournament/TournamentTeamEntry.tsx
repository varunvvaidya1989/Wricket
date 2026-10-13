import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { Text } from '@/components/wricket/ui/Text';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { DesignIcon, TeamCrest } from '@/components/wricket/ui/DesignIcon';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { RegistrationQuestions, RegistrationAnswerSummary, useRegistrationQuestions } from './TournamentParticipation';
import { teamManagementApi, type MyTeamSummary, type RegisteredPlayerSearchResult } from '@/lib/supabase/teamManagementApi';
import { tournamentRegistrationApi, PAYMENT_LABELS, type RegistrationSettings } from '@/lib/supabase/tournamentRegistrationApi';
import { tournamentTeamEntryApi as api, type TournamentEntryInvitation, type TournamentTeamApplication } from '@/lib/supabase/tournamentTeamEntryApi';

const errorMessage = (cause: unknown) => cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Could not update team entry. Try again.';
const applicationStatus = { PENDING: 'Pending review', APPROVED: 'Approved', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn' };

function useEntryOperation(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState<string>();
  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(undefined);
    try { await action(); await reload(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { lock.current = false; setBusy(false); }
  }, [reload]);
  return { busy, error, run, clearError: () => setError(undefined) };
}

export function TournamentTeamEntryPanel({ tournamentId, accountId }: { tournamentId: string; accountId: string }) {
  const [settings, setSettings] = useState<RegistrationSettings | null>();
  const reload = useCallback(async () => setSettings(await tournamentRegistrationApi.settings(tournamentId)), [tournamentId]);
  const operation = useEntryOperation(reload);
  const initialLoad = operation.run;
  useFocusEffect(useCallback(() => { void initialLoad(async () => undefined); }, [initialLoad]));
  if (operation.error) return <StateNotice error title="Team entry unavailable" detail={operation.error} action={{ label: 'Refresh team entry', onPress: () => void operation.run(async () => undefined) }} />;
  if (!settings || settings.entry_mode !== 'EXISTING_TEAMS') return null;
  return <TournamentTeamApplicationForm tournamentId={tournamentId} accountId={accountId} settings={settings} />;
}

export function TournamentTeamApplicationForm({ tournamentId, accountId, settings, token }: { tournamentId: string; accountId: string; settings: Pick<RegistrationSettings, 'registration_open' | 'fee_required' | 'fee_label' | 'payment_instructions'>; token?: string }) {
  const form = useRegistrationQuestions(tournamentId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const router = useRouter();
  const [applications, setApplications] = useState<TournamentTeamApplication[]>([]);
  const [teams, setTeams] = useState<MyTeamSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [availablePlaces, setAvailablePlaces] = useState<number>();
  const [showForm, setShowForm] = useState(Boolean(token));
  const [selected, setSelected] = useState<string>();
  const [phone, setPhone] = useState(''); const [note, setNote] = useState('');
  const [withdrawing, setWithdrawing] = useState<string>();
  const reload = useCallback(async () => {
    const [rows, eligible, places] = await Promise.all([api.applications(tournamentId, accountId), api.eligibleTeams(accountId, tournamentId), api.availablePlaces(tournamentId)]);
    setApplications(rows); setTeams(eligible); setAvailablePlaces(places); setReady(true);
  }, [accountId, tournamentId]);
  const operation = useEntryOperation(reload);
  const initialLoad = operation.run;
  useFocusEffect(useCallback(() => { void initialLoad(async () => undefined); }, [initialLoad]));
  return <View style={styles.stack}>
    <Card style={styles.stack}><Text variant="overline" tone="accent">{!settings.registration_open ? 'TEAM APPLICATIONS CLOSED' : availablePlaces === 0 ? 'TEAM PLACES FILLED' : 'TEAM APPLICATIONS OPEN'}</Text><Text variant="h3">Bring your team.</Text><Text variant="caption" tone="muted">Captains and club owners can request a place. The organiser reviews your team before entry.</Text>
      {settings.fee_required ? <><Text variant="bodyStrong">{settings.fee_label}</Text><Text variant="caption" tone="muted">Payment is handled outside Wricket. The organiser updates the payment flag.</Text>{settings.payment_instructions ? <Text variant="caption">{settings.payment_instructions}</Text> : null}</> : null}
      {settings.registration_open && !showForm && availablePlaces !== 0 ? <Button title="Request team entry" disabled={!ready} onPress={() => setShowForm(true)} /> : null}
      {settings.registration_open && availablePlaces === 0 ? <Text variant="caption" tone="muted">All tournament team places are filled.</Text> : null}
    </Card>
    {operation.error ? <StateNotice error title="Team application needs attention" detail={operation.error} action={{ label: 'Refresh applications', onPress: () => void operation.run(async () => undefined) }} /> : null}
    {showForm && settings.registration_open && availablePlaces !== 0 ? <Card style={styles.stack}>
      <Text variant="h3">Your team application</Text><Text variant="caption" tone="muted">Choose a reusable club you own or captain. Its current roster will be copied when the organiser approves it.</Text>
      {!ready ? <Text tone="muted">Loading your clubs…</Text> : teams.length ? teams.map(team => <Pressable key={team.id} accessibilityRole="radio" accessibilityLabel={`Apply with ${team.name}`} aria-checked={selected === team.id} accessibilityState={{ checked: selected === team.id, disabled: operation.busy }} disabled={operation.busy} onPress={() => { operation.clearError(); setSelected(team.id); }} style={[styles.teamChoice, selected === team.id && { borderColor: colors.accent }]}><TeamCrest name={team.name} /><View style={{ flex: 1 }}><Text variant="bodyStrong">{team.name}</Text><Text variant="caption" tone="muted">{team.role === 'CAPTAIN' ? 'Captain' : 'Club owner'}</Text></View>{selected === team.id ? <DesignIcon name="check" color={colors.accent} size={16} /> : null}</Pressable>) : <StateNotice title="No eligible clubs" detail="Create a reusable team in My teams, then return here. Teams with an existing application or entry are excluded." action={{ label: 'Open My teams', onPress: () => router.push({ pathname: '/wricket/my-wricket', params: { section: 'teams' } }) }} />}
      <EntryInput label="Team registration contact number" value={phone} onChangeText={value => { operation.clearError(); setPhone(value); }} editable={!operation.busy} keyboardType="phone-pad" maxLength={40} placeholder="+91 98765 43210" />
      <EntryInput label="Team application note (optional)" value={note} onChangeText={value => { operation.clearError(); setNote(value); }} editable={!operation.busy} multiline maxLength={1000} placeholder="Tell the organiser about your squad…" />
      <Text variant="caption" tone="muted">Contact details and this note are visible only to you and the organiser.</Text>
      {form.error ? <StateNotice error title="Form unavailable" detail={form.error} action={{ label: 'Reload questions', onPress: form.retry }} /> : <RegistrationQuestions questions={form.questions} answers={answers} onChange={value => { operation.clearError(); setAnswers(value); }} disabled={operation.busy} />}
      <Button title="Submit team application" loading={operation.busy} disabled={!form.ready || !selected || !teams.some(team => team.id === selected)} onPress={() => void operation.run(async () => { if (!selected) return; await api.submit(tournamentId, selected, phone, note, token, answers); setShowForm(false); setSelected(undefined); })} />
      <Button title="Cancel team application" variant="ghost" disabled={operation.busy} onPress={() => setShowForm(false)} />
    </Card> : null}
    {applications.map(application => <Card key={application.id} style={styles.stack}>
      <Text variant="overline" tone="muted">YOUR TEAM APPLICATION</Text><Text variant="h3">{application.team_name_snapshot}</Text><Text variant="bodyStrong" tone="accent">{applicationStatus[application.status]}</Text><Text variant="caption" tone="muted">Payment: {PAYMENT_LABELS[application.payment_status]}</Text>
      <RegistrationAnswerSummary questions={form.questions} answers={application.custom_answers} />
      {application.entry_team_id ? <Button title="Open tournament team" variant="secondary" size="sm" onPress={() => router.push({ pathname: '/wricket/team/[id]', params: { id: application.entry_team_id! } })} /> : application.status === 'APPROVED' ? <Text variant="caption" tone="muted">This tournament entry was removed by the organiser.</Text> : null}
      {application.status === 'PENDING' ? withdrawing === application.id ? <><Text variant="caption">Withdraw this team application?</Text><View style={styles.actions}><Button title="Confirm team withdrawal" variant="danger" size="sm" loading={operation.busy} onPress={() => void operation.run(async () => { await api.withdraw(application.id); setWithdrawing(undefined); })} /><Button title="Keep team application" variant="ghost" size="sm" disabled={operation.busy} onPress={() => setWithdrawing(undefined)} /></View></> : <Button title="Withdraw team application" variant="ghost" size="sm" disabled={operation.busy} onPress={() => setWithdrawing(application.id)} /> : null}
    </Card>)}
  </View>;
}

export function TournamentTeamApplicationManagement({ tournamentId, settings, onChanged }: { tournamentId: string; settings: RegistrationSettings; onChanged: () => Promise<void> }) {
  const form = useRegistrationQuestions(tournamentId);
  const [applications, setApplications] = useState<TournamentTeamApplication[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDING'>('PENDING');
  const [invitations, setInvitations] = useState<TournamentEntryInvitation[]>([]);
  const [link, setLink] = useState<string>();
  const reload = useCallback(async () => {
    const [rows, invites] = await Promise.all([api.applications(tournamentId), api.invitations(tournamentId)]);
    setApplications(rows); setInvitations(invites);
  }, [tournamentId]);
  const operation = useEntryOperation(reload);
  const initialLoad = operation.run;
  useFocusEffect(useCallback(() => { void initialLoad(async () => undefined); }, [initialLoad]));
  const rows = applications.filter(row => filter === 'ALL' || row.status === 'PENDING');
  return <View style={styles.stack}>
    <Card style={styles.stack}><Text variant="overline" tone="muted">TEAM ENTRY LINKS</Text><Text variant="h3">Invite captains to apply.</Text><Text variant="caption" tone="muted">Share an entry link with clubs. Each application needs your approval and an available team place.</Text>
      <Button title="Create team entry link" variant="secondary" disabled={!settings.registration_open || operation.busy} onPress={() => void operation.run(async () => setLink((await api.createInvitation(tournamentId)).link))} />
      {!settings.registration_open ? <Text variant="caption" tone="muted">Save open team applications above to create an entry link.</Text> : null}
      {link ? <InvitationLink link={link} title="Share team entry link" /> : null}
      <InvitationList invitations={invitations} busy={operation.busy} onRevoke={id => void operation.run(async () => { await api.revoke(id); setLink(undefined); })} />
    </Card>
    {operation.error ? <StateNotice error title="Team entry needs attention" detail={operation.error} /> : null}
    <Text variant="overline" tone="muted">TEAM APPLICATIONS · {applications.length}</Text>
    <View style={styles.actions}><Button title="Pending teams" variant={filter === 'PENDING' ? 'primary' : 'secondary'} size="sm" onPress={() => setFilter('PENDING')} /><Button title="All team applications" variant={filter === 'ALL' ? 'primary' : 'secondary'} size="sm" onPress={() => setFilter('ALL')} /><Button title="Refresh team applications" variant="ghost" size="sm" disabled={operation.busy} onPress={() => void operation.run(async () => undefined)} /></View>
    {!rows.length ? <StateNotice title="No team applications to review" detail="Publish and open team applications, then invite captains or share your tournament." /> : rows.map(row => <Card key={row.id} style={styles.stack}>
      <Text variant="h3">{row.team_name_snapshot}</Text><Text variant="caption" tone="accent">{applicationStatus[row.status]}</Text><Text variant="caption" tone="muted">{row.contact_phone}</Text>{row.applicant_note ? <Text variant="caption">{row.applicant_note}</Text> : null}<RegistrationAnswerSummary questions={form.questions} answers={row.custom_answers} /><Text variant="caption">Payment: {PAYMENT_LABELS[row.payment_status]}</Text>
      {(row.status === 'PENDING' || row.status === 'REJECTED') ? <View style={styles.actions}><Button title="Approve team" accessibilityLabel={`Approve team ${row.team_name_snapshot}`} size="sm" disabled={operation.busy} onPress={() => void operation.run(async () => { await api.review(row.id, 'APPROVED'); await onChanged(); })} />{row.status === 'PENDING' ? <Button title="Reject team" accessibilityLabel={`Reject team ${row.team_name_snapshot}`} size="sm" variant="danger" disabled={operation.busy} onPress={() => void operation.run(async () => { await api.review(row.id, 'REJECTED'); await onChanged(); })} /> : null}</View> : null}
      {row.payment_required ? <Button title={row.payment_status === 'DONE' ? 'Mark team payment pending' : 'Mark team payment done'} variant="secondary" size="sm" disabled={operation.busy} onPress={() => void operation.run(async () => { await api.review(row.id, undefined, row.payment_status === 'DONE' ? 'PENDING' : 'DONE'); await onChanged(); })} /> : null}
    </Card>)}
  </View>;
}

export function TournamentCaptainInviteSheet({ tournamentId, teamId, teamName, onClose }: { tournamentId: string; teamId: string; teamName: string; onClose: () => void }) {
  const [invitations, setInvitations] = useState<TournamentEntryInvitation[]>([]);
  const [link, setLink] = useState<string>(); const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegisteredPlayerSearchResult[]>([]);
  const [target, setTarget] = useState<RegisteredPlayerSearchResult>();
  const [searchError, setSearchError] = useState<string>();
  const reload = useCallback(async () => setInvitations(await api.invitations(tournamentId, teamId)), [teamId, tournamentId]);
  const operation = useEntryOperation(reload);
  const initialLoad = operation.run;
  useEffect(() => { void initialLoad(async () => undefined); }, [initialLoad]);
  useEffect(() => {
    let active = true; setResults([]); setSearchError(undefined);
    if (query.trim().length < 2 || target) return;
    const timer = setTimeout(() => { void teamManagementApi.searchRegisteredPlayers(teamId, query).then(rows => { if (active) setResults(rows.filter(row => row.accountId)); }).catch(cause => { if (active) setSearchError(errorMessage(cause)); }); }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query, target, teamId]);
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!operation.busy) onClose(); }}><View style={styles.overlay}><View accessibilityViewIsModal style={styles.sheet}>
    <View style={styles.heading}><Text variant="h2" style={{ flex: 1 }}>Invite a captain</Text><Pressable accessibilityRole="button" accessibilityLabel="Close captain invitation" disabled={operation.busy} onPress={onClose} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><DesignIcon name="close" /></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.stack}>
      <Text variant="h3">{teamName}</Text><Text variant="caption" tone="muted">The captain claims this existing team place and manages its roster. Tournament ownership stays with the organiser.</Text>
      <EntryInput label="Reserve for a captain (optional)" value={target?.name ?? query} onChangeText={value => { setQuery(value); setTarget(undefined); }} editable={!operation.busy} placeholder="Search registered accounts" />
      {searchError ? <Text tone="danger" variant="caption">{searchError}</Text> : null}
      {results.map(player => <Button key={player.playerId} title={`Reserve for ${player.name}`} variant="secondary" size="sm" disabled={operation.busy} onPress={() => { setTarget(player); setResults([]); }} />)}
      {target ? <Text variant="caption" tone="accent">Only {target.name} can accept this invitation.</Text> : <Text variant="caption" tone="muted">Anyone signed in with this link can claim the role. Share it only with your chosen captain, or select an account above.</Text>}
      <Button title="Create captain claim link" loading={operation.busy} onPress={() => void operation.run(async () => setLink((await api.createInvitation(tournamentId, teamId, target?.accountId)).link))} />
      <Text variant="caption" tone="muted">Links expire in 7 days. Creating a new link revokes the previous unclaimed link.</Text>
      {link ? <InvitationLink link={link} title="Share captain claim link" /> : null}
      {operation.error ? <StateNotice error title="Captain invitation needs attention" detail={operation.error} /> : null}
      <InvitationList invitations={invitations} busy={operation.busy} onRevoke={id => void operation.run(async () => { await api.revoke(id); setLink(undefined); })} />
    </ScrollView>
  </View></View></Modal>;
}

export function EntryInput({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={{ gap: 7 }}><Text variant="overline" tone="muted">{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.textDim} style={[styles.input, props.multiline && { minHeight: 88, textAlignVertical: 'top' }]} /></View>;
}
function InvitationLink({ link, title }: { link: string; title: string }) {
  const [error, setError] = useState<string>();
  return <View style={styles.stack}><Text selectable testID="tournament-entry-invitation-link" variant="caption" style={{ flexShrink: 1 }}>{link}</Text><Button title={title} variant="secondary" size="sm" onPress={() => void Share.share({ title, message: link, url: link }).catch(cause => setError(errorMessage(cause)))} />{error ? <Text variant="caption" tone="danger">{error}</Text> : null}</View>;
}
function InvitationList({ invitations, busy, onRevoke }: { invitations: TournamentEntryInvitation[]; busy: boolean; onRevoke: (id: string) => void }) {
  return <View style={styles.stack}>{invitations.map(invite => {
    const usable = !invite.revoked_at && invite.use_count < invite.max_uses && new Date(invite.expires_at).getTime() > Date.now();
    const label = invite.revoked_at ? 'Revoked' : invite.use_count >= invite.max_uses ? 'Used' : !usable ? 'Expired' : 'Active';
    return <View key={invite.id} style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 8 }}><Text variant="caption" tone="muted">{label} · expires {new Date(invite.expires_at).toLocaleDateString()} · {invite.use_count} used</Text>{usable ? <Button title="Revoke entry invitation" accessibilityLabel={`Revoke entry invitation ${invite.id}`} variant="ghost" size="sm" disabled={busy} onPress={() => onRevoke(invite.id)} /> : null}</View>;
  })}</View>;
}
const styles = StyleSheet.create({
  stack: { gap: 14 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: { backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.body, fontSize: 12, minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 9, padding: 11 },
  teamChoice: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderWidth: 1, borderRadius: 10, borderColor: colors.border },
  overlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'center', alignItems: 'center', padding: 18 },
  sheet: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 18, maxWidth: 420, width: '100%', maxHeight: '90%' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
});
