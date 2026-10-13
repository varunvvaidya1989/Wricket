import { FixturePagination, fixturePageSize } from '@/components/wricket/fixtures/FixturePagination';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { Text } from '@/components/wricket/ui/Text';
import { QualifierSeeding } from '@/components/wricket/fixtures/QualifierSeeding';
import { BracketProgression } from '@/components/wricket/fixtures/BracketProgression';
import { FixturePlanEditor } from '@/components/wricket/fixtures/FixturePlanEditor';
import { fixtureFormatChoices, fixturePlan } from '@/lib/wricket/presentation/fixturePlan';
import { ManualScheduleBuilder } from '@/components/wricket/fixtures/ManualScheduleBuilder';
import { useAuth } from '@/components/providers/AuthProvider';
import { getTournament, getTournamentByCloudId, listTeams } from '@/lib/wricket/db/repo';
import type { Team, Tournament } from '@/lib/wricket/domain/types';
import {
  nextPowerOfTwo,
  roundsFor,
} from '@/lib/wricket/fixtures/recommender';
import type {
  FormatRecommendation,
  PairingAlgorithm,
} from '@/lib/wricket/fixtures';
import {
  fixturesApi,
  GeneratedFixtureSetup,
  KnockoutPreset,
  ManualFixtureInput,
} from '@/lib/supabase/fixturesApi';
import { syncTournamentData } from '@/lib/wricket/sync/tournamentSync';
import { colors } from '@/lib/wricket/presentation/design';
import { radius, spacing } from '@/lib/theme/spacing';

