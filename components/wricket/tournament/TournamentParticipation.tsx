import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { Text } from '@/components/wricket/ui/Text';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { tournamentParticipationApi as api, type RegistrationQuestion, type PlayerAllocation } from '@/lib/supabase/tournamentParticipationApi';
import type { PlayerRegistration } from '@/lib/supabase/tournamentRegistrationApi';

const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Could not update participation. Try again.';
export function useRegistrationQuestions(tournamentId: string) {
  const [questions, setQuestions] = useState<RegistrationQuestion[]>([]);
  const [error, setError] = useState<string>(); const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    void attempt; // Restart the request when the user retries.
    let active = true; setReady(false); setError(undefined);
    void api.questions(tournamentId).then(rows => { if (active) { setQuestions(rows); setReady(true); } }).catch(cause => { if (active) setError(message(cause)); });
    return () => { active = false; };
  }, [tournamentId, attempt]));
  return { questions, error, ready, retry: () => setAttempt(value => value + 1) };
}

export function RegistrationQuestions({ questions, answers, onChange, disabled }: { questions: RegistrationQuestion[]; answers: Record<string, string>; onChange: (answers: Record<string, string>) => void; disabled?: boolean }) {
  return <View style={styles.stack}>{questions.map(q => <View key={q.id} style={{ gap: 7 }}>
    <Text variant="overline" tone="muted">{q.label}{q.required ? ' *' : ' (optional)'}</Text>
    {q.type === 'TEXT' ? <TextInput accessibilityLabel={q.label} value={answers[q.id] ?? ''} onChangeText={value => onChange({ ...answers, [q.id]: value })} maxLength={500} editable={!disabled} placeholderTextColor={colors.textDim} style={styles.input} /> :
      <View accessibilityRole="radiogroup" accessibilityLabel={q.label} style={styles.actions}>{q.options?.map(option => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={`${q.label}: ${option}`} aria-checked={answers[q.id] === option} accessibilityState={{ checked: answers[q.id] === option, disabled }} disabled={disabled} onPress={() => onChange({ ...answers, [q.id]: option })} style={[styles.option, answers[q.id] === option && styles.selected]}><Text variant="caption" tone={answers[q.id] === option ? 'accent' : 'muted'}>{option}</Text></Pressable>)}</View>}
  </View>)}</View>;
}

export function RegistrationAnswerSummary({ questions, answers }: { questions: RegistrationQuestion[]; answers: Record<string, string> }) {
  return <View style={{ gap: 5 }}>{questions.filter(q => answers[q.id]).map(q => <Text key={q.id} variant="caption">{q.label}: {answers[q.id]}</Text>)}</View>;
}

export function TournamentFormEditor({ tournamentId, locked }: { tournamentId: string; locked: boolean }) {
  const loaded = useRegistrationQuestions(tournamentId);
  const [draft, setDraft] = useState<RegistrationQuestion[]>();
  const [busy, setBusy] = useState(false); const gate = useRef(false); const [error, setError] = useState<string>(); const [saved, setSaved] = useState(false);
  const questions = draft ?? loaded.questions;
  const update = (id: string, patch: Partial<RegistrationQuestion>) => { setSaved(false); setDraft(questions.map(q => q.id === id ? { ...q, ...patch } : q)); };
  return <Card style={styles.stack}><Text variant="h3">Tournament form questions</Text><Text variant="caption" tone="muted">Add up to eight text or choice questions. Answers stay private. The form locks after the first application.</Text>
    {loaded.error || error ? <StateNotice error title="Form needs attention" detail={error ?? loaded.error!} action={{ label: 'Reload form', onPress: loaded.retry }} /> : null}
    {!loaded.ready ? <Text tone="muted">Loading form…</Text> : <>
      {questions.map((q, index) => <View key={q.id} style={styles.stack}><Text variant="overline" tone="muted">QUESTION {index + 1}</Text>
        {locked ? <><Text variant="bodyStrong">{q.label}</Text><Text variant="caption" tone="muted">{q.required ? 'Required' : 'Optional'} · {q.type === 'TEXT' ? 'Text answer' : q.options?.join(' / ')}</Text></> : <>
        <TextInput accessibilityLabel={`Question ${index + 1} label`} value={q.label} editable={!locked && !busy} onChangeText={label => update(q.id, { label })} maxLength={120} style={styles.input} placeholder="Question label" placeholderTextColor={colors.textDim} />
        <View style={styles.actions}>{(['TEXT', 'CHOICE'] as const).map(type => <Button key={type} title={type === 'TEXT' ? 'Text answer' : 'Choice answer'} size="sm" variant={q.type === type ? 'primary' : 'secondary'} disabled={locked || busy} onPress={() => update(q.id, { type, options: type === 'CHOICE' ? q.options ?? ['Option 1', 'Option 2'] : undefined })} />)}</View>
        {q.type === 'CHOICE' ? <TextInput accessibilityLabel={`Question ${index + 1} options, one per line`} value={q.options?.join('\n') ?? ''} onChangeText={value => update(q.id, { options: value.split('\n') })} editable={!locked && !busy} multiline style={[styles.input, { minHeight: 80 }]} /> : null}
        <View style={styles.actions}><Button title={q.required ? 'Required question' : 'Optional question'} variant="secondary" size="sm" disabled={locked || busy} onPress={() => update(q.id, { required: !q.required })} /><Button title={`Remove question ${index + 1}`} variant="ghost" size="sm" disabled={locked || busy} onPress={() => setDraft(questions.filter(item => item.id !== q.id))} /></View>
        </>}
      </View>)}
      {!locked ? <><Button title="Add form question" variant="secondary" disabled={busy || questions.length >= 8} onPress={() => { setSaved(false); setDraft([...questions, { id: `q_${Date.now().toString(36)}_${questions.length}`, label: '', type: 'TEXT', required: false }]); }} />
        <Button title="Save form questions" loading={busy} onPress={() => { if (gate.current) return; gate.current = true; setBusy(true); setError(undefined); void api.configureQuestions(tournamentId, questions.map(q => ({ ...q, label: q.label.trim(), options: q.options?.map(value => value.trim()).filter(Boolean) }))).then(() => { setSaved(true); loaded.retry(); }).catch(cause => setError(message(cause))).finally(() => { gate.current = false; setBusy(false); }); }} /></> : <Text variant="caption" tone="muted">Form questions are locked.</Text>}
      {saved ? <Text tone="accent" variant="caption">Form questions saved.</Text> : null}
    </>}
  </Card>;
}

