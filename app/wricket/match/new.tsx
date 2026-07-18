import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, palette } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import {
  listTeams,
  listTeamPlayers,
  createMatch,
  setMatchToss,
  setMatchXI,
  createUser,
  addPlayerToTeam,
  createInnings,
  setMatchStatus,
} from '@/lib/wricket/db/repo';
import { Team, User, MatchFormat, FORMAT_LABEL, DEFAULT_RULES, TossChoice } from '@/lib/wricket/domain/types';

type Step = 'teams' | 'players' | 'toss' | 'review';

const FORMATS: MatchFormat[] = ['BOX', 'TURF', 'TURF_TEST'];

export default function NewMatchScreen() {
  const router = useRouter();
  const { tournamentId } = useLocalSearchParams<{ tournamentId?: string }>();

  const [step, setStep] = useState<Step>('teams');
  const [format, setFormat] = useState<MatchFormat>('TURF');
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [teamAId, setTeamAId] = useState<string | null>(null);
  const [teamBId, setTeamBId] = useState<string | null>(null);
  const [playersA, setPlayersA] = useState<User[]>([]);
  const [playersB, setPlayersB] = useState<User[]>([]);
  const [tossWinnerId, setTossWinnerId] = useState<string | null>(null);
  const [tossChoice, setTossChoice] = useState<TossChoice>('BAT');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await listTeams(tournamentId ?? null);
      setAllTeams(t);
    })();
  }, [tournamentId]);

  useEffect(() => {
    (async () => {
      if (teamAId) setPlayersA(await listTeamPlayers(teamAId));
      else setPlayersA([]);
    })();
  }, [teamAId]);

  useEffect(() => {
    (async () => {
      if (teamBId) setPlayersB(await listTeamPlayers(teamBId));
      else setPlayersB([]);
    })();
  }, [teamBId]);

  const teamA = allTeams.find(t => t.id === teamAId);
  const teamB = allTeams.find(t => t.id === teamBId);
  const rules = DEFAULT_RULES[format];

  const canProceedTeams = teamAId && teamBId && teamAId !== teamBId;
  const canProceedPlayers =
    playersA.length >= rules.playersPerSide && playersB.length >= rules.playersPerSide;
  const canProceedToss = !!tossWinnerId;

  const onStart = async () => {
    if (!teamAId || !teamBId || !tossWinnerId) return;
    setSaving(true);
    try {
      const match = await createMatch({
        tournamentId: tournamentId ?? null,
        format,
        teamAId,
        teamBId,
      });
      await setMatchToss(match.id, tossWinnerId, tossChoice);

      // Set XIs from current rosters (max playersPerSide)
      const max = rules.playersPerSide;
      await setMatchXI(
        match.id,
        teamAId,
        playersA.slice(0, max).map((p, i) => ({
          userId: p.id,
          battingOrder: i + 1,
          isCaptain: i === 0,
          isKeeper: false,
        })),
      );
      await setMatchXI(
        match.id,
        teamBId,
        playersB.slice(0, max).map((p, i) => ({
          userId: p.id,
          battingOrder: i + 1,
          isCaptain: i === 0,
          isKeeper: false,
        })),
      );

      // Decide who bats first
      const tossLoserId = tossWinnerId === teamAId ? teamBId : teamAId;
      const battingFirst = tossChoice === 'BAT' ? tossWinnerId : tossLoserId;
      const bowlingFirst = battingFirst === teamAId ? teamBId : teamAId;

      await createInnings({
        matchId: match.id,
        sequence: 1,
        battingTeamId: battingFirst,
        bowlingTeamId: bowlingFirst,
      });
      await setMatchStatus(match.id, 'IN_PROGRESS');

      router.replace({
        pathname: '/wricket/match/[id]/score',
        params: { id: match.id },
      });
    } catch (e: any) {
      Alert.alert('Could not start match', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.md, gap: spacing.lg }}>
        <StepBadge step={step} />

        {step === 'teams' && (
          <TeamsStep
            format={format}
            setFormat={setFormat}
            teams={allTeams}
            teamAId={teamAId}
            teamBId={teamBId}
            setTeamAId={setTeamAId}
            setTeamBId={setTeamBId}
          />
        )}

        {step === 'players' && teamA && teamB && (
          <PlayersStep
            teamA={teamA}
            teamB={teamB}
            playersA={playersA}
            playersB={playersB}
            onChange={async () => {
              if (teamAId) setPlayersA(await listTeamPlayers(teamAId));
              if (teamBId) setPlayersB(await listTeamPlayers(teamBId));
            }}
            maxPerSide={rules.playersPerSide}
          />
        )}

        {step === 'toss' && teamA && teamB && (
          <TossStep
            teamA={teamA}
            teamB={teamB}
            tossWinnerId={tossWinnerId}
            setTossWinnerId={setTossWinnerId}
            tossChoice={tossChoice}
            setTossChoice={setTossChoice}
          />
        )}

        {step === 'review' && teamA && teamB && (
          <ReviewStep
            format={format}
            teamA={teamA}
            teamB={teamB}
            playersA={playersA}
            playersB={playersB}
            tossWinnerName={tossWinnerId === teamAId ? teamA.name : teamB.name}
            tossChoice={tossChoice}
          />
        )}

        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
          {step !== 'teams' && (
            <Button
              title="Back"
              variant="secondary"
              onPress={() => setStep(prevStep(step))}
              style={{ flex: 1 }}
            />
          )}
          {step !== 'review' ? (
            <Button
              title="Next"
              onPress={() => {
                if (step === 'teams' && !canProceedTeams) {
                  Alert.alert('Pick both teams', 'Choose two different teams.');
                  return;
                }
                if (step === 'players' && !canProceedPlayers) {
                  Alert.alert(
                    'Add players',
                    `Each team needs ${rules.playersPerSide} players for ${FORMAT_LABEL[format]}.`,
                  );
                  return;
                }
                if (step === 'toss' && !canProceedToss) {
                  Alert.alert('Toss missing', 'Pick the toss winner.');
                  return;
                }
                setStep(nextStep(step));
              }}
              style={{ flex: 1 }}
            />
          ) : (
            <Button title="Start match" onPress={onStart} loading={saving} style={{ flex: 1 }} />
          )}
        </View>
      </View>
    </Screen>
  );
}