export default function TournamentFixturesSetupScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const router = useRouter();
  const auth = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<FormatRecommendation>();
  const [formatChoices, setFormatChoices] = useState<Omit<FormatRecommendation, 'alternatives'>[]>([]);
  const [algorithm, setAlgorithm] = useState<PairingAlgorithm>('ROUND_ROBIN');
  const [groupCount, setGroupCount] = useState('1');
  const [advance, setAdvance] = useState('0');
  const [setup, setSetup] = useState<GeneratedFixtureSetup>();
  const [saving, setSaving] = useState(false);
  const generating = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const progressing = useRef(false);
  const [generationError, setGenerationError] = useState<string>();
  const [teamGroups, setTeamGroups] = useState<Record<string, number>>({});
  const [builderMode, setBuilderMode] = useState<'AUTOMATIC' | 'MANUAL'>('AUTOMATIC');

  const load = useCallback(async () => {
    if (!id) return;
    let nextTournament = await getTournament(id) ?? await getTournamentByCloudId(id);
    if (!nextTournament && auth.session) {
      await syncTournamentData(auth.session.user.id);
      nextTournament = await getTournament(id) ?? await getTournamentByCloudId(id);
    }
    if (!nextTournament) {
      if (!auth.session) return;
      throw new Error('This tournament is no longer available to your account.');
    }
    const nextTeams = await listTeams(nextTournament.id);
    setLoadError(undefined);
    setTournament(nextTournament);
    setTeams(nextTeams);
    if (nextTournament?.cloudId) setSetup(await fixturesApi.getFixtureSetup(nextTournament.cloudId));
    if (!selected) {
      const recommendation = fixturesApi.getFormatRecommendation(Math.max(2, nextTeams.length || nextTournament?.plannedTeamCount || 2));
      const guidedChoices = fixtureFormatChoices(recommendation, Math.max(2, nextTeams.length || nextTournament?.plannedTeamCount || 2));
      const initial = guidedChoices.find(choice => choice.formatType === recommendation.formatType) ?? guidedChoices[0];
      setSelected({ ...initial, alternatives: guidedChoices });
      setFormatChoices(guidedChoices);
      setAlgorithm(initial.pairingAlgorithm);
      setGroupCount(String(initial.numberOfGroups || 1));
      setAdvance(String(initial.advancePerGroup));
    }
  }, [id, selected, auth.session]);

  useEffect(() => { void load().catch(cause => setLoadError(cause instanceof Error ? cause.message : 'Could not load fixtures.')); }, [load]);
  useEffect(() => {
    const count = Math.max(1, Number(groupCount) || 1);
    setTeamGroups(current => Object.fromEntries(Object.entries(current).filter(([, group]) => group < count)));
  }, [groupCount]);
  const refreshBracket = useCallback(async () => {
    if (!tournament?.cloudId || progressing.current) return;
    progressing.current = true;
    try {
      if (tournament.organizerProfileId === auth.session?.user.id) {
        try { await fixturesApi.advanceTournamentIfReady(tournament.cloudId); setGenerationError(undefined); }
        catch (cause) { setGenerationError(cause instanceof Error ? cause.message : 'Could not advance the bracket.'); }
      }
      setSetup(await fixturesApi.getFixtureSetup(tournament.cloudId));
    } finally { progressing.current = false; }
  }, [tournament?.cloudId, tournament?.organizerProfileId, auth.session?.user.id]);

  useEffect(() => {
    if (!tournament?.cloudId) return;
    void refreshBracket().catch(showError);
    return fixturesApi.subscribeToTournament(tournament.cloudId, () => { void refreshBracket().catch(showError); });
  }, [tournament?.cloudId, refreshBracket]);

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

  const editManualFixture = async (fixtureId: string, input: ManualFixtureInput) => {
    setSaving(true); setGenerationError(undefined);
    try {
      await fixturesApi.editManualFixture(fixtureId, input);
      if (tournament?.cloudId) setSetup(await fixturesApi.getFixtureSetup(tournament.cloudId));
      return true;
    } catch (cause) {
      setGenerationError(cause instanceof Error ? cause.message : 'Please try again.');
      return false;
    } finally { setSaving(false); }
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
    if (generating.current) return;
    const validation = fixturePlan({ teamIds: teams.map(team => team.id), format: selected.formatType, algorithm, groups: groupCount, advance, assignments: teamGroups });
    if (validation.error) { setGenerationError(validation.error); return; }
    const groups = selected.formatType === 'KNOCKOUT_ONLY' ? 0 : Number(groupCount);
    if (selected.formatType !== 'KNOCKOUT_ONLY' && (!Number.isInteger(groups) || groups > Math.floor(teams.length / 2))) {
      Alert.alert('Invalid group count', `Choose between 1 and ${Math.max(1, Math.floor(teams.length / 2))} groups so every group has at least two teams.`);
      return;
    }
    const advancePerGroup = selected.formatType === 'GROUPS_THEN_KNOCKOUT' ? Number(advance) : 0;
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
    generating.current = true;
    setSaving(true);
    setGenerationError(undefined);
    try {
      await syncTournamentData(auth.session.user.id, { forceRetry: true });
      const [freshTournament, freshTeams] = await Promise.all([
        getTournament(tournament.id),
        listTeams(tournament.id),
      ]);
      if (freshTeams.length !== teams.length || freshTeams.some(team => !teams.some(previous => previous.id === team.id))) {
        setTeams(freshTeams);
        throw new Error('The team list changed. Review your fixture plan before generating.');
      }
      const freshSyncedTeams = teams.map(team => freshTeams.find(fresh => fresh.id === team.id)!).filter(team => team.cloudId);
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
      generating.current = false;
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
    if (!cloudTournamentId || generating.current) return;
    generating.current = true;
    setSaving(true);
    setGenerationError(undefined);
    try {
      await fixturesApi.generateKnockout({ tournamentId: cloudTournamentId, preset, qualifierTeamIds });
      setSetup(await fixturesApi.getFixtureSetup(cloudTournamentId));
      Alert.alert('Knockout fixtures ready', 'Review the knockout fixtures before scheduling matches.');
    } catch (cause) {
      setGenerationError(cause instanceof Error ? cause.message : 'Could not generate the bracket.');
    } finally {
      generating.current = false;
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

  if (!tournament || !selected) return <Screen padded={false}>{loadError ? <View style={{ padding: 18 }}><StateNotice error title="Fixture plan unavailable" detail={loadError} action={{ label: 'Try again', onPress: () => void load().catch(cause => setLoadError(cause instanceof Error ? cause.message : 'Could not load fixtures.')) }} /></View> : <SportStageLoader message="Building fixture control" detail="Loading stages, teams, and schedule rules" />}</Screen>;
  if (tournament.organizerProfileId !== auth.session?.user.id) return <Screen padded={false}><WricketHeader title="Fixture plan" backTo="/wricket/my-wricket" /><View style={{ padding: 18, gap: 16 }}><Text variant="h1">Owner access required.</Text><Text tone="muted">Only the tournament owner can change fixtures and the winning bracket.</Text><Button title="View tournament" onPress={() => router.replace({ pathname: '/wricket/tournament/[id]', params: { id: tournament.id } })} /></View></Screen>;

  const openFixtureMatch = (match: GeneratedFixtureSetup['matches'][number], edit: boolean) => {
    const teamA = teams.find(team => team.cloudId === match.teamA);
    const teamB = teams.find(team => team.cloudId === match.teamB);
    if (!tournament || !match.canonicalMatchId || !teamA || !teamB) return;
    router.push({
      pathname: '/wricket/match/new',
      params: {
        tournamentId: tournament.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        canonicalMatchId: match.canonicalMatchId,
        format: tournament.format,
        ...(edit ? {
          editFixtureId: match.id,
          scheduledAt: match.scheduledAt,
          venue: tournament.location,
        } : {}),
      },
    });
  };

  const choices = formatChoices.length ? formatChoices : [selected];
  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <WricketHeader title={focus === 'knockout' ? 'Winning bracket' : manualSchedule || builderMode === 'MANUAL' ? 'Manual schedule' : 'Fixture plan'} backTo={{ pathname: '/wricket/tournament/[id]', params: { id: tournament.id, tab: 'settings' } }} />
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {(!generated && builderMode === 'AUTOMATIC') || (generated && !manualSchedule && focus !== 'knockout') ? <View>
          <Text variant="overline" tone="muted">{tournament.name}</Text>
          <Text variant="h1" style={{ marginTop: spacing.xs }}>{focus === 'knockout' ? 'Winning bracket.' : 'A plan for every game.'}</Text>
          <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
            {focus === 'knockout' ? 'Review qualification and progression. Group results must meet the existing competition rules.' : 'Choose automatic pairings or build stages and fixtures manually.'}
          </Text>
        </View> : null}

        {generated ? (
          <>
            {manualSchedule && focus !== 'knockout' && (
              <ManualScheduleBuilder
                setup={setup!}
                teams={teams}
                saving={saving}
                onAddStage={addManualStage}
                onAddGroup={addManualGroup}
                onAddFixture={addManualFixture}
                onEditFixture={editManualFixture}
              />
            )}
            <GeneratedSummary
              focusKnockout={focus === 'knockout'}
              setup={setup!}
              teams={teams}
              manual={manualSchedule}
              canManage={tournament.organizerProfileId === auth.session?.user.id}
              onUndo={undoGeneration}
              onResetKnockout={resetKnockout}
              undoing={saving}
              onGenerateKnockout={generateKnockout}
              onStartFixture={match => openFixtureMatch(match, false)}
              onScheduleFixture={match => openFixtureMatch(match, true)}
            />
            {focus === 'knockout' ? <Button title="Refresh bracket" variant="ghost" onPress={() => void refreshBracket().catch(showError)} /> : null}
            {generationError && (
              <Text variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>
                {generationError}
              </Text>
            )}
          </>
        ) : (
          <>
            <View>
              <Text variant="caption" tone="muted" style={{ marginBottom: 8 }}>Scheduling method</Text>
              <View style={styles.choiceGrid}>
                <Pressable
                  accessibilityRole="radio" accessibilityLabel="Automatic" accessibilityState={{ checked: builderMode === 'AUTOMATIC', disabled: saving }} disabled={saving}
                  onPress={() => setBuilderMode('AUTOMATIC')}
                  style={[styles.choice, builderMode === 'AUTOMATIC' && styles.choiceActive]}
                >
                  <DesignIcon
                    name="star"
                    size={18}
                    color={builderMode === 'AUTOMATIC' ? colors.accentInk : colors.text}
                  />
                  <Text variant="bodyStrong" style={builderMode === 'AUTOMATIC' ? styles.activeText : undefined}>
                    Automatic
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="radio" accessibilityLabel="Manual" accessibilityState={{ checked: builderMode === 'MANUAL', disabled: saving }} disabled={saving}
                  onPress={() => setBuilderMode('MANUAL')}
                  style={[styles.choice, builderMode === 'MANUAL' && styles.choiceActive]}
                >
                  <DesignIcon
                    name="edit"
                    size={18}
                    color={builderMode === 'MANUAL' ? colors.accentInk : colors.text}
                  />
                  <Text variant="bodyStrong" style={builderMode === 'MANUAL' ? styles.activeText : undefined}>
                    Manual
                  </Text>
                </Pressable>
              </View>
            </View>

            {builderMode === 'AUTOMATIC' ? (
              <>
                <FixturePlanEditor teams={teams} format={selected.formatType} algorithm={algorithm}
                  groups={groupCount} advance={advance} assignments={teamGroups} saving={saving} error={generationError}
                  onFormat={value => { const choice = choices.find(item => item.formatType === value); if (choice) applyRecommendation(choice); }}
                  onNavigate={() => scroll.current?.scrollTo({ y: 0, animated: false })}
                  onAlgorithm={setAlgorithm} onGroups={setGroupCount} onAdvance={setAdvance} onAssignments={setTeamGroups} onGenerate={() => void generate()} />
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
                  onEditFixture={editManualFixture}
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
      </ScrollView>
    </Screen>
  );
}

function GeneratedSummary({
  setup, teams, manual, canManage, onUndo, onResetKnockout, undoing, onGenerateKnockout, onStartFixture, onScheduleFixture, focusKnockout,
}: {
  setup: GeneratedFixtureSetup;
  focusKnockout: boolean;
  teams: Team[];
  manual: boolean;
  canManage: boolean;
  onUndo: () => void;
  onResetKnockout: () => void;
  undoing: boolean;
  onGenerateKnockout: (preset: KnockoutPreset, qualifierTeamIds?: string[]) => Promise<void>;
  onStartFixture: (match: GeneratedFixtureSetup['matches'][number]) => void;
  onScheduleFixture: (match: GeneratedFixtureSetup['matches'][number]) => void;
}) {
  const [fixturePage, setFixturePage] = useState(0);
  const names = new Map(teams.filter(team => team.cloudId).map(team => [team.cloudId!, team.name]));
  const groupStage = setup.stages.find(stage => stage.type === 'GROUP');
  const groupMatches = setup.matches.filter(match => match.stageId === groupStage?.id);
  const groupsComplete = groupMatches.length > 0 && groupMatches.every(match => match.status === 'COMPLETED' || match.status === 'WALKOVER');
  const knockoutStage = setup.stages.find(stage => stage.type === 'KNOCKOUT');
  const knockoutMatches = setup.matches.filter(match => match.stageId === knockoutStage?.id);
  const hasGeneratedKnockout = Boolean(setup.bracket || knockoutMatches.length);
  const canResetAll = groupMatches.every(match => match.status === 'SCHEDULED');
  const knockoutUnstarted = knockoutMatches.every(match => match.status === 'SCHEDULED');
  const allMatchesUnstarted = setup.matches.every(match => match.status === 'SCHEDULED');
  const listedFixtures = focusKnockout ? setup.bracket ? [] : knockoutMatches : setup.matches.filter(match => !setup.bracket || match.stageId !== knockoutStage?.id);
  const pageSize = fixturePageSize;
  const pageCount = Math.max(1, Math.ceil(listedFixtures.length / pageSize));
  const currentPage = Math.min(fixturePage, pageCount - 1);
  const pageFixtures = listedFixtures.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return (
    <>
      {!focusKnockout && <Card>
        <Text variant="h2">{manual ? 'Manual schedule' : 'Fixtures ready'}</Text>
        <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
          {setup.stages.length} stage(s) · {setup.groups.length} group(s) · {setup.matches.length} {manual ? 'fixture(s)' : 'opening fixture(s)'}
        </Text>
      </Card>}
      {!focusKnockout && setup.groups.map(group => (
        <Card key={group.id}>
          <Text variant="h3">{group.name}</Text>
          <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
            {group.team_ids.map((teamId: string) => names.get(teamId) ?? 'Unknown team').join(' · ')}
          </Text>
        </Card>
      ))}
      <FixturePagination total={listedFixtures.length} page={currentPage} onPage={setFixturePage} />
      {pageFixtures.map(match => (
        <View key={match.id} style={{ gap: spacing.sm }}>
          <View style={styles.fixtureRow}>
            <Text variant="caption" tone="dim">R{match.round}</Text>
            <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>{names.get(match.teamA) ?? 'TBD'}</Text>
            <Text variant="caption" tone="muted">vs</Text>
            <Text variant="bodyStrong" style={{ flex: 1 }}>{match.teamB ? names.get(match.teamB) ?? 'TBD' : 'BYE'}</Text>
          </View>
          {canManage && match.status === 'SCHEDULED' && match.teamB && match.canonicalMatchId && (
            <View style={styles.fixtureActions}>
              <Button title="Schedule" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => onScheduleFixture(match)} />
              <Button title="Start match" size="sm" style={{ flex: 1 }} onPress={() => onStartFixture(match)} />
            </View>
          )}
        </View>
      ))}
      {setup.bracket ? <BracketProgression bracket={setup.bracket} names={names} manual={Boolean(knockoutStage?.config?.manual)} canManage={canManage} onSchedule={onScheduleFixture} onStart={onStartFixture} /> : null}
      {groupStage && !hasGeneratedKnockout ? (
        groupsComplete
          ? <QualifierSeeding setup={setup} teams={teams} saving={undoing} onGenerate={onGenerateKnockout} />
          : <Card><Text variant="h3">Knockouts unlock after the groups</Text><Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>Complete every group match, then the owner can select and confirm the knockout format.</Text></Card>
      ) : null}
      {manual && allMatchesUnstarted
        ? <Button title="Reset manual schedule" variant="secondary" onPress={onUndo} loading={undoing} fullWidth />
        : hasGeneratedKnockout
        ? knockoutUnstarted ? <Button title="Reset knockout fixtures" variant="secondary" onPress={onResetKnockout} loading={undoing} fullWidth /> : <Text variant="caption" tone="muted">Reset is locked after a knockout match starts.</Text>
        : canResetAll
          ? <Button title="Undo group fixtures and change format" variant="secondary" onPress={onUndo} loading={undoing} fullWidth />
          : null}
    </>
  );
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
  content: { gap: 18, paddingHorizontal: 18, paddingTop: 18, paddingBottom: spacing.xxxl, width: '100%', maxWidth: 720, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: spacing.md },
  choiceGrid: { flexDirection: 'row', gap: spacing.sm },
  choice: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
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
  fixtureActions: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md },
});
