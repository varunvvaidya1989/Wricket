import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ManualScheduleBuilder } from '@/components/wricket/fixtures/ManualScheduleBuilder';
import { useAuth } from '@/components/providers/AuthProvider';
import { getTournament, listTeams } from '@/lib/wricket/db/repo';
import type { Team, Tournament } from '@/lib/wricket/domain/types';
import {
  nextPowerOfTwo,
  roundsFor,
} from '@/lib/wricket/fixtures/recommender';
import type {
  FormatRecommendation,
  PairingAlgorithm,
  TournamentFormatType,
} from '@/lib/wricket/fixtures';
import {
  fixturesApi,
  GeneratedFixtureSetup,
  KnockoutPreset,
  ManualFixtureInput,
} from '@/lib/supabase/fixturesApi';
import { syncTournamentData } from '@/lib/wricket/sync/tournamentSync';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const ALGORITHMS: PairingAlgorithm[] = [
  'ROUND_ROBIN',
  'DOUBLE_ROUND_ROBIN',
  'WEIGHTED_ROUND_ROBIN',
  'SWISS',
  'RANDOM_PAIRS',
];

export default function TournamentFixturesSetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const auth = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<FormatRecommendation>();
  const [formatChoices, setFormatChoices] = useState<Omit<FormatRecommendation, 'alternatives'>[]>([]);
  const [algorithm, setAlgorithm] = useState<PairingAlgorithm>('ROUND_ROBIN');
  const [groupCount, setGroupCount] = useState('1');
  const [advance, setAdvance] = useState('0');
  const [setup, setSetup] = useState<GeneratedFixtureSetup>();
  const [saving, setSaving] = useState(false);
  const [generationError, setGenerationError] = useState<string>();
  const [teamGroups, setTeamGroups] = useState<Record<string, number>>({});
  const [builderMode, setBuilderMode] = useState<'AUTOMATIC' | 'MANUAL'>('AUTOMATIC');

  const load = useCallback(async () => {
    if (!id) return;
    const [nextTournament, nextTeams] = await Promise.all([getTournament(id), listTeams(id)]);
    setTournament(nextTournament);
    setTeams(nextTeams);
    if (nextTournament?.cloudId) setSetup(await fixturesApi.getFixtureSetup(nextTournament.cloudId));
    if (!selected) {
      const recommendation = fixturesApi.getFormatRecommendation(Math.max(2, nextTeams.length || nextTournament?.plannedTeamCount || 2));
      const guidedChoices = guidedFormatChoices(recommendation, Math.max(2, nextTeams.length || nextTournament?.plannedTeamCount || 2));
      const initial = guidedChoices.find(choice => choice.formatType === recommendation.formatType) ?? guidedChoices[0];
      setSelected({ ...initial, alternatives: guidedChoices });
      setFormatChoices(guidedChoices);
      setAlgorithm(initial.pairingAlgorithm);
      setGroupCount(String(initial.numberOfGroups || 1));
      setAdvance(String(initial.advancePerGroup));
    }
  }, [id, selected]);

  useEffect(() => { load().catch(showError); }, [load]);
  useEffect(() => {
    const count = Math.max(1, Number(groupCount) || 1);
    setTeamGroups(current => Object.fromEntries(Object.entries(current).filter(([, group]) => group < count)));
  }, [groupCount]);
  useEffect(() => {
    if (!tournament?.cloudId) return;
    return fixturesApi.subscribeToTournament(tournament.cloudId, () => {
      fixturesApi.getFixtureSetup(tournament.cloudId!).then(setSetup).catch(showError);
    });
  }, [tournament?.cloudId]);

  const generated = Boolean(setup?.stages.length);
  const manualSchedule = Boolean(setup?.stages.some(stage => stage.config?.manual));

  const ensureManualCloudData = async () => {
    if (!tournament || !auth.session) throw new Error('Sign in before building a tournament schedule');
    if (tournament.cloudId && teams.length >= 2 && teams.every(team => team.cloudId)) {
      return { tournament, teams };
    }
    await syncTournamentData(auth.session.user.id, { forceRetry: true });
    const [freshTournament, freshTeams] = await Promise.all([
      getTournament(tournament.id),
      listTeams(tournament.id),
    ]);
    if (!freshTournament?.cloudId) throw new Error('Tournament cloud sync did not complete');
    if (freshTeams.length < 2 || freshTeams.some(team => !team.cloudId)) {
      throw new Error('Every team must finish cloud sync before building the schedule');
    }
    setTournament(freshTournament);
    setTeams(freshTeams);
    return { tournament: freshTournament, teams: freshTeams };
  };

  const addManualStage = async (type: 'GROUP' | 'KNOCKOUT') => {
    setSaving(true);
    setGenerationError(undefined);
    try {
      const ready = await ensureManualCloudData();
      await fixturesApi.addManualStage(ready.tournament.cloudId!, type);
      setSetup(await fixturesApi.getFixtureSetup(ready.tournament.cloudId!));
    } catch (cause) {
      setGenerationError(cause instanceof Error ? cause.message : 'Please try again.');
      showError(cause);
    } finally {
      setSaving(false);
    }
  };

  const addManualGroup = async (input: { stageId: string; name: string; teamIds: string[] }) => {
    setSaving(true);
    setGenerationError(undefined);
    try {
      await fixturesApi.addManualGroup(input);
      if (tournament?.cloudId) setSetup(await fixturesApi.getFixtureSetup(tournament.cloudId));
      return true;
    } catch (cause) {
      setGenerationError(cause instanceof Error ? cause.message : 'Please try again.');
      showError(cause);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addManualFixture = async (input: ManualFixtureInput) => {
    setSaving(true);
    setGenerationError(undefined);
    try {
      await fixturesApi.addManualFixture(input);
      if (tournament?.cloudId) setSetup(await fixturesApi.getFixtureSetup(tournament.cloudId));
      return true;
    } catch (cause) {
      setGenerationError(cause instanceof Error ? cause.message : 'Please try again.');
      showError(cause);
      return false;
    } finally {
      setSaving(false);
    }
  };

  function applyRecommendation(recommendation: Omit<FormatRecommendation, 'alternatives'>) {
    setSelected({ ...recommendation, alternatives: formatChoices });
    setAlgorithm(recommendation.pairingAlgorithm);
    setGroupCount(String(recommendation.numberOfGroups || 1));
    setAdvance(String(recommendation.advancePerGroup));
  }

  const generate = async () => {
    if (!tournament || !selected || !auth.session) {
      Alert.alert('Sign in required', 'Sign in before generating tournament fixtures.');
      return;
    }
    const groups = Math.max(1, Number(groupCount));
    if (!Number.isInteger(groups) || groups > Math.floor(teams.length / 2)) {
      Alert.alert('Invalid group count', `Choose between 1 and ${Math.max(1, Math.floor(teams.length / 2))} groups so every group has at least two teams.`);
      return;
    }
    const advancePerGroup = Math.max(0, Number(advance));
    const qualifiers = groups * advancePerGroup;
    const recommendation: FormatRecommendation = selected.formatType === 'GROUPS_THEN_KNOCKOUT'
      ? {
        ...selected,
        numberOfGroups: groups,
        advancePerGroup,
        knockoutRounds: roundsFor(nextPowerOfTwo(Math.max(2, qualifiers))),
      }
      : { ...selected, numberOfGroups: groups, advancePerGroup };
    if (
      selected.formatType !== 'KNOCKOUT_ONLY' &&
      teams.some(team => teamGroups[team.id] === undefined)
    ) {
      Alert.alert('Assign every team', 'Choose a group for each team before generating fixtures.');
      return;
    }
    setSaving(true);
    setGenerationError(undefined);
    try {
      await syncTournamentData(auth.session.user.id, { forceRetry: true });
      const [freshTournament, freshTeams] = await Promise.all([
        getTournament(tournament.id),
        listTeams(tournament.id),
      ]);
      const freshSyncedTeams = freshTeams.filter(team => team.cloudId);
      if (!freshTournament?.cloudId) throw new Error('Tournament cloud sync did not complete');
      if (freshSyncedTeams.length !== freshTeams.length || freshSyncedTeams.length < 2) {
        throw new Error('Team cloud sync did not complete. Open Profile → Cloud sync and retry.');
      }
      await fixturesApi.generatePreset({
        tournamentId: freshTournament.cloudId,
        teamIds: freshSyncedTeams.map(team => team.cloudId!),
        recommendation,
        pairingAlgorithm: algorithm,
        numberOfGroups: groups,
        advancePerGroup,
        groupTeamIds: selected.formatType === 'KNOCKOUT_ONLY'
          ? undefined
          : Array.from({ length: groups }, (_, groupIndex) =>
              freshSyncedTeams
                .filter(team => teamGroups[team.id] === groupIndex)
                .map(team => team.cloudId!),
            ),
      });
      setTournament(freshTournament);
      setTeams(freshTeams);
      setSetup(await fixturesApi.getFixtureSetup(freshTournament.cloudId));
      Alert.alert('Fixtures generated', 'Stages and opening fixtures are ready.');
    } catch (cause) {
      setGenerationError(cause instanceof Error ? cause.message : 'Please try again.');
      showError(cause);
    } finally {
      setSaving(false);
    }
  };

  const undoGeneration = () => {
    const cloudTournamentId = tournament?.cloudId;
    if (!cloudTournamentId || saving) return;
    confirmFixtureAction(
      manualSchedule ? 'Reset manual schedule?' : 'Undo generated fixtures?',
      manualSchedule
        ? 'This removes every manual stage, group, and fixture. It is allowed only before any match starts.'
        : 'This removes the generated schedule and returns to format selection. It is allowed only before any match starts.',
      manualSchedule ? 'Reset schedule' : 'Undo fixtures',
      () => {
        setSaving(true);
        void fixturesApi.resetFixtures(cloudTournamentId).then(async () => {
          setSetup(await fixturesApi.getFixtureSetup(cloudTournamentId));
          setGenerationError(undefined);
        }).catch(showError).finally(() => setSaving(false));
      },
    );
  };

  const generateKnockout = async (preset: KnockoutPreset, qualifierTeamIds?: string[]) => {
    const cloudTournamentId = tournament?.cloudId;
    if (!cloudTournamentId) return;
    setSaving(true);
    try {
      await fixturesApi.generateKnockout({ tournamentId: cloudTournamentId, preset, qualifierTeamIds });
      setSetup(await fixturesApi.getFixtureSetup(cloudTournamentId));
      Alert.alert('Knockout fixtures ready', 'Review the knockout fixtures before scheduling matches.');
    } catch (cause) {
      showError(cause);
    } finally {
      setSaving(false);
    }
  };

  const resetKnockout = () => {
    const cloudTournamentId = tournament?.cloudId;
    if (!cloudTournamentId || saving) return;
    confirmFixtureAction(
      'Reset knockout fixtures?',
      'This removes only the unstarted knockout bracket. Completed group matches and standings remain unchanged.',
      'Reset knockout',
      () => {
        setSaving(true);
        void fixturesApi.resetKnockout(cloudTournamentId).then(async () => {
          setSetup(await fixturesApi.getFixtureSetup(cloudTournamentId));
        }).catch(showError).finally(() => setSaving(false));
      },
    );
  };

  if (!tournament || !selected) return <Screen><Text tone="muted">Loading…</Text></Screen>;

  const choices = formatChoices.length ? formatChoices : [selected];
  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'Tournament fixtures' }} />
      <View style={styles.content}>
        <View>
          <Text variant="overline" tone="muted">FIXTURE BUILDER</Text>
          <Text variant="h1" style={{ marginTop: spacing.xs }}>{tournament.name}</Text>
          <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
            Generate a recommended schedule or add every group, knockout stage, and fixture yourself.
          </Text>
        </View>

        {generated ? (
          <>
            {manualSchedule && (
              <ManualScheduleBuilder
                setup={setup!}
                teams={teams}
                saving={saving}
                onAddStage={addManualStage}
                onAddGroup={addManualGroup}
                onAddFixture={addManualFixture}
              />
            )}
            <GeneratedSummary
              setup={setup!}
              teams={teams}
              manual={manualSchedule}
              onUndo={undoGeneration}
              onResetKnockout={resetKnockout}
              undoing={saving}
              onGenerateKnockout={generateKnockout}
            />
            {generationError && (
              <Text variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>
                {generationError}
              </Text>
            )}
          </>
        ) : (
          <>
            <Card>
              <Text variant="h3">How do you want to schedule?</Text>
              <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs, marginBottom: spacing.md }}>
                Automatic uses SportStage recommendations. Manual leaves every stage and pairing to the owner.
              </Text>
              <View style={styles.choiceGrid}>
                <Pressable
                  onPress={() => setBuilderMode('AUTOMATIC')}
                  style={[styles.choice, builderMode === 'AUTOMATIC' && styles.choiceActive]}
                >
                  <MaterialCommunityIcons
                    name="auto-fix"
                    size={22}
                    color={builderMode === 'AUTOMATIC' ? colors.accentInk : colors.text}
                  />
                  <Text variant="bodyStrong" style={builderMode === 'AUTOMATIC' ? styles.activeText : undefined}>
                    Automatic
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setBuilderMode('MANUAL')}
                  style={[styles.choice, builderMode === 'MANUAL' && styles.choiceActive]}
                >
                  <MaterialCommunityIcons
                    name="pencil-ruler"
                    size={22}
                    color={builderMode === 'MANUAL' ? colors.accentInk : colors.text}
                  />
                  <Text variant="bodyStrong" style={builderMode === 'MANUAL' ? styles.activeText : undefined}>
                    Manual
                  </Text>
                </Pressable>
              </View>
            </Card>

            {builderMode === 'AUTOMATIC' ? (
              <>
            <View>
              <Label>FORMAT</Label>
              <View style={styles.choiceGrid}>
                {choices.map(choice => (
                  <Pressable
                    key={choice.formatType}
                    onPress={() => applyRecommendation(choice as FormatRecommendation)}
                    style={[styles.choice, selected.formatType === choice.formatType && styles.choiceActive]}
                  >
                    <MaterialCommunityIcons
                      name={choice.formatType === 'KNOCKOUT_ONLY' ? 'sitemap-outline' : 'view-grid-outline'}
                      size={22}
                      color={selected.formatType === choice.formatType ? colors.accentInk : colors.text}
                    />
                    <Text variant="bodyStrong" style={selected.formatType === choice.formatType ? styles.activeText : undefined}>
                      {formatLabel(choice.formatType)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>{selected.rationale}</Text>
            </View>

            {selected.formatType !== 'KNOCKOUT_ONLY' && (
              <>
                <View style={styles.row}>
                  <NumberField label="GROUPS" value={groupCount} onChange={setGroupCount} />
                  {selected.formatType === 'GROUPS_THEN_KNOCKOUT'
                    ? <NumberField label="ADVANCE / GROUP" value={advance} onChange={setAdvance} />
                    : null}
                </View>
                <View>
                  <Label>PAIRING ALGORITHM</Label>
                  <View style={styles.chips}>
                    {ALGORITHMS.map(item => (
                      <Pressable
                        key={item}
                        onPress={() => setAlgorithm(item)}
                        style={[styles.chip, algorithm === item && styles.chipActive]}
                      >
                        <Text variant="caption" style={algorithm === item ? styles.activeText : undefined}>
                          {algorithmLabel(item)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View>
                  <Label>ASSIGN TEAMS TO GROUPS</Label>
                  <Text variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
                    Select one group for every team. Fixtures use these assignments exactly.
                  </Text>
                  <View style={{ gap: spacing.sm }}>
                    {teams.map(team => (
                      <Card key={team.id}>
                        <Text variant="bodyStrong">{team.name}</Text>
                        <View style={[styles.chips, { marginTop: spacing.sm }]}>
                          {Array.from({ length: Math.max(1, Number(groupCount) || 1) }, (_, index) => (
                            (() => {
                            const totalGroups = Math.max(1, Number(groupCount) || 1);
                            const capacity = Math.floor(teams.length / totalGroups) + (index < teams.length % totalGroups ? 1 : 0);
                            const filled = Object.values(teamGroups).filter(group => group === index).length;
                            const disabled = filled >= capacity && teamGroups[team.id] !== index;
                            return (
                            <Pressable
                              key={index}
                              disabled={disabled}
                              onPress={() => setTeamGroups(current => ({ ...current, [team.id]: index }))}
                              style={[styles.chip, teamGroups[team.id] === index && styles.chipActive, disabled && styles.chipDisabled]}
                            >
                              <Text variant="caption" tone={disabled ? 'dim' : 'default'} style={teamGroups[team.id] === index ? styles.activeText : undefined}>
                                Group {String.fromCharCode(65 + index)} ({filled}/{capacity})
                              </Text>
                            </Pressable>
                            );
                            })()
                          ))}
                        </View>
                      </Card>
                    ))}
                  </View>
                </View>
              </>
            )}

            <Card>
              <Text variant="h3">Preview</Text>
              <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
                {previewText(selected, Number(groupCount), Number(advance), teams.length)}
              </Text>
            </Card>

            <Button
              title="Generate fixtures"
              size="lg"
              fullWidth
              loading={saving}
              disabled={teams.length < 2}
              onPress={generate}
            />
            {generationError && (
              <Text variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>
                {generationError}
              </Text>
            )}
            {teams.length < 2 && (
              <Text variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>
                Add at least two teams before generating fixtures.
              </Text>
            )}
              </>
            ) : (
              <>
                <ManualScheduleBuilder
                  setup={setup ?? { stages: [], groups: [], matches: [], bracket: null }}
                  teams={teams}
                  saving={saving}
                  onAddStage={addManualStage}
                  onAddGroup={addManualGroup}
                  onAddFixture={addManualFixture}
                />
                {generationError && (
                  <Text variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>
                    {generationError}
                  </Text>
                )}
                {teams.length < 2 && (
                  <Text variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>
                    Add at least two teams before building a schedule.
                  </Text>
                )}
              </>
            )}
          </>
        )}

        <Button title="Back to tournament" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function GeneratedSummary({ setup, teams, manual, onUndo, onResetKnockout, undoing, onGenerateKnockout }: {
  setup: GeneratedFixtureSetup;
  teams: Team[];
  manual: boolean;
  onUndo: () => void;
  onResetKnockout: () => void;
  undoing: boolean;
  onGenerateKnockout: (preset: KnockoutPreset, qualifierTeamIds?: string[]) => Promise<void>;
}) {
  const names = new Map(teams.filter(team => team.cloudId).map(team => [team.cloudId!, team.name]));
  const groupStage = setup.stages.find(stage => stage.type === 'GROUP');
  const groupMatches = setup.matches.filter(match => match.stageId === groupStage?.id);
  const groupsComplete = groupMatches.length > 0 && groupMatches.every(match => match.status === 'COMPLETED' || match.status === 'WALKOVER');
  const knockoutStage = setup.stages.find(stage => stage.type === 'KNOCKOUT');
  const knockoutMatches = setup.matches.filter(match => match.stageId === knockoutStage?.id);
  const hasGeneratedKnockout = Boolean(setup.bracket || knockoutMatches.length);
  const knockoutPlanned = Boolean(groupStage?.config?.knockoutPlanned || knockoutStage);
  const canResetAll = groupMatches.every(match => match.status === 'SCHEDULED');
  const allMatchesUnstarted = setup.matches.every(match => match.status === 'SCHEDULED');
  return (
    <>
      <Card>
        <Text variant="h2">{manual ? 'Manual schedule' : 'Fixtures ready'}</Text>
        <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
          {setup.stages.length} stage(s) · {setup.groups.length} group(s) · {setup.matches.length} {manual ? 'fixture(s)' : 'opening fixture(s)'}
        </Text>
      </Card>
      {setup.groups.map(group => (
        <Card key={group.id}>
          <Text variant="h3">{group.name}</Text>
          <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
            {group.team_ids.map((teamId: string) => names.get(teamId) ?? 'Unknown team').join(' · ')}
          </Text>
        </Card>
      ))}
      {setup.matches.map(match => (
        <View key={match.id} style={styles.fixtureRow}>
          <Text variant="caption" tone="dim">R{match.round}</Text>
          <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>{names.get(match.teamA) ?? 'TBD'}</Text>
          <Text variant="caption" tone="muted">vs</Text>
          <Text variant="bodyStrong" style={{ flex: 1 }}>{match.teamB ? names.get(match.teamB) ?? 'TBD' : 'BYE'}</Text>
        </View>
      ))}
      {setup.bracket?.rounds.map(round => (
        <Card key={round.id}>
          <Text variant="h3">{round.name.replaceAll('_', ' ')}</Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {round.matches.length > 0
              ? round.matches.map(match => (
                <Text key={match.id} variant="body" tone="muted">
                  {names.get(match.teamA) ?? match.teamA} vs {match.teamB ? names.get(match.teamB) ?? match.teamB : 'BYE'}
                </Text>
              ))
              : round.slotMap
                .filter(entry => entry.slot % 2 === 1)
                .map((entry, index) => (
                  <Text key={entry.slot} variant="body" tone="muted">
                    {entry.sourceRef} vs {round.slotMap[index * 2 + 1]?.sourceRef ?? 'TBD'}
                  </Text>
                ))}
          </View>
        </Card>
      ))}
      {!manual && groupStage && knockoutPlanned && !hasGeneratedKnockout ? (
        groupsComplete
          ? <KnockoutBuilder setup={setup} teams={teams} saving={undoing} onGenerate={onGenerateKnockout} />
          : <Card><Text variant="h3">Knockouts unlock after the groups</Text><Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>Complete every group match, then the owner can select and confirm the knockout format.</Text></Card>
      ) : null}
      {manual && allMatchesUnstarted
        ? <Button title="Reset manual schedule" variant="secondary" onPress={onUndo} loading={undoing} fullWidth />
        : hasGeneratedKnockout
        ? <Button title="Reset knockout fixtures" variant="secondary" onPress={onResetKnockout} loading={undoing} fullWidth />
        : canResetAll
          ? <Button title="Undo group fixtures and change format" variant="secondary" onPress={onUndo} loading={undoing} fullWidth />
          : null}
    </>
  );
}

function KnockoutBuilder({ setup, teams, saving, onGenerate }: {
  setup: GeneratedFixtureSetup;
  teams: Team[];
  saving: boolean;
  onGenerate: (preset: KnockoutPreset, qualifierTeamIds?: string[]) => Promise<void>;
}) {
  const [preset, setPreset] = useState<KnockoutPreset>('SF_4');
  const [customCount, setCustomCount] = useState<2 | 4 | 8>(4);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const cloudTeams = teams.filter((team): team is Team & { cloudId: string } => Boolean(team.cloudId));
  const groups = setup.groups;
  const crossoverAvailable = groups.length === 2 && groups.every(group => group.team_ids.length >= 3);
  const needed = preset === 'CUSTOM' ? customCount : undefined;
  const toggleQualifier = (teamId: string) => setSelectedTeams(current =>
    current.includes(teamId) ? current.filter(id => id !== teamId) : current.length < (needed ?? 0) ? [...current, teamId] : current,
  );
  return <Card>
    <Text variant="h2">Generate knockout stage</Text>
    <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>Choose a preset. Nothing is created until you confirm.</Text>
    <View style={[styles.chips, { marginTop: spacing.md }]}>
      {([
        ['FINAL_2', 'Top 2 · Final'],
        ['SF_4', 'Top 4 · SF → Final'],
        ['QF_8', 'Top 8 · QF → SF → Final'],
        ['PLAYOFFS_4', 'Top 4 · Playoffs'],
        ['SIX_TEAM_CROSSOVER', '2 groups · 6-team crossover'],
        ['CUSTOM', 'Custom qualifiers'],
      ] as const).map(([value, label]) => {
        const disabled = (value === 'SIX_TEAM_CROSSOVER' && !crossoverAvailable) || (value === 'PLAYOFFS_4' && (groups.length !== 1 || groups[0].team_ids.length < 4));
        return <Pressable key={value} disabled={disabled} onPress={() => { setPreset(value); setSelectedTeams([]); }} style={[styles.chip, preset === value && styles.chipActive, disabled && styles.chipDisabled]}>
          <Text variant="caption" tone={disabled ? 'dim' : 'default'} style={preset === value ? styles.activeText : undefined}>{label}</Text>
        </Pressable>;
      })}
    </View>
    {preset === 'SIX_TEAM_CROSSOVER' ? <Text variant="caption" tone="muted" style={{ marginTop: spacing.md }}>A1 vs B3, A2 vs B2, A3 vs B1. The winning team with the best group-stage NRR advances directly to the Final; the other winners play the Eliminator.</Text> : null}
    {preset === 'PLAYOFFS_4' ? <Text variant="caption" tone="muted" style={{ marginTop: spacing.md }}>Qualifier 1: 1st vs 2nd. Eliminator: 3rd vs 4th. The Q1 winner reaches the Final; its loser plays the Eliminator winner in Qualifier 2.</Text> : null}
    {preset === 'CUSTOM' ? <View style={{ marginTop: spacing.md, gap: spacing.md }}>
      <View style={styles.chips}>{([2, 4, 8] as const).map(count => <Pressable key={count} onPress={() => { setCustomCount(count); setSelectedTeams([]); }} style={[styles.chip, customCount === count && styles.chipActive]}><Text variant="caption" style={customCount === count ? styles.activeText : undefined}>{count} qualifiers</Text></Pressable>)}</View>
      <Text variant="caption" tone="muted">Select {customCount} teams in seed order ({selectedTeams.length}/{customCount}).</Text>
      <View style={styles.chips}>{cloudTeams.map(team => <Pressable key={team.cloudId} onPress={() => toggleQualifier(team.cloudId)} disabled={!selectedTeams.includes(team.cloudId) && selectedTeams.length >= customCount} style={[styles.chip, selectedTeams.includes(team.cloudId) && styles.chipActive, !selectedTeams.includes(team.cloudId) && selectedTeams.length >= customCount && styles.chipDisabled]}><Text variant="caption" style={selectedTeams.includes(team.cloudId) ? styles.activeText : undefined}>{team.shortName}</Text></Pressable>)}</View>
    </View> : null}
    <Button title="Confirm and generate knockout" fullWidth loading={saving} disabled={preset === 'CUSTOM' && selectedTeams.length !== customCount} onPress={() => void onGenerate(preset, preset === 'CUSTOM' ? selectedTeams : undefined)} />
  </Card>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>{children}</Text>;
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Label>{label}</Label>
      <TextInput value={value} onChangeText={onChange} keyboardType="number-pad" style={styles.input} />
    </View>
  );
}

function formatLabel(type: TournamentFormatType) {
  return ({ GROUPS_ONLY: 'Groups only', GROUPS_THEN_KNOCKOUT: 'Groups + KO', KNOCKOUT_ONLY: 'Knockout' })[type];
}
function guidedFormatChoices(recommendation: FormatRecommendation, teamCount: number): Omit<FormatRecommendation, 'alternatives'>[] {
  const candidates = [recommendation, ...(recommendation.alternatives ?? [])];
  const groupOnly = candidates.find(item => item.formatType === 'GROUPS_ONLY') ?? {
    ...recommendation,
    formatType: 'GROUPS_ONLY' as const,
    numberOfGroups: Math.max(1, Math.round(teamCount / 4)),
    advancePerGroup: 0,
    knockoutRounds: [],
    byes: 0,
    pairingAlgorithm: 'ROUND_ROBIN' as const,
    rationale: 'Manually create balanced groups, then generate only their fixtures.',
  };
  const hybrid = candidates.find(item => item.formatType === 'GROUPS_THEN_KNOCKOUT') ?? {
    ...groupOnly,
    formatType: 'GROUPS_THEN_KNOCKOUT' as const,
    advancePerGroup: 2,
    rationale: 'Generate group fixtures now and choose the knockout format after every group match is complete.',
  };
  return [groupOnly, hybrid];
}
function algorithmLabel(value: PairingAlgorithm) {
  return value.split('_').map(word => word[0] + word.slice(1).toLowerCase()).join(' ');
}
function previewText(recommendation: FormatRecommendation, groups: number, advance: number, teams: number) {
  if (recommendation.formatType === 'KNOCKOUT_ONLY') {
    return `${teams} teams enter ${recommendation.knockoutRounds.join(' → ')} with ${recommendation.byes} bye(s).`;
  }
  const groupText = `${groups} group(s), approximately ${Math.ceil(teams / Math.max(1, groups))} teams each`;
  return recommendation.formatType === 'GROUPS_ONLY'
    ? `${groupText}. Final standings decide the tournament.`
    : `${groupText}. ${advance} per group advance to the knockout stage.`;
}
function showError(cause: unknown) {
  Alert.alert('Could not configure fixtures', cause instanceof Error ? cause.message : 'Please try again.');
}

function confirmFixtureAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', gap: spacing.md },
  choiceGrid: { flexDirection: 'row', gap: spacing.sm },
  choice: {
    flex: 1,
    minHeight: 88,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  choiceActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  activeText: { color: colors.accentInk },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipDisabled: { opacity: 0.35 },
  input: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 17,
    padding: spacing.md,
  },
  fixtureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
