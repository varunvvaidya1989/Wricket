import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { Text } from '@/components/wricket/ui/Text';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { TournamentEntryModePicker } from './TournamentEntryModePicker';
import { TournamentTeamApplicationManagement } from './TournamentTeamEntry';
import { RegistrationQuestions, RegistrationAnswerSummary, TournamentFormEditor, TournamentAllocationManagement, useRegistrationQuestions } from './TournamentParticipation';
import { tournamentParticipationApi, type PlayerAllocation } from '@/lib/supabase/tournamentParticipationApi';
import { tournamentTeamEntryApi, type TournamentRosterPlayer } from '@/lib/supabase/tournamentTeamEntryApi';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import type { PlayerRole } from '@/lib/wricket/domain/types';
import {
  PAYMENT_LABELS, PLAYING_ROLE_LABELS, tournamentRegistrationApi as api,
  type PlayerRegistration, type RegisteredTournamentPlayer, type RegistrationSettings,
} from '@/lib/supabase/tournamentRegistrationApi';

const statusLabel = { PENDING: 'Pending review', APPROVED: 'Approved', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn' };
const errorMessage = (cause: unknown) => cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Could not update registrations. Try again.';

function useRegistrationData(tournamentId: string, accountId: string | undefined, owner: boolean) {
  const [settings, setSettings] = useState<RegistrationSettings | null>(null);
  const [applications, setApplications] = useState<PlayerRegistration[]>([]);
  const [players, setPlayers] = useState<RegisteredTournamentPlayer[]>([]);
  const [teamApplicationCount, setTeamApplicationCount] = useState(0);
  const [rosterPlayers, setRosterPlayers] = useState<TournamentRosterPlayer[]>([]);
  const [allocations, setAllocations] = useState<PlayerAllocation[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string>();
  const reload = useCallback(async () => {
    const next = await api.settings(tournamentId);
    const [rows, directory, teamApplications, roster] = await Promise.all([
      accountId ? api.applications(tournamentId, owner ? undefined : accountId) : Promise.resolve([]),
      next && next.entry_mode === 'PLAYER_POOL' && (next.published_at || owner) ? api.directory(tournamentId) : Promise.resolve([]),
      owner ? tournamentTeamEntryApi.applications(tournamentId) : Promise.resolve([]),
      next && next.entry_mode === 'EXISTING_TEAMS' && (next.published_at || owner) ? tournamentTeamEntryApi.rosterPlayers(tournamentId) : Promise.resolve([]),
    ]);
    setSettings(next); setApplications(rows); setPlayers(directory); setTeamApplicationCount(teamApplications.length); setRosterPlayers(roster);
    if (next?.entry_mode === 'PLAYER_POOL') {
      const [nextAllocations, nextTeams] = await Promise.all([tournamentParticipationApi.allocations(tournamentId), tournamentParticipationApi.teams(tournamentId)]);
      setAllocations(nextAllocations); setTeams(nextTeams);
    }
  }, [accountId, owner, tournamentId]);
  useFocusEffect(useCallback(() => {
    setLoading(true);
    void reload().catch(cause => setError(errorMessage(cause))).finally(() => setLoading(false));
  }, [reload]));
  const run = async (action: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(undefined);
    try { await action(); await reload(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return { settings, applications, applicationCount: applications.length + teamApplicationCount, players, rosterPlayers, allocations, teams, loading, busy, error, run };
}

export function TournamentPlayers({ tournamentId, accountId, owner }: { tournamentId: string; accountId?: string; owner: boolean }) {
  const data = useRegistrationData(tournamentId, accountId, owner);
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<PlayerRole | 'ALL'>('ALL');
  const [role, setRole] = useState<PlayerRole>('AR');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const form = useRegistrationQuestions(tournamentId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const mine = data.applications.find(row => row.account_id === accountId);
  const mineAllocation = data.allocations.find(row => row.registration_id === mine?.id);
  const filtered = data.players.filter(player => player.display_name.toLowerCase().includes(search.trim().toLowerCase()) && (roleFilter === 'ALL' || player.playing_role === roleFilter));
  const canSubmit = data.settings?.entry_mode === 'PLAYER_POOL' && data.settings.registration_open && data.settings.published_at && !mine;
  return <View style={styles.page}>
    <View><Text variant="overline" tone="muted">PLAYER DIRECTORY</Text><Text variant="h1" style={{ marginTop: 8 }}>Meet the players.</Text><Text tone="muted" style={{ marginTop: 8 }}>{data.settings?.entry_mode === 'EXISTING_TEAMS' ? 'Players on participating team rosters appear here. Captains manage their squads.' : 'Approved registrations appear here. Team rosters are managed separately.'}</Text></View>
    {data.error ? <StateNotice error title="Registration needs attention" detail={data.error} action={{ label: 'Refresh', onPress: () => void data.run(async () => undefined) }} /> : null}
    {data.loading ? <Text tone="muted">Loading registrations…</Text> : !data.settings ? <StateNotice title="Registrations are not published" detail="The organiser will share entry details when the tournament is ready." /> : data.settings.entry_mode === 'EXISTING_TEAMS' ?
      <View style={{ gap: 18 }}><Button title="View teams & applications" variant="secondary" onPress={() => router.setParams({ tab: 'teams' })} /><RosterPlayerDirectory players={data.rosterPlayers} /></View> : <>
      <Card><Text variant="overline" tone="accent">{data.settings.registration_open ? 'REGISTRATION OPEN' : 'REGISTRATION CLOSED'}</Text>
        <Text variant="bodyStrong" style={{ marginTop: 10 }}>Player pool & auction</Text><Text variant="caption" tone="muted" style={{ marginTop: 6 }}>Register as a player. The organiser assigns teams after the auction.</Text>
        {data.settings.fee_required ? <><Text variant="bodyStrong" style={{ marginTop: 12 }}>{data.settings.fee_label}</Text><Text variant="caption" tone="muted">Payment is handled outside Wricket. The organiser updates your payment flag.</Text>{data.settings.payment_instructions ? <Text variant="caption" style={{ marginTop: 8 }}>{data.settings.payment_instructions}</Text> : null}</> : <Text variant="caption" tone="muted" style={{ marginTop: 10 }}>No registration payment required.</Text>}
        {canSubmit && !showForm ? <Button title="Request to join" onPress={() => setShowForm(true)} style={{ marginTop: 14 }} /> : null}
      </Card>
      {mine ? <Card><Text variant="overline" tone="muted">YOUR APPLICATION</Text><Text variant="h3" style={{ marginTop: 10 }}>{statusLabel[mine.status]}</Text><Text variant="caption" tone="muted" style={{ marginTop: 6 }}>Payment: {PAYMENT_LABELS[mine.payment_status]} · {PLAYING_ROLE_LABELS[mine.playing_role]}</Text>
        <RegistrationAnswerSummary questions={form.questions} answers={mine.custom_answers} />
        {mineAllocation ? <Text variant="caption" tone="accent" style={{ marginTop: 10 }}>Assigned to {data.teams.find(team => team.id === mineAllocation.team_id)?.name ?? 'a team'}. Contact the organiser before withdrawing.</Text> : (mine.status === 'PENDING' || mine.status === 'APPROVED') ? confirmWithdraw ? <View style={styles.actions}><Text variant="caption">Withdraw your tournament application?</Text><Button title="Confirm withdrawal" variant="danger" size="sm" loading={data.busy} onPress={() => void data.run(async () => { await api.withdraw(mine.id); setConfirmWithdraw(false); })} /><Button title="Keep application" variant="ghost" size="sm" disabled={data.busy} onPress={() => setConfirmWithdraw(false)} /></View> : <Button title="Withdraw application" variant="ghost" size="sm" disabled={data.busy} onPress={() => setConfirmWithdraw(true)} style={{ marginTop: 10 }} /> : null}
      </Card> : null}
      {showForm && canSubmit ? <Card style={{ gap: 14 }}><Text variant="h3">Your tournament form</Text><Text variant="caption" tone="muted">Your account name identifies you. Contact details and your note are visible only to you and the organiser.</Text>
        <Text variant="overline" tone="muted">PLAYING ROLE</Text><RolePicker value={role} onChange={setRole} disabled={data.busy} />
        <Input label="Registration contact number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={40} editable={!data.busy} placeholder="+91 98765 43210" />
        <Input label="Note for the organiser (optional)" value={note} onChangeText={setNote} maxLength={1000} multiline editable={!data.busy} placeholder="Tell the organiser about your cricket…" />
        {form.error ? <StateNotice error title="Form unavailable" detail={form.error} action={{ label: 'Reload questions', onPress: form.retry }} /> : <RegistrationQuestions questions={form.questions} answers={answers} onChange={setAnswers} disabled={data.busy} />}
        <Button title="Submit application" loading={data.busy} disabled={!form.ready} onPress={() => void data.run(async () => { await api.submit(tournamentId, role, phone, note, answers); setShowForm(false); })} />
        <Button title="Cancel application form" variant="ghost" disabled={data.busy} onPress={() => setShowForm(false)} />
      </Card> : null}
      <Text variant="overline" tone="muted">{data.players.length} REGISTERED PLAYER{data.players.length === 1 ? '' : 'S'}</Text>
      <Input label="Search registered players" value={search} onChangeText={setSearch} placeholder="Search by player name" />
      <RolePicker value={roleFilter} onChange={setRoleFilter} all />
      {!filtered.length ? <StateNotice title={data.players.length ? 'No players match' : 'The player pool is taking shape'} detail={data.players.length ? 'Try another name or playing role.' : 'Players appear after the organiser approves their application.'} /> : filtered.map(player => <Pressable key={player.registration_id} accessibilityRole="button" accessibilityLabel={`View ${player.display_name}`} onPress={() => router.push({ pathname: '/wricket/user/[id]', params: { id: player.account_id } })} style={styles.playerRow}>
        <View style={styles.avatar}><DesignIcon name="users" size={19} color={colors.accent} /></View><View style={{ flex: 1 }}><Text variant="bodyStrong">{player.display_name}</Text><Text variant="caption" tone="muted">{PLAYING_ROLE_LABELS[player.playing_role]}</Text>{data.allocations.filter(item => item.registration_id === player.registration_id).map(item => <Text key={item.registration_id} variant="caption" tone="accent">{data.teams.find(team => team.id === item.team_id)?.name}{item.captain_label ? ' · Captain' : ''}{item.icon_label ? ' · Icon' : ''}</Text>)}</View><DesignIcon name="arrow" size={17} />
      </Pressable>)}
    </>}
  </View>;
}

export function TournamentRegistrationManagement({ tournamentId, accountId, teamCount, onTeamsChanged }: { tournamentId: string; accountId: string; teamCount: number; onTeamsChanged: () => Promise<void> }) {
  const form = useRegistrationQuestions(tournamentId);
  const data = useRegistrationData(tournamentId, accountId, true);
  const [draft, setDraft] = useState<RegistrationSettings | null>(null);
  const [published, setPublished] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PENDING'>('PENDING');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(data.settings); setPublished(Boolean(data.settings?.published_at)); }, [data.settings]);
  const patch = (value: Partial<RegistrationSettings>) => { setSaved(false); setDraft(current => current ? { ...current, ...value } : null); };
  const rows = data.applications.filter(row => filter === 'ALL' || row.status === 'PENDING');
  return <View style={styles.page}>
    <View><Text variant="overline" tone="muted">REGISTRATION MANAGEMENT</Text><Text variant="h1" style={{ marginTop: 8 }}>Open the tournament.</Text><Text tone="muted" style={{ marginTop: 8 }}>Publish your tournament, review applications and track payment flags.</Text></View>
    {data.error ? <StateNotice error title="Registration needs attention" detail={data.error} action={{ label: 'Refresh', onPress: () => void data.run(async () => undefined) }} /> : null}
    {data.loading ? <Text tone="muted">Loading registration settings…</Text> : draft ? <>
      <TournamentEntryModePicker value={draft.entry_mode} onChange={entry_mode => patch({ entry_mode, registration_open: false })} disabled={data.busy || data.applicationCount > 0 || teamCount > 0} />
      <Card style={{ gap: 14 }}>
        <Toggle label="Publish tournament" detail="Make the tournament discoverable in Explore." value={published} disabled={data.busy || data.applicationCount > 0} onChange={value => { setSaved(false); setPublished(value); if (!value) patch({ registration_open: false }); }} />
        <Toggle label={draft.entry_mode === 'PLAYER_POOL' ? 'Accept player applications' : 'Accept team applications'} detail="Opening registration does not start matches." value={draft.registration_open} disabled={data.busy || !published} onChange={registration_open => patch({ registration_open })} />
        <Toggle label="Registration fee required" detail="Payment is arranged outside Wricket." value={draft.fee_required} disabled={data.busy || data.applicationCount > 0} onChange={fee_required => patch({ fee_required })} />
        {draft.fee_required ? <><Input label="Registration fee details" value={draft.fee_label} onChangeText={fee_label => patch({ fee_label })} editable={!data.busy} maxLength={120} placeholder="₹500 per player" /><Input label="External payment instructions" value={draft.payment_instructions} onChangeText={payment_instructions => patch({ payment_instructions })} editable={!data.busy} maxLength={1000} multiline placeholder="Tell applicants how to contact you about payment." /></> : null}
        <Button title="Save registration settings" loading={data.busy} onPress={() => void data.run(async () => { await api.configure(draft, published); setSaved(true); })} />
        {saved ? <Text variant="caption" tone="accent">Registration settings saved.</Text> : null}
      </Card>
      <Text variant="caption" tone="muted">Entry mode locks when applications or teams exist. Fee requirements lock after the first application.</Text>
      <TournamentFormEditor tournamentId={tournamentId} locked={data.applicationCount > 0} />
      {draft.entry_mode === 'PLAYER_POOL' ? <>
        <TournamentAllocationManagement tournamentId={tournamentId} applications={data.applications} onChanged={async () => { await onTeamsChanged(); await data.run(async () => undefined); }} />
        <View><Text variant="overline" tone="muted">APPLICATIONS · {data.applications.length}</Text><View style={styles.actions}><Button title="Pending review" variant={filter === 'PENDING' ? 'primary' : 'secondary'} size="sm" onPress={() => setFilter('PENDING')} /><Button title="All applications" variant={filter === 'ALL' ? 'primary' : 'secondary'} size="sm" onPress={() => setFilter('ALL')} /></View></View>
        {!rows.length ? <StateNotice title="No applications to review" detail="Share your published tournament so players can request to join." /> : rows.map(row => <Card key={row.id} style={{ gap: 10 }}>
          <Text variant="h3">{row.players?.display_name ?? 'Registered player'}</Text><Text variant="caption" tone="accent">{statusLabel[row.status]}</Text><Text variant="caption" tone="muted">{PLAYING_ROLE_LABELS[row.playing_role]} · {row.contact_phone}</Text>
          {row.applicant_note ? <Text variant="caption">{row.applicant_note}</Text> : null}
          <RegistrationAnswerSummary questions={form.questions} answers={row.custom_answers} />
          <Text variant="caption">Payment: {PAYMENT_LABELS[row.payment_status]}</Text>
          {row.status !== 'WITHDRAWN' ? <View style={styles.actions}>
            {row.status !== 'APPROVED' ? <Button title="Approve" accessibilityLabel={`Approve ${row.players?.display_name ?? 'player'}`} size="sm" disabled={data.busy} onPress={() => void data.run(() => api.review(row.id, 'APPROVED'))} /> : null}
            {row.status !== 'REJECTED' ? <Button title="Reject" accessibilityLabel={`Reject ${row.players?.display_name ?? 'player'}`} size="sm" variant="danger" disabled={data.busy} onPress={() => void data.run(() => api.review(row.id, 'REJECTED'))} /> : null}
          </View> : null}
          {row.payment_required ? <Button title={row.payment_status === 'DONE' ? 'Mark payment pending' : 'Mark payment done'} variant="secondary" size="sm" disabled={data.busy} onPress={() => void data.run(() => api.review(row.id, undefined, row.payment_status === 'DONE' ? 'PENDING' : 'DONE'))} /> : null}
        </Card>)}
      </> : data.settings ? <TournamentTeamApplicationManagement tournamentId={tournamentId} settings={data.settings} onChanged={async () => { await onTeamsChanged(); await data.run(async () => undefined); }} /> : null}
    </> : <StateNotice title="Registration settings unavailable" detail="Refresh the tournament and try again." />}
  </View>;
}

function Input({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={{ gap: 7 }}><Text variant="overline" tone="muted">{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.textDim} style={[styles.input, props.multiline && { minHeight: 88, textAlignVertical: 'top' }]} /></View>;
}
function RosterPlayerDirectory({ players }: { players: TournamentRosterPlayer[] }) {
  const router = useRouter(); const [search, setSearch] = useState(''); const [role, setRole] = useState<PlayerRole | 'ALL'>('ALL');
  const filtered = players.filter(player => player.display_name.toLowerCase().includes(search.trim().toLowerCase()) && (role === 'ALL' || player.playing_role === role));
  return <View style={{ gap: 18 }}><Text variant="overline" tone="muted">{players.length} ROSTER PLAYER{players.length === 1 ? '' : 'S'}</Text><Input label="Search registered players" value={search} onChangeText={setSearch} placeholder="Search by player name" /><RolePicker value={role} onChange={setRole} all />
    {!filtered.length ? <StateNotice title={players.length ? 'No players match' : 'The teams are taking shape'} detail={players.length ? 'Try another name or playing role.' : 'Players appear once tournament team rosters are added.'} /> : filtered.map(player => <Pressable key={player.player_id} accessibilityRole="button" accessibilityLabel={`View ${player.display_name}`} onPress={() => router.push(player.account_id ? { pathname: '/wricket/user/[id]', params: { id: player.account_id } } : { pathname: '/wricket/player/[id]', params: { id: player.player_id } })} style={styles.playerRow}><View style={styles.avatar}><DesignIcon name="users" size={19} color={colors.accent} /></View><View style={{ flex: 1 }}><Text variant="bodyStrong">{player.display_name}</Text><Text variant="caption" tone="muted">{PLAYING_ROLE_LABELS[player.playing_role]} · {player.team_names.join(', ')}</Text></View><DesignIcon name="arrow" size={17} /></Pressable>)}
  </View>;
}
function Toggle({ label, detail, value, disabled, onChange }: { label: string; detail: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} aria-checked={value} accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onChange(!value)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', opacity: disabled ? 0.55 : 1, minHeight: 44 }}><View style={{ flex: 1 }}><Text variant="bodyStrong">{label}</Text><Text variant="caption" tone="muted" style={{ marginTop: 4 }}>{detail}</Text></View><View style={{ width: 40, height: 23, borderRadius: 12, padding: 3, backgroundColor: value ? colors.accent : colors.borderStrong, alignItems: value ? 'flex-end' : 'flex-start' }}><View style={{ width: 17, height: 17, borderRadius: 9, backgroundColor: value ? colors.accentInk : colors.textMuted }} /></View></Pressable>;
}
function RolePicker<T extends PlayerRole | 'ALL'>({ value, onChange, all, disabled }: { value: T; onChange: (value: T) => void; all?: boolean; disabled?: boolean }) {
  const items: (PlayerRole | 'ALL')[] = [...(all ? ['ALL' as const] : []), 'BAT', 'BOWL', 'AR', 'WK'];
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel={all ? 'Filter registered players' : 'Playing role'} contentContainerStyle={{ gap: 7 }}>
    {items.map(item => <Pressable key={item} accessibilityRole="radio" accessibilityLabel={item === 'ALL' ? 'All roles' : PLAYING_ROLE_LABELS[item]} aria-checked={value === item} accessibilityState={{ checked: value === item, disabled }} disabled={disabled} onPress={() => onChange(item as T)} style={{ minHeight: 44, padding: 10, borderRadius: 9, borderWidth: 1, borderColor: value === item ? colors.accent : colors.border, backgroundColor: value === item ? colors.accentMuted : colors.surface }}><Text variant="caption" tone={value === item ? 'accent' : 'muted'}>{item === 'ALL' ? 'All roles' : PLAYING_ROLE_LABELS[item]}</Text></Pressable>)}
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { gap: 18 },
  input: { backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.body, fontSize: 12, minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 9, padding: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border },
  avatar: { width: 37, height: 37, borderRadius: 11, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
});
