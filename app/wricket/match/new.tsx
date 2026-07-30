import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
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
  getTournament,
  createMatch,
  setMatchToss,
  setMatchXI,
  createInnings,
  setMatchStatus,
} from '@/lib/wricket/db/repo';
import { Team, User, MatchFormat, FORMAT_LABEL, DEFAULT_RULES, TossChoice } from '@/lib/wricket/domain/types';
import { matchSetupApi } from '@/lib/supabase/matchSetupApi';
import { fixturesApi } from '@/lib/supabase/fixturesApi';
import { googleStaticMapUrl } from '@/lib/maps/googlePlaces';
import { VirtualCoinToss } from '@/components/sports/VirtualCoinToss';

type Step = 'teams' | 'players' | 'toss' | 'review';

const FORMATS: MatchFormat[] = ['BOX', 'TURF', 'TURF_TEST', 'T20', 'T10', 'ODI'];

export default function NewMatchScreen() {
  const router = useRouter();
  const {
    tournamentId,
    teamAId: initialTeamAId,
    teamBId: initialTeamBId,
    canonicalMatchId,
    editFixtureId,
    format: initialFormat,
    scheduledAt: initialScheduledAt,
  } =
    useLocalSearchParams<{
      tournamentId?: string;
      teamAId?: string;
      teamBId?: string;
      canonicalMatchId?: string;
      format?: MatchFormat;
      editFixtureId?: string;
      scheduledAt?: string;
    }>();

  const [step, setStep] = useState<Step>('teams');
  const [format, setFormat] = useState<MatchFormat>(
    initialFormat && FORMATS.includes(initialFormat) ? initialFormat : 'TURF',
  );
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [teamAId, setTeamAId] = useState<string | null>(initialTeamAId ?? null);
  const [teamBId, setTeamBId] = useState<string | null>(initialTeamBId ?? null);
  const [playersA, setPlayersA] = useState<User[]>([]);
  const [playersB, setPlayersB] = useState<User[]>([]);
  const [tossWinnerId, setTossWinnerId] = useState<string | null>(null);
  const [tossChoice, setTossChoice] = useState<TossChoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [venue, setVenue] = useState('');
  const [scheduledAt, setScheduledAt] = useState(
    initialScheduledAt && Number.isFinite(Date.parse(initialScheduledAt))
      ? new Date(initialScheduledAt).toISOString()
      : new Date().toISOString(),
  );
  const [isTournamentMatch, setIsTournamentMatch] = useState(Boolean(tournamentId));
  const [selectedTournament, setSelectedTournament] = useState<Awaited<ReturnType<typeof getTournament>>>(null);

  useEffect(() => {
    (async () => {
      const [teamList, tournament] = await Promise.all([
        listTeams(tournamentId ?? null),
        tournamentId ? getTournament(tournamentId) : Promise.resolve(null),
      ]);
      setAllTeams(teamList);
      if (tournament) {
        setSelectedTournament(tournament);
        setFormat(tournament.format);
        // Tournament fixtures always inherit the canonical tournament venue.
        setVenue(tournament.location ?? '');
        setIsTournamentMatch(true);
      }
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
  const canProceedToss = !!tossWinnerId && !!tossChoice;

  const onStart = async () => {
    if (!teamAId || !teamBId || !tossWinnerId || !tossChoice || !teamA || !teamB) return;
    const scheduledTimestamp = Date.parse(scheduledAt);
    if (!Number.isFinite(scheduledTimestamp)) {
      Alert.alert('Invalid date and time', 'Enter a valid ISO date and time.');
      return;
    }
    setSaving(true);
    try {
      if (!teamA.cloudId || !teamB.cloudId) {
        throw new Error('Both teams must be available online before starting the match');
      }
      const selectedPlayersA = playersA.slice(0, rules.playersPerSide);
      const selectedPlayersB = playersB.slice(0, rules.playersPerSide);
      if (selectedPlayersA.some(player => !player.cloudId) || selectedPlayersB.some(player => !player.cloudId)) {
        throw new Error('Every selected player must be available online before starting the match');
      }
      let cloudMatchId = canonicalMatchId;
      if (!cloudMatchId) {
        if (!tournamentId) throw new Error('Online match creation requires a tournament');
        const tournament = await getTournament(tournamentId);
        if (!tournament?.cloudId) throw new Error('Tournament is not available online');
        cloudMatchId = await matchSetupApi.createMatch({
          tournamentId: tournament.cloudId,
          teamAId: teamA.cloudId,
          teamBId: teamB.cloudId,
          format,
          scheduledAt,
          venue,
        });
      }
      await matchSetupApi.updateMatchDetails(cloudMatchId, { scheduledAt, venue });
      const cloudTossWinnerId = tossWinnerId === teamAId ? teamA.cloudId : teamB.cloudId;
      const cloudSetup = await matchSetupApi.startMatch({
        matchId: cloudMatchId,
        teamAXI: selectedPlayersA.map((player, index) => ({
          playerId: player.cloudId!,
          battingOrder: index + 1,
          isCaptain: index === 0,
          isKeeper: false,
        })),
        teamBXI: selectedPlayersB.map((player, index) => ({
          playerId: player.cloudId!,
          battingOrder: index + 1,
          isCaptain: index === 0,
          isKeeper: false,
        })),
        tossWinnerTeamId: cloudTossWinnerId,
        tossChoice,
      });

      const match = await createMatch({
        id: cloudMatchId,
        tournamentId: tournamentId ?? null,
        format,
        teamAId,
        teamBId,
        venue: venue.trim() || undefined,
        scheduledAt: scheduledTimestamp,
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
        id: cloudSetup.inningsId,
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

  const onSaveFixture = async () => {
    if (!editFixtureId || !canonicalMatchId || !teamA || !teamB || !teamA.cloudId || !teamB.cloudId) return;
    if (teamA.id === teamB.id) {
      Alert.alert('Pick both teams', 'Choose two different teams.');
      return;
    }
    if (!Number.isFinite(Date.parse(scheduledAt))) {
      Alert.alert('Invalid date and time', 'Enter a valid ISO date and time.');
      return;
    }
    setSaving(true);
    try {
      await fixturesApi.updateMatchById({
        fixtureMatchId: editFixtureId,
        canonicalMatchId,
        teamAId: teamA.cloudId,
        teamBId: teamB.cloudId,
        scheduledAt,
        venue,
      });
      router.back();
    } catch (cause) {
      Alert.alert('Could not update fixture', cause instanceof Error ? cause.message : 'Please try again.');
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
            lockFormat={isTournamentMatch}
            venue={venue}
            scheduledAt={scheduledAt}
            setVenue={setVenue}
            setScheduledAt={setScheduledAt}
            tournament={selectedTournament}
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

        {step === 'review' && teamA && teamB && tossChoice && (
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
          {step === 'teams' && editFixtureId ? (
            <Button title="Save fixture" onPress={onSaveFixture} loading={saving} style={{ flex: 1 }} />
          ) : step !== 'review' ? (
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
                  Alert.alert(
                    'Toss incomplete',
                    'Flip the coin, then let the winner choose to bat or field first.',
                  );
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
  lockFormat, venue, scheduledAt, setVenue, setScheduledAt, tournament,
}: {
  format: MatchFormat;
  setFormat: (f: MatchFormat) => void;
  teams: Team[];
  teamAId: string | null;
  teamBId: string | null;
  setTeamAId: (id: string) => void;
  setTeamBId: (id: string) => void;
  lockFormat: boolean;
  venue: string;
  scheduledAt: string;
  setVenue: (value: string) => void;
  setScheduledAt: (value: string) => void;
  tournament: Awaited<ReturnType<typeof getTournament>>;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>FORMAT</Text>
        {lockFormat ? (
          <Card>
            <Text variant="bodyStrong">{FORMAT_LABEL[format]}</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
              Inherited from tournament
            </Text>
          </Card>
        ) : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
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
        </ScrollView>}
      </View>

      <View>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>DATE & TIME</Text>
        <MatchDateTimePicker value={scheduledAt} onChange={setScheduledAt} />
      </View>
      <View>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>LOCATION</Text>
        {tournament ? (
          <Card>
            <View style={styles.venueRow}>
              <MaterialCommunityIcons name="map-marker" size={22} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{venue || 'Tournament venue not set'}</Text>
                <Text variant="caption" tone="muted">Inherited from tournament</Text>
              </View>
            </View>
            {tournament.latitude != null && tournament.longitude != null &&
              googleStaticMapUrl(tournament.latitude, tournament.longitude) && (
                <Image
                  source={{ uri: googleStaticMapUrl(tournament.latitude, tournament.longitude)! }}
                  style={styles.venueMap}
                />
              )}
          </Card>
        ) : (
          <TextInput
            value={venue}
            onChangeText={setVenue}
            placeholder="Ground or venue"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
        )}
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

function MatchDateTimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const date = Number.isFinite(Date.parse(value)) ? new Date(value) : new Date();
  const [mode, setMode] = useState<'date' | 'time'>();
  const update = (next?: Date) => {
    if (Platform.OS !== 'ios') setMode(undefined);
    if (next) onChange(next.toISOString());
  };
  if (Platform.OS === 'web') {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString().slice(0, 16);
    return (
      <TextInput
        value={local}
        onChangeText={text => {
          const next = new Date(text);
          if (Number.isFinite(next.getTime())) onChange(next.toISOString());
        }}
        style={styles.input}
        // React Native Web forwards this to the HTML input.
        {...({ type: 'datetime-local' } as object)}
      />
    );
  }
  return (
    <View>
      <View style={styles.dateTimeRow}>
        <Pressable style={styles.dateTimeButton} onPress={() => setMode('date')}>
          <MaterialCommunityIcons name="calendar" size={20} color={colors.accent} />
          <Text variant="bodyStrong">{date.toLocaleDateString()}</Text>
        </Pressable>
        <Pressable style={styles.dateTimeButton} onPress={() => setMode('time')}>
          <MaterialCommunityIcons name="clock-outline" size={20} color={colors.accent} />
          <Text variant="bodyStrong">{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </Pressable>
      </View>
      {mode && (
        <DateTimePicker
          value={date}
          mode={mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, next) => update(next)}
        />
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
  team, players, max,
}: {
  team: Team;
  players: User[];
  max: number;
  onChange: () => void;
}) {
  const router = useRouter();

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
        {players.length === 0 && (
          <Text variant="caption" tone="muted">No signed-in players have joined this team yet.</Text>
        )}
        {players.map((p, i) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm }}>
            <Text variant="caption" tone="muted" style={{ width: 24 }}>{i + 1}</Text>
            <Text variant="body" style={{ flex: 1 }}>{p.name}</Text>
          </View>
        ))}

        {team.cloudId && players.length < max && (
          <Pressable
            onPress={() => router.push({ pathname: '/wricket/team/[id]', params: { id: team.cloudId! } })}
            style={styles.addRow}
          >
            <MaterialCommunityIcons name="account-multiple-plus-outline" size={18} color={colors.accent} />
            <Text variant="bodyStrong" tone="accent">Open team invitations</Text>
          </Pressable>
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
  setTossWinnerId: (id: string | null) => void;
  tossChoice: TossChoice | null;
  setTossChoice: (c: TossChoice | null) => void;
}) {
  const [mode, setMode] = useState<'VIRTUAL' | 'MANUAL'>('VIRTUAL');
  const winner = tossWinnerId === teamA.id ? teamA : tossWinnerId === teamB.id ? teamB : null;

  const switchMode = (next: 'VIRTUAL' | 'MANUAL') => {
    if (next === mode) return;
    setMode(next);
    setTossWinnerId(null);
    setTossChoice(null);
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.tossModeToggle}>
        <TossModeTab
          icon="rotate-3d-variant"
          label="Virtual coin"
          active={mode === 'VIRTUAL'}
          onPress={() => switchMode('VIRTUAL')}
        />
        <TossModeTab
          icon="hand-coin-outline"
          label="Manual entry"
          active={mode === 'MANUAL'}
          onPress={() => switchMode('MANUAL')}
        />
      </View>

      {mode === 'VIRTUAL' ? (
        <VirtualCoinToss
          participants={[
            { id: teamA.id, name: teamA.name, shortName: teamA.shortName, color: teamA.colorHex },
            { id: teamB.id, name: teamB.name, shortName: teamB.shortName, color: teamB.colorHex },
          ]}
          onResult={result => {
            setTossWinnerId(result.winnerId);
            setTossChoice(null);
          }}
          onReset={() => {
            setTossWinnerId(null);
            setTossChoice(null);
          }}
        />
      ) : (
        <Card>
          <Text variant="h3">Real coin, real toss</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs, marginBottom: spacing.md }}>
            The toss happened on the field — record which team won it.
          </Text>
          <View style={{ gap: spacing.sm }}>
            {[teamA, teamB].map(team => {
              const selected = tossWinnerId === team.id;
              return (
                <Pressable
                  key={team.id}
                  onPress={() => {
                    setTossWinnerId(team.id);
                    setTossChoice(null);
                  }}
                  style={[styles.teamRow, selected && styles.teamRowActive]}
                >
                  <View style={[styles.teamSwatch, { backgroundColor: team.colorHex }]}>
                    <Text variant="bodyStrong" style={{ color: palette.black }}>{team.shortName}</Text>
                  </View>
                  <Text variant="bodyStrong" style={{ flex: 1 }}>{team.name}</Text>
                  {selected && (
                    <MaterialCommunityIcons name="trophy" size={22} color={colors.accent} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      {winner ? (
        <View>
          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
            {winner.name.toUpperCase()} CHOOSES TO
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TossDecision
              icon="cricket"
              title="Bat first"
              subtitle="Set the target"
              selected={tossChoice === 'BAT'}
              onPress={() => setTossChoice('BAT')}
            />
            <TossDecision
              icon="bullseye"
              title="Field first"
              subtitle="Chase it down"
              selected={tossChoice === 'BOWL'}
              onPress={() => setTossChoice('BOWL')}
            />
          </View>
        </View>
      ) : (
        <Text variant="caption" tone="dim" style={{ textAlign: 'center' }}>
          {mode === 'VIRTUAL'
            ? 'Flip the coin — the winning team then chooses to bat or field first.'
            : 'Pick the toss winner — they then choose to bat or field first.'}
        </Text>
      )}
    </View>
  );
}

function TossModeTab({
  icon, label, active, onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tossModeTab, active && styles.tossModeTabActive]}>
      <MaterialCommunityIcons name={icon} size={18} color={active ? colors.accentInk : colors.textMuted} />
      <Text variant="bodyStrong" style={{ color: active ? colors.accentInk : colors.textMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function TossDecision({
  icon, title, subtitle, selected, onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.bigChoice, selected && styles.bigChoiceActive]}>
      <MaterialCommunityIcons name={icon} size={32} color={selected ? colors.accentInk : colors.text} />
      <Text variant="bodyStrong" style={{ marginTop: spacing.sm, color: selected ? colors.accentInk : colors.text }}>
        {title}
      </Text>
      <Text variant="caption" style={{ marginTop: 2, color: selected ? colors.accentInk : colors.textMuted }}>
        {subtitle}
      </Text>
    </Pressable>
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
  dateTimeRow: { flexDirection: 'row', gap: spacing.sm },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  venueMap: { width: '100%', height: 120, borderRadius: radius.md, marginTop: spacing.md },
  tossModeToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tossModeTab: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
  },
  tossModeTabActive: {
    backgroundColor: colors.accent,
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
