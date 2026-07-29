import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
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
import { fixturesApi, GeneratedFixtureSetup } from '@/lib/supabase/fixturesApi';
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
  const [algorithm, setAlgorithm] = useState<PairingAlgorithm>('ROUND_ROBIN');
  const [groupCount, setGroupCount] = useState('1');
  const [advance, setAdvance] = useState('0');
  const [setup, setSetup] = useState<GeneratedFixtureSetup>();
  const [saving, setSaving] = useState(false);
  const [generationError, setGenerationError] = useState<string>();
  const [teamGroups, setTeamGroups] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!id) return;
    const [nextTournament, nextTeams] = await Promise.all([getTournament(id), listTeams(id)]);
    setTournament(nextTournament);
    setTeams(nextTeams);
    if (nextTournament?.cloudId) setSetup(await fixturesApi.getFixtureSetup(nextTournament.cloudId));
    if (!selected) {
      const recommendation = fixturesApi.getFormatRecommendation(Math.max(2, nextTeams.length || nextTournament?.plannedTeamCount || 2));
      setSelected(recommendation);
      setAlgorithm(recommendation.pairingAlgorithm);
      setGroupCount(String(recommendation.numberOfGroups || 1));
      setAdvance(String(recommendation.advancePerGroup));
    }
  }, [id, selected]);

  useEffect(() => { load().catch(showError); }, [load]);
  useEffect(() => {
    if (!tournament?.cloudId) return;
    return fixturesApi.subscribeToTournament(tournament.cloudId, () => {
      fixturesApi.getFixtureSetup(tournament.cloudId!).then(setSetup).catch(showError);
    });
  }, [tournament?.cloudId]);

  const generated = Boolean(setup?.stages.length);

  function applyRecommendation(recommendation: FormatRecommendation) {
    setSelected({
      ...recommendation,
      alternatives: recommendation.alternatives ?? selected?.alternatives ?? [],
    });
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

  if (!tournament || !selected) return <Screen><Text tone="muted">Loading…</Text></Screen>;

  const choices = Array.from(
    new Map([selected, ...(selected.alternatives ?? [])].map(choice => [choice.formatType, choice])).values(),
  );
  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'Tournament fixtures' }} />
      <View style={styles.content}>
        <View>
          <Text variant="overline" tone="muted">FIXTURE BUILDER</Text>
          <Text variant="h1" style={{ marginTop: spacing.xs }}>{tournament.name}</Text>
          <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
            Recommendation recalculated for {teams.length || tournament.plannedTeamCount} teams before generation.
          </Text>
        </View>

        {generated ? (
          <GeneratedSummary setup={setup!} teams={teams} />
        ) : (
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
                  <NumberField label="ADVANCE / GROUP" value={advance} onChange={setAdvance} />
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
                            <Pressable
                              key={index}
                              onPress={() => setTeamGroups(current => ({ ...current, [team.id]: index }))}
                              style={[styles.chip, teamGroups[team.id] === index && styles.chipActive]}
                            >
                              <Text variant="caption" style={teamGroups[team.id] === index ? styles.activeText : undefined}>
                                Group {String.fromCharCode(65 + index)}
                              </Text>
                            </Pressable>
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
        )}

        <Button title="Back to tournament" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function GeneratedSummary({ setup, teams }: { setup: GeneratedFixtureSetup; teams: Team[] }) {
  const names = new Map(teams.filter(team => team.cloudId).map(team => [team.cloudId!, team.name]));
  return (
    <>
      <Card>
        <Text variant="h2">Fixtures ready</Text>
        <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
          {setup.stages.length} stage(s) · {setup.groups.length} group(s) · {setup.matches.length} opening fixture(s)
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
    </>
  );
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