function nextStep(s: Step): Step {
  return s === 'teams' ? 'players' : s === 'players' ? 'toss' : 'review';
}
function prevStep(s: Step): Step {
  return s === 'review' ? 'toss' : s === 'toss' ? 'players' : 'teams';
}

function StepBadge({ step }: { step: Step }) {
  const stepNum = { teams: 1, players: 2, toss: 3, review: 4 }[step];
  const title = { teams: 'Teams & format', players: 'Players', toss: 'Toss', review: 'Review' }[step];
  return (
    <View>
      <Text variant="overline" tone="muted">Step {stepNum} of 4</Text>
      <Text variant="h1">{title}</Text>
    </View>
  );
}

function TeamsStep({
  format, setFormat, teams, teamAId, teamBId, setTeamAId, setTeamBId,
}: {
  format: MatchFormat;
  setFormat: (f: MatchFormat) => void;
  teams: Team[];
  teamAId: string | null;
  teamBId: string | null;
  setTeamAId: (id: string) => void;
  setTeamBId: (id: string) => void;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>FORMAT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {FORMATS.map(f => (
            <Pressable
              key={f}
              onPress={() => setFormat(f)}
              style={[
                styles.chip,
                format === f && styles.chipActive,
              ]}
            >
              <Text variant="bodyStrong" style={format === f ? { color: colors.accentInk } : undefined}>
                {FORMAT_LABEL[f]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <TeamPicker label="TEAM A" teams={teams} selectedId={teamAId} excludeId={teamBId} onSelect={setTeamAId} />
      <TeamPicker label="TEAM B" teams={teams} selectedId={teamBId} excludeId={teamAId} onSelect={setTeamBId} />

      {teams.length < 2 && (
        <Text variant="caption" tone="muted">
          You need at least 2 teams. Create teams in a tournament first.
        </Text>
      )}
    </View>
  );
}

function TeamPicker({
  label, teams, selectedId, excludeId, onSelect,
}: {
  label: string;
  teams: Team[];
  selectedId: string | null;
  excludeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View>
      <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>{label}</Text>
      <View style={{ gap: spacing.sm }}>
        {teams.filter(t => t.id !== excludeId).map(t => (
          <Pressable
            key={t.id}
            onPress={() => onSelect(t.id)}
            style={[
              styles.teamRow,
              selectedId === t.id && styles.teamRowActive,
            ]}
          >
            <View style={[styles.teamSwatch, { backgroundColor: t.colorHex }]}>
              <Text variant="bodyStrong" style={{ color: palette.black }}>{t.shortName}</Text>
            </View>
            <Text variant="bodyStrong" style={{ flex: 1 }}>{t.name}</Text>
            {selectedId === t.id && (
              <MaterialCommunityIcons name="check-circle" size={22} color={colors.accent} />
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function PlayersStep({
  teamA, teamB, playersA, playersB, onChange, maxPerSide,
}: {
  teamA: Team;
  teamB: Team;
  playersA: User[];
  playersB: User[];
  onChange: () => void;
  maxPerSide: number;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      <Text variant="caption" tone="muted">
        Up to {maxPerSide} players per side. Tap a slot to add.
      </Text>
      <TeamPlayersBlock team={teamA} players={playersA} max={maxPerSide} onChange={onChange} />
      <TeamPlayersBlock team={teamB} players={playersB} max={maxPerSide} onChange={onChange} />
    </View>
  );
}

function TeamPlayersBlock({
  team, players, max, onChange,
}: {
  team: Team;
  players: User[];
  max: number;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const onAdd = async () => {
    if (name.trim().length < 2) return;
    const u = await createUser({ name: name.trim(), role: 'AR' });
    await addPlayerToTeam(team.id, u.id);
    setName('');
    setAdding(false);
    onChange();
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
        <View style={[styles.teamSwatch, { backgroundColor: team.colorHex, width: 32, height: 32 }]}>
          <Text variant="caption" style={{ color: palette.black, fontWeight: '800' }}>{team.shortName}</Text>
        </View>
        <Text variant="bodyStrong" style={{ flex: 1 }}>{team.name}</Text>
        <Text variant="caption" tone="muted">{players.length}/{max}</Text>
      </View>

      <Card>
        {players.length === 0 && !adding && (
          <Text variant="caption" tone="muted">No players yet</Text>
        )}
        {players.map((p, i) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm }}>
            <Text variant="caption" tone="muted" style={{ width: 24 }}>{i + 1}</Text>
            <Text variant="body" style={{ flex: 1 }}>{p.name}</Text>
          </View>
        ))}

        {adding ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Player name"
              placeholderTextColor={colors.textDim}
              style={[styles.input, { flex: 1 }]}
              autoFocus
              onSubmitEditing={onAdd}
            />
            <Button title="Add" onPress={onAdd} size="sm" />
          </View>
        ) : (
          players.length < max && (
            <Pressable onPress={() => setAdding(true)} style={styles.addRow}>
              <MaterialCommunityIcons name="plus" size={18} color={colors.accent} />
              <Text variant="bodyStrong" tone="accent">Add player</Text>
            </Pressable>
          )
        )}
      </Card>
    </View>
  );
}

function TossStep({
  teamA, teamB, tossWinnerId, setTossWinnerId, tossChoice, setTossChoice,
}: {
  teamA: Team;
  teamB: Team;
  tossWinnerId: string | null;
  setTossWinnerId: (id: string) => void;
  tossChoice: TossChoice;
  setTossChoice: (c: TossChoice) => void;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>WHO WON THE TOSS?</Text>
        {[teamA, teamB].map(t => (
          <Pressable
            key={t.id}
            onPress={() => setTossWinnerId(t.id)}
            style={[
              styles.teamRow,
              { marginBottom: spacing.sm },
              tossWinnerId === t.id && styles.teamRowActive,
            ]}
          >
            <View style={[styles.teamSwatch, { backgroundColor: t.colorHex }]}>
              <Text variant="bodyStrong" style={{ color: palette.black }}>{t.shortName}</Text>
            </View>
            <Text variant="bodyStrong" style={{ flex: 1 }}>{t.name}</Text>
            {tossWinnerId === t.id && (
              <MaterialCommunityIcons name="check-circle" size={22} color={colors.accent} />
            )}
          </Pressable>
        ))}
      </View>

      <View>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>CHOSE TO</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={() => setTossChoice('BAT')}
            style={[styles.bigChoice, tossChoice === 'BAT' && styles.bigChoiceActive]}
          >
            <MaterialCommunityIcons name="cricket" size={32} color={tossChoice === 'BAT' ? colors.accentInk : colors.text} />
            <Text variant="bodyStrong" style={tossChoice === 'BAT' ? { color: colors.accentInk, marginTop: spacing.sm } : { marginTop: spacing.sm }}>Bat</Text>
          </Pressable>
          <Pressable
            onPress={() => setTossChoice('BOWL')}
            style={[styles.bigChoice, tossChoice === 'BOWL' && styles.bigChoiceActive]}
          >
            <MaterialCommunityIcons name="bullseye" size={32} color={tossChoice === 'BOWL' ? colors.accentInk : colors.text} />
            <Text variant="bodyStrong" style={tossChoice === 'BOWL' ? { color: colors.accentInk, marginTop: spacing.sm } : { marginTop: spacing.sm }}>Bowl</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ReviewStep({
  format, teamA, teamB, playersA, playersB, tossWinnerName, tossChoice,
}: {
  format: MatchFormat;
  teamA: Team;
  teamB: Team;
  playersA: User[];
  playersB: User[];
  tossWinnerName: string;
  tossChoice: TossChoice;
}) {
  const r = DEFAULT_RULES[format];
  return (
    <View style={{ gap: spacing.md }}>
      <Card>
        <Text variant="caption" tone="muted">FORMAT</Text>
        <Text variant="h3" style={{ marginTop: 4 }}>{FORMAT_LABEL[format]}</Text>
        <Text variant="caption" tone="dim" style={{ marginTop: 4 }}>
          {r.oversPerInnings} overs · {r.inningsPerTeam} innings · {r.playersPerSide}-a-side
          {r.followOnEnabled ? ` · follow-on @ ${r.followOnThreshold}` : ''}
        </Text>
      </Card>

      <Card>
        <Text variant="caption" tone="muted">MATCH</Text>
        <Text variant="h3" style={{ marginTop: 4 }}>{teamA.name} vs {teamB.name}</Text>
        <Text variant="caption" tone="dim" style={{ marginTop: 4 }}>
          {playersA.length} vs {playersB.length} players
        </Text>
      </Card>

      <Card>
        <Text variant="caption" tone="muted">TOSS</Text>
        <Text variant="h3" style={{ marginTop: 4 }}>
          {tossWinnerName} chose to {tossChoice === 'BAT' ? 'bat' : 'bowl'}
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  teamRowActive: {
    borderColor: colors.accent,
  },
  teamSwatch: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  addRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  bigChoice: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  bigChoiceActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
