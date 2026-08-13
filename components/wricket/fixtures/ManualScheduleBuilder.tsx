import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import type { GeneratedFixtureSetup, ManualFixtureInput } from '@/lib/supabase/fixturesApi';
import type { Team } from '@/lib/wricket/domain/types';

type ManualTeam = Team & { cloudId: string };

export function ManualScheduleBuilder({
  setup,
  teams,
  saving,
  onAddStage,
  onAddGroup,
  onAddFixture,
}: {
  setup: GeneratedFixtureSetup;
  teams: Team[];
  saving: boolean;
  onAddStage: (type: 'GROUP' | 'KNOCKOUT') => Promise<void>;
  onAddGroup: (input: { stageId: string; name: string; teamIds: string[] }) => Promise<boolean>;
  onAddFixture: (input: ManualFixtureInput) => Promise<boolean>;
}) {
  const cloudTeams = teams.filter((team): team is ManualTeam => Boolean(team.cloudId));
  const groupStage = setup.stages.find(stage => stage.type === 'GROUP');
  const knockoutStage = setup.stages.find(stage => stage.type === 'KNOCKOUT');
  const [groupName, setGroupName] = useState('');
  const [groupTeamIds, setGroupTeamIds] = useState<string[]>([]);
  const [fixtureStageId, setFixtureStageId] = useState('');
  const [fixtureGroupId, setFixtureGroupId] = useState('');
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [round, setRound] = useState('1');
  const [knockoutRoundName, setKnockoutRoundName] = useState('QF');

  const manualStages = useMemo(
    () => setup.stages.filter(stage => stage.config?.manual),
    [setup.stages],
  );
  const fixtureStage = manualStages.find(stage => stage.id === fixtureStageId);
  const stageGroups = useMemo(
    () => fixtureStage?.type === 'GROUP'
      ? setup.groups.filter(group => group.stage_id === fixtureStage.id)
      : [],
    [fixtureStage?.id, fixtureStage?.type, setup.groups],
  );
  const fixtureGroup = stageGroups.find(group => group.id === fixtureGroupId);
  const fixtureTeams = fixtureStage?.type === 'GROUP'
    ? cloudTeams.filter(team => fixtureGroup?.team_ids.includes(team.cloudId))
    : cloudTeams;
  const assignedGroupTeamIds = new Set(setup.groups.flatMap(group => group.team_ids));

  useEffect(() => {
    if (manualStages.some(stage => stage.id === fixtureStageId)) return;
    setFixtureStageId(manualStages[0]?.id ?? '');
  }, [fixtureStageId, manualStages]);

  useEffect(() => {
    if (fixtureStage?.type !== 'GROUP') {
      setFixtureGroupId('');
      return;
    }
    if (!stageGroups.some(group => group.id === fixtureGroupId)) {
      setFixtureGroupId(stageGroups[0]?.id ?? '');
    }
  }, [fixtureGroupId, fixtureStage?.type, stageGroups]);

  useEffect(() => {
    setTeamAId('');
    setTeamBId('');
  }, [fixtureGroupId, fixtureStageId]);

  const toggleGroupTeam = (teamId: string) => {
    setGroupTeamIds(current => current.includes(teamId)
      ? current.filter(id => id !== teamId)
      : [...current, teamId]);
  };

  const addGroup = async () => {
    if (!groupStage) return;
    const added = await onAddGroup({
      stageId: groupStage.id,
      name: groupName.trim() || `Group ${String.fromCharCode(65 + setup.groups.length)}`,
      teamIds: groupTeamIds,
    });
    if (!added) return;
    setGroupName('');
    setGroupTeamIds([]);
  };

  const addFixture = async () => {
    if (!fixtureStage) return;
    const added = await onAddFixture({
      stageId: fixtureStage.id,
      groupId: fixtureStage.type === 'GROUP' ? fixtureGroupId : undefined,
      teamAId,
      teamBId,
      round: Number(round),
      roundName: fixtureStage.type === 'KNOCKOUT' ? knockoutRoundName : undefined,
    });
    if (!added) return;
    setTeamAId('');
    setTeamBId('');
  };

  return (
    <View style={styles.section}>
      <View>
        <Text variant="overline" tone="muted">MANUAL SCHEDULE</Text>
        <Text variant="h2" style={{ marginTop: spacing.xs }}>Build your own stages</Text>
        <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
          Add only the groups and knockout stages you need, then choose every fixture yourself.
        </Text>
      </View>

      <Card>
        <Text variant="h3">Stages</Text>
        <Text variant="caption" tone="muted" style={styles.help}>
          You can run groups, knockouts, or both. Stages are added without generating any pairings.
        </Text>
        <View style={styles.actionRow}>
          <Button
            title={groupStage ? 'Group stage added' : 'Add group stage'}
            variant="secondary"
            disabled={Boolean(groupStage) || teams.length < 2}
            loading={saving && !groupStage}
            onPress={() => void onAddStage('GROUP')}
            style={{ flex: 1 }}
          />
          <Button
            title={knockoutStage ? 'Knockout added' : 'Add knockout'}
            variant="secondary"
            disabled={Boolean(knockoutStage) || teams.length < 2}
            loading={saving && !knockoutStage}
            onPress={() => void onAddStage('KNOCKOUT')}
            style={{ flex: 1 }}
          />
        </View>
      </Card>

      {groupStage && (
        <Card>
          <Text variant="h3">Add a group</Text>
          <Text variant="caption" tone="muted" style={styles.help}>
            Teams already assigned to another group are unavailable.
          </Text>
          <TextInput
            value={groupName}
            onChangeText={setGroupName}
            placeholder={`Group ${String.fromCharCode(65 + setup.groups.length)}`}
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          <View style={styles.chips}>
            {cloudTeams.map(team => {
              const selected = groupTeamIds.includes(team.cloudId);
              const disabled = assignedGroupTeamIds.has(team.cloudId) && !selected;
              return (
                <Pressable
                  key={team.id}
                  disabled={disabled}
                  onPress={() => toggleGroupTeam(team.cloudId)}
                  style={[styles.chip, selected && styles.chipActive, disabled && styles.disabled]}
                >
                  <Text variant="caption" style={selected ? styles.activeText : undefined}>{team.shortName}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button
            title="Add group"
            disabled={groupTeamIds.length < 2}
            loading={saving}
            onPress={() => void addGroup()}
            fullWidth
          />
        </Card>
      )}

      {manualStages.length > 0 && (
        <Card>
          <Text variant="h3">Add a fixture</Text>
          <Text variant="caption" tone="muted" style={styles.help}>
            Choose the stage, round, and both teams. No other fixtures will be generated.
          </Text>
          <FieldLabel>STAGE</FieldLabel>
          <View style={styles.chips}>
            {manualStages.map(stage => (
              <ChoiceChip
                key={stage.id}
                label={stage.type === 'GROUP' ? 'Groups' : 'Knockout'}
                selected={fixtureStageId === stage.id}
                onPress={() => setFixtureStageId(stage.id)}
              />
            ))}
          </View>

          {fixtureStage?.type === 'GROUP' && (
            <>
              <FieldLabel>GROUP</FieldLabel>
              <View style={styles.chips}>
                {stageGroups.map(group => (
                  <ChoiceChip
                    key={group.id}
                    label={group.name}
                    selected={fixtureGroupId === group.id}
                    onPress={() => setFixtureGroupId(group.id)}
                  />
                ))}
              </View>
              {stageGroups.length === 0 && (
                <Text variant="caption" tone="dim">Add a group before creating group fixtures.</Text>
              )}
            </>
          )}

          {fixtureStage?.type === 'KNOCKOUT' && (
            <>
              <FieldLabel>ROUND NAME</FieldLabel>
              <View style={styles.chips}>
                {[
                  ['R16', 'Round of 16'],
                  ['QF', 'Quarter-final'],
                  ['SF', 'Semi-final'],
                  ['F', 'Final'],
                  ['3RD_PLACE', 'Third place'],
                ].map(([value, label]) => (
                  <ChoiceChip
                    key={value}
                    label={label}
                    selected={knockoutRoundName === value}
                    onPress={() => setKnockoutRoundName(value)}
                  />
                ))}
              </View>
            </>
          )}

          <FieldLabel>{fixtureStage?.type === 'KNOCKOUT' ? 'ROUND ORDER' : 'ROUND'}</FieldLabel>
          <TextInput
            value={round}
            onChangeText={setRound}
            keyboardType="number-pad"
            style={[styles.input, { width: 90 }]}
          />
          {fixtureStage?.type === 'KNOCKOUT' && (
            <Text variant="caption" tone="dim" style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}>
              Use 1 for the first knockout round, 2 for the next, and so on.
            </Text>
          )}

          <FieldLabel>TEAM A</FieldLabel>
          <View style={styles.chips}>
            {fixtureTeams.map(team => (
              <ChoiceChip
                key={team.id}
                label={team.shortName}
                selected={teamAId === team.cloudId}
                disabled={teamBId === team.cloudId}
                onPress={() => setTeamAId(team.cloudId)}
              />
            ))}
          </View>

          <FieldLabel>TEAM B</FieldLabel>
          <View style={styles.chips}>
            {fixtureTeams.map(team => (
              <ChoiceChip
                key={team.id}
                label={team.shortName}
                selected={teamBId === team.cloudId}
                disabled={teamAId === team.cloudId}
                onPress={() => setTeamBId(team.cloudId)}
              />
            ))}
          </View>

          <Button
            title="Add fixture"
            disabled={
              !fixtureStage ||
              (fixtureStage.type === 'GROUP' && !fixtureGroupId) ||
              !teamAId ||
              !teamBId ||
              !Number.isInteger(Number(round)) ||
              Number(round) < 1
            }
            loading={saving}
            onPress={() => void addFixture()}
            fullWidth
          />
        </Card>
      )}
    </View>
  );
}

function ChoiceChip({ label, selected, disabled, onPress }: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipActive, disabled && styles.disabled]}
    >
      <Text variant="caption" style={selected ? styles.activeText : undefined}>{label}</Text>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text variant="caption" tone="muted" style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.xl },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  help: { marginTop: spacing.xs, marginBottom: spacing.md },
  label: { marginTop: spacing.md, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  activeText: { color: colors.accentInk },
  disabled: { opacity: 0.35 },
  input: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
});