export function TournamentAllocationManagement({ tournamentId, applications, onChanged }: { tournamentId: string; applications: PlayerRegistration[]; onChanged: () => Promise<void> }) {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]); const [allocations, setAllocations] = useState<PlayerAllocation[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const gate = useRef(false); const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>(); const [teamId, setTeamId] = useState<string>(); const [captain, setCaptain] = useState(false); const [icon, setIcon] = useState(false);
  const reload = useCallback(async () => { const [nextTeams, nextAllocations] = await Promise.all([api.teams(tournamentId), api.allocations(tournamentId)]); setTeams(nextTeams); setAllocations(nextAllocations); }, [tournamentId]);
  useFocusEffect(useCallback(() => { if (!applications.length) setSelectedId(undefined); setLoading(true); void reload().catch(cause => setError(message(cause))).finally(() => setLoading(false)); }, [reload, applications]));
  const run = async (action: () => Promise<void>) => { if (gate.current) return; gate.current = true; setBusy(true); setError(undefined); try { await action(); await onChanged(); await reload(); setSelectedId(undefined); } catch (cause) { setError(message(cause)); } finally { gate.current = false; setBusy(false); } };
  const approved = applications.filter(row => row.status === 'APPROVED');
  return <Card style={styles.stack}><Text variant="overline" tone="muted">POST-AUCTION ALLOCATION</Text><Text variant="h2">Build the teams.</Text><Text variant="caption" tone="muted">Assign approved pool players manually. Captain and Icon are informational labels and grant no management access.</Text>
    {error ? <StateNotice error title="Allocation needs attention" detail={error} action={{ label: 'Refresh allocations', onPress: () => void run(async () => undefined) }} /> : null}
    {loading ? <Text tone="muted">Loading allocations…</Text> : !approved.length ? <Text tone="muted">Approve player applications before allocating.</Text> : approved.map(row => {
      const allocation = allocations.find(item => item.registration_id === row.id); const name = row.players?.display_name ?? 'Player';
      return <View key={row.id} style={styles.stack}><Text variant="h3">{name}</Text><Text variant="caption" tone="muted">{teams.find(team => team.id === allocation?.team_id)?.name ?? 'Unassigned'}{allocation?.captain_label ? ' · Captain' : ''}{allocation?.icon_label ? ' · Icon' : ''}</Text>
        {selectedId === row.id ? <><Text variant="overline" tone="muted">CHOOSE TEAM</Text><ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{teams.map(team => <Button key={team.id} title={team.name} accessibilityLabel={`Allocate to ${team.name}`} size="sm" disabled={busy} variant={teamId === team.id ? 'primary' : 'secondary'} onPress={() => setTeamId(team.id)} />)}</ScrollView>
          {!teams.length ? <Text variant="caption" tone="muted">Create placeholder teams in Teams & rosters first.</Text> : null}
          <View style={styles.actions}><Button title={captain ? 'Captain label on' : 'Captain label off'} size="sm" variant={captain ? 'primary' : 'secondary'} disabled={busy} onPress={() => setCaptain(!captain)} /><Button title={icon ? 'Icon label on' : 'Icon label off'} size="sm" variant={icon ? 'primary' : 'secondary'} disabled={busy} onPress={() => setIcon(!icon)} /></View>
          <Button title={`Save allocation for ${name}`} disabled={!teamId} loading={busy} onPress={() => void run(() => api.allocate(row.id, teamId!, captain, icon))} /><Button title="Cancel allocation" variant="ghost" disabled={busy} onPress={() => setSelectedId(undefined)} /></> : <View style={styles.actions}><Button title={`Allocate ${name}`} variant="secondary" size="sm" disabled={busy} onPress={() => { setSelectedId(row.id); setTeamId(allocation?.team_id); setCaptain(allocation?.captain_label ?? false); setIcon(allocation?.icon_label ?? false); }} />{allocation ? <Button title={`Unassign ${name}`} variant="ghost" size="sm" disabled={busy} onPress={() => void run(() => api.allocate(row.id, null))} /> : null}</View>}
      </View>;
    })}
  </Card>;
}
const styles = StyleSheet.create({ stack: { gap: 14 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.body, fontSize: 12, minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 9, padding: 11 },
  option: { minHeight: 44, padding: 11, borderRadius: 9, borderWidth: 1, borderColor: colors.border }, selected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
});
