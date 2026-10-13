import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/wricket/ui/Button';
import { Text } from '@/components/wricket/ui/Text';
import { DesignIcon, TeamCrest } from '@/components/wricket/ui/DesignIcon';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { colors, fonts, palette } from '@/lib/wricket/presentation/design';
import { createOnlineTeam } from '@/lib/wricket/data/cloudFirst';
import { teamManagementApi, type MyTeamSummary } from '@/lib/supabase/teamManagementApi';
import { tournamentRegistrationApi, type TournamentEntryMode } from '@/lib/supabase/tournamentRegistrationApi';
import type { Tournament } from '@/lib/wricket/domain/types';

export function AddTournamentTeamSheet({ visible, tournament, onClose, onSaved }: {
  visible: boolean;
  tournament: Tournament;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'CREATE' | 'REUSE'>('CREATE');
  const [entryMode, setEntryMode] = useState<TournamentEntryMode>();
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [color, setColor] = useState<string>(palette.team[0]);
  const [available, setAvailable] = useState<MyTeamSummary[]>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string>();
  const [settingsError, setSettingsError] = useState<string>();
  const [teamsError, setTeamsError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setEntryMode(undefined);
    setAvailable(undefined);
    setSettingsError(undefined);
    setTeamsError(undefined);
    if (!auth.session || !tournament.cloudId) {
      setSettingsError('Sign in and reconnect to load tournament team options.');
      return;
    }
    const accountId = auth.session.user.id;
    const tournamentId = tournament.cloudId;
    void (async () => {
      // Legacy tournaments without registration settings accept existing teams.
      const settings = await tournamentRegistrationApi.settings(tournamentId);
      if (!active) return;
      const nextEntryMode = settings?.entry_mode ?? 'EXISTING_TEAMS';
      setEntryMode(nextEntryMode);
      if (nextEntryMode === 'PLAYER_POOL') {
        setMode('CREATE');
        setAvailable([]);
        return;
      }
      try {
        const teams = await teamManagementApi.listReusableForTournament(accountId, tournamentId);
        if (active) setAvailable(teams);
      } catch (cause) {
        if (active) setTeamsError(cause instanceof Error ? cause.message : 'Could not load your teams');
      }
    })().catch(cause => {
      if (active) setSettingsError(cause instanceof Error ? cause.message : 'Could not load tournament team options');
    });
    return () => { active = false; };
  }, [visible, auth.session, tournament.cloudId, reload]);

  const close = () => {
    if (!busy.current) {
      setError(undefined);
      onClose();
    }
  };
  const save = async () => {
    if (busy.current || !entryMode || !auth.session || !tournament.cloudId || tournament.organizerProfileId !== auth.session.user.id) return;
    if (mode === 'CREATE' && (!name.trim() || !shortName.trim())) return;
    if (mode === 'REUSE' && (entryMode !== 'EXISTING_TEAMS' || !available?.some(team => team.id === selected))) return;
    busy.current = true;
    setSaving(true);
    setError(undefined);
    try {
      if (mode === 'CREATE') {
        await createOnlineTeam({ tournament, name: name.trim(), shortName: shortName.trim().toUpperCase(), colorHex: color, userId: auth.session.user.id });
      } else {
        await teamManagementApi.enterTournament(selected!, tournament.cloudId);
      }
      // The write succeeded. Close before cache refresh so retry cannot insert another team.
      setName('');
      setShortName('');
      setSelected(undefined);
      onClose();
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add team');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const pool = entryMode === 'PLAYER_POOL';
  const canSave = Boolean(entryMode) && (mode === 'CREATE'
    ? Boolean(name.trim() && shortName.trim())
    : Boolean(selected && available?.some(team => team.id === selected)));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text variant="h2" style={styles.heading}>Add a tournament team</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close team entry" disabled={saving} onPress={close} style={styles.close}>
              <DesignIcon name="close" />
            </Pressable>
          </View>
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {settingsError ? (
              <StateNotice error title="Team options unavailable" detail={settingsError} action={{ label: 'Retry team options', onPress: () => setReload(value => value + 1) }} />
            ) : !entryMode ? (
              <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text tone="muted">Loading team options...</Text></View>
            ) : (
              <>
                {!pool ? (
                  <View style={styles.modes}>
                    {(['CREATE', 'REUSE'] as const).map(value => (
                      <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === 'CREATE' ? 'Create new team' : 'Use existing team'} aria-checked={mode === value} accessibilityState={{ checked: mode === value, disabled: saving }} disabled={saving} onPress={() => { setMode(value); setError(undefined); }} style={[styles.mode, mode === value && styles.selected]}>
                        <Text variant="bodyStrong" tone={mode === value ? 'accent' : 'muted'}>{value === 'CREATE' ? 'Create placeholder' : 'Use existing team'}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {mode === 'CREATE' ? (
                  <>
                    <Text tone="muted">{pool
                      ? 'Create an empty team for your player pool. Add approved players from Manage \u2192 Registrations after creating it.'
                      : 'Create an empty tournament team. Invite a captain from the Teams tab to claim it and manage the roster.'}</Text>
                    <View style={styles.field}>
                      <Text variant="caption" tone="muted">TEAM NAME</Text>
                      <TextInput accessibilityLabel="Team name" editable={!saving} value={name} onChangeText={setName} placeholder="e.g. Northstar Cricket Club" placeholderTextColor={colors.textDim} style={styles.input} />
                    </View>
                    <View style={styles.field}>
                      <Text variant="caption" tone="muted">SHORT NAME</Text>
                      <TextInput accessibilityLabel="Team short name" editable={!saving} maxLength={4} autoCapitalize="characters" value={shortName} onChangeText={value => setShortName(value.toUpperCase())} placeholder="e.g. NSCC" placeholderTextColor={colors.textDim} style={styles.input} />
                      <Text variant="caption" tone="muted">Up to 4 characters, shown on scorecards.</Text>
                    </View>
                    <View style={styles.field}>
                      <Text variant="caption" tone="muted">TEAM COLOUR</Text>
                      <View style={styles.colours}>
                        {palette.team.map(value => (
                          <View key={value} style={styles.colourCell}>
                            <Pressable accessibilityRole="radio" accessibilityLabel={`Team colour ${value}`} aria-checked={color === value} accessibilityState={{ checked: color === value, disabled: saving }} disabled={saving} onPress={() => setColor(value)} style={[styles.swatch, { backgroundColor: value }]}>
                              {color === value ? <DesignIcon name="check" color={colors.bg} size={22} /> : null}
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    </View>
                    {pool ? <Text variant="caption" tone="muted">Captain and Icon labels can be added when assigning players. These labels are informational.</Text> : null}
                  </>
                ) : (
                  <>
                    <Text tone="muted">Enter one of your teams with its current captain and roster. Changes here apply to this tournament entry.</Text>
                    {teamsError ? (
                      <StateNotice error title="Teams unavailable" detail={teamsError} action={{ label: 'Retry teams', onPress: () => setReload(value => value + 1) }} />
                    ) : available ? available.length ? available.map(team => (
                      <Pressable key={team.id} accessibilityRole="radio" accessibilityLabel={`Enter ${team.name}`} aria-checked={selected === team.id} accessibilityState={{ checked: selected === team.id, disabled: saving }} disabled={saving} onPress={() => setSelected(team.id)} style={[styles.existing, selected === team.id && styles.selected]}>
                        <TeamCrest name={team.name} />
                        <View style={styles.heading}><Text variant="bodyStrong">{team.name}</Text><Text variant="caption" tone="muted">{team.tournamentName ?? 'Reusable team'}</Text></View>
                        {selected === team.id ? <DesignIcon name="check" color={colors.accent} /> : null}
                      </Pressable>
                    )) : <Text tone="muted">No eligible teams available. Already entered teams are excluded. Create a placeholder instead.</Text> : (
                      <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text tone="muted">Loading your teams...</Text></View>
                    )}
                  </>
                )}
              </>
            )}
            {error ? <Text accessibilityRole="alert" tone="danger">{error}</Text> : null}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
            <Button title={mode === 'CREATE' ? 'Create placeholder team' : 'Enter selected team'} accessibilityLabel={mode === 'CREATE' ? 'Create team' : 'Enter selected team'} loading={saving} disabled={!canSave} onPress={() => void save()} fullWidth />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', backgroundColor: colors.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 },
  heading: { flex: 1 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 },
  content: { gap: 18, paddingHorizontal: 18, paddingBottom: 18 },
  modes: { flexDirection: 'row', gap: 10 },
  mode: { flex: 1, minHeight: 48, padding: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: '#547d43', backgroundColor: '#18271c' },
  field: { gap: 8 },
  input: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, minHeight: 48, color: colors.text, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 13 },
  colours: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  colourCell: { width: '25%', alignItems: 'center' },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  existing: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, padding: 14, borderRadius: 13, backgroundColor: colors.surface },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, padding: 18 },
});
