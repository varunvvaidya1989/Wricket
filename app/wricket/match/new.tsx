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
import { Team, User, MatchFormat, FORMAT_LABEL, DEFAULT_RULES, TossChoice, FormatRules } from '@/lib/wricket/domain/types';
import { followOnThresholdForOvers } from '@/lib/wricket/domain/test-match';
import { matchSetupApi } from '@/lib/supabase/matchSetupApi';
import { teamManagementApi } from '@/lib/supabase/teamManagementApi';
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
  const [selectedAIds, setSelectedAIds] = useState<string[]>([]);
  const [selectedBIds, setSelectedBIds] = useState<string[]>([]);
  const [matchCaptainAId, setMatchCaptainAId] = useState<string>();
  const [matchCaptainBId, setMatchCaptainBId] = useState<string>();
  const [captainCloudIdA, setCaptainCloudIdA] = useState<string>();
  const [captainCloudIdB, setCaptainCloudIdB] = useState<string>();
  const [oversInput, setOversInput] = useState(String(DEFAULT_RULES[format].oversPerInnings));
  const [playingCountInput, setPlayingCountInput] = useState(String(Math.min(11, DEFAULT_RULES[format].playersPerSide)));
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
  const teamA = allTeams.find(t => t.id === teamAId);
  const teamB = allTeams.find(t => t.id === teamBId);

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
        setOversInput(String(tournament.oversPerMatch));
        setPlayingCountInput(String(Math.min(11, tournament.playersPerTeam)));
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

  useEffect(() => {
    const loadEligibility = async () => {
      if (!teamA?.cloudId || !teamB?.cloudId) return;
      const [rosterA, rosterB] = await Promise.all([
        teamManagementApi.listRoster(teamA.cloudId),
        teamManagementApi.listRoster(teamB.cloudId),
      ]);
      setCaptainCloudIdA(rosterA.find(member => member.role === 'CAPTAIN')?.playerId);
      setCaptainCloudIdB(rosterB.find(member => member.role === 'CAPTAIN')?.playerId);
    };
    void loadEligibility().catch(cause => Alert.alert('Could not load roster roles', cause instanceof Error ? cause.message : 'Please try again.'));
  }, [teamA?.cloudId, teamB?.cloudId]);

  const playingCount = Number(playingCountInput);
  const oversPerInnings = Number(oversInput);
  const rules = {
    ...DEFAULT_RULES[format],
    playersPerSide: Number.isInteger(playingCount) ? playingCount : 0,
    oversPerInnings: Number.isInteger(oversPerInnings) ? oversPerInnings : 0,
    followOnThreshold: format === 'TURF_TEST'
      ? followOnThresholdForOvers(oversPerInnings)
      : DEFAULT_RULES[format].followOnThreshold,
  };

  const canProceedTeams = teamAId && teamBId && teamAId !== teamBId;
  const canProceedPlayers = rules.playersPerSide > 0 && rules.playersPerSide <= 11
    && rules.playersPerSide <= playersA.length && rules.playersPerSide <= playersB.length
    && rules.oversPerInnings > 0 && rules.oversPerInnings <= 100
    && selectedAIds.length === rules.playersPerSide && selectedBIds.length === rules.playersPerSide
    && Boolean(matchCaptainAId && selectedAIds.includes(matchCaptainAId))
    && Boolean(matchCaptainBId && selectedBIds.includes(matchCaptainBId));
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
      const selectedPlayersA = selectedAIds.map(id => playersA.find(player => player.id === id)).filter(Boolean) as User[];
      const selectedPlayersB = selectedBIds.map(id => playersB.find(player => player.id === id)).filter(Boolean) as User[];
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
          rules,
          scheduledAt,
          venue,
        });
      }
      await matchSetupApi.updateMatchDetails(cloudMatchId, { scheduledAt, venue, rules });
      const cloudTossWinnerId = tossWinnerId === teamAId ? teamA.cloudId : teamB.cloudId;
      const cloudSetup = await matchSetupApi.startMatch({
        matchId: cloudMatchId,
        teamAXI: selectedPlayersA.map((player, index) => ({
          playerId: player.cloudId!,
          battingOrder: index + 1,
          isCaptain: player.id === matchCaptainAId,
          isKeeper: false,
        })),
        teamBXI: selectedPlayersB.map((player, index) => ({
          playerId: player.cloudId!,
          battingOrder: index + 1,
          isCaptain: player.id === matchCaptainBId,
          isKeeper: false,
        })),
        tossWinnerTeamId: cloudTossWinnerId,
        tossChoice,
      });

      const match = await createMatch({
        id: cloudMatchId,
        tournamentId: tournamentId ?? null,
        format,
        rules,
        teamAId,
        teamBId,
        venue: venue.trim() || undefined,
        scheduledAt: scheduledTimestamp,
      });
      await setMatchToss(match.id, tossWinnerId, tossChoice);

      await setMatchXI(
        match.id,
        teamAId,
        selectedPlayersA.map((p, i) => ({
          userId: p.id,
          battingOrder: i + 1,
          isCaptain: p.id === matchCaptainAId,
          isKeeper: false,
        })),
      );
      await setMatchXI(
        match.id,
        teamBId,
        selectedPlayersB.map((p, i) => ({
          userId: p.id,
          battingOrder: i + 1,
          isCaptain: p.id === matchCaptainBId,
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
            oversInput={oversInput}
            setOversInput={setOversInput}
            playingCountInput={playingCountInput}
            setPlayingCountInput={setPlayingCountInput}
            selectedAIds={selectedAIds}
            selectedBIds={selectedBIds}
            setSelectedAIds={setSelectedAIds}
            setSelectedBIds={setSelectedBIds}
            captainCloudIdA={captainCloudIdA}
            captainCloudIdB={captainCloudIdB}
            matchCaptainAId={matchCaptainAId}
            matchCaptainBId={matchCaptainBId}
            setMatchCaptainAId={setMatchCaptainAId}
            setMatchCaptainBId={setMatchCaptainBId}
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
            playersA={selectedAIds.map(id => playersA.find(player => player.id === id)).filter(Boolean) as User[]}
            playersB={selectedBIds.map(id => playersB.find(player => player.id === id)).filter(Boolean) as User[]}
            rules={rules}
            tossWinnerName={tossWinnerId === teamAId ? teamA.name : teamB.name}
            tossChoice={tossChoice}
            venue={venue}
            scheduledAt={scheduledAt}
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
                    'Playing XI incomplete',
                    `Select exactly ${rules.playersPerSide} players and one match captain for each team.`,
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
  const title = { teams: 'Teams & format', players: 'Match rules & Playing XI', toss: 'Toss', review: 'Review' }[step];
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
        {teams.map(t => {
          const locked = t.id === excludeId;
          return (
          <Pressable
            key={t.id}
            disabled={locked}
            onPress={() => onSelect(t.id)}
            style={[
              styles.teamRow,
              selectedId === t.id && styles.teamRowActive,
              locked && styles.teamRowLocked,
            ]}
          >
            <View style={[styles.teamSwatch, { backgroundColor: t.colorHex }]}>
              <Text variant="bodyStrong" style={{ color: palette.black }}>{t.shortName}</Text>
            </View>
            <Text variant="bodyStrong" style={{ flex: 1 }}>{t.name}</Text>
            {locked ? <Text variant="caption" tone="dim">OTHER TEAM</Text> : selectedId === t.id && (
              <MaterialCommunityIcons name="check-circle" size={22} color={colors.accent} />
            )}
          </Pressable>
        );})}
      </View>
    </View>
  );
}

function PlayersStep({
  teamA, teamB, playersA, playersB, maxPerSide, oversInput, setOversInput,
  playingCountInput, setPlayingCountInput, selectedAIds, selectedBIds,
  setSelectedAIds, setSelectedBIds,
  captainCloudIdA, captainCloudIdB,
  matchCaptainAId, matchCaptainBId, setMatchCaptainAId, setMatchCaptainBId,
}: {
  teamA: Team; teamB: Team; playersA: User[]; playersB: User[]; onChange: () => void;
  maxPerSide: number; oversInput: string; setOversInput: (value: string) => void;
  playingCountInput: string; setPlayingCountInput: (value: string) => void;
  selectedAIds: string[]; selectedBIds: string[];
  setSelectedAIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedBIds: React.Dispatch<React.SetStateAction<string[]>>;
  captainCloudIdA?: string; captainCloudIdB?: string;
  matchCaptainAId?: string; matchCaptainBId?: string;
  setMatchCaptainAId: (value?: string) => void; setMatchCaptainBId: (value?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filter = (players: User[]) => players.filter(player => player.name.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    setSelectedAIds(current => fitPlayingSelection(current, playersA, maxPerSide, captainCloudIdA));
    setSelectedBIds(current => fitPlayingSelection(current, playersB, maxPerSide, captainCloudIdB));
  }, [captainCloudIdA, captainCloudIdB, maxPerSide, playersA, playersB, setSelectedAIds, setSelectedBIds]);
  useEffect(() => {
    const squadCaptainA = playersA.find(player => player.cloudId === captainCloudIdA);
    const squadCaptainB = playersB.find(player => player.cloudId === captainCloudIdB);
    if (!matchCaptainAId && squadCaptainA && selectedAIds.includes(squadCaptainA.id)) setMatchCaptainAId(squadCaptainA.id);
    if (!matchCaptainBId && squadCaptainB && selectedBIds.includes(squadCaptainB.id)) setMatchCaptainBId(squadCaptainB.id);
  }, [captainCloudIdA, captainCloudIdB, matchCaptainAId, matchCaptainBId, playersA, playersB, selectedAIds, selectedBIds, setMatchCaptainAId, setMatchCaptainBId]);
  useEffect(() => {
    if (matchCaptainAId && !selectedAIds.includes(matchCaptainAId)) setMatchCaptainAId(undefined);
    if (matchCaptainBId && !selectedBIds.includes(matchCaptainBId)) setMatchCaptainBId(undefined);
  }, [matchCaptainAId, matchCaptainBId, selectedAIds, selectedBIds, setMatchCaptainAId, setMatchCaptainBId]);
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={styles.rulesCard}>
        <Text variant="h3">Match rules</Text>
        <Text variant="caption" tone="muted">These values apply to this match only.</Text>
        <View style={styles.ruleInputs}>
          <View style={{ flex: 1 }}><Text variant="caption" tone="muted">OVERS</Text><TextInput value={oversInput} onChangeText={setOversInput} keyboardType="number-pad" style={styles.input} /></View>
          <View style={{ flex: 1 }}><Text variant="caption" tone="muted">PLAYERS PER SIDE</Text><TextInput value={playingCountInput} onChangeText={setPlayingCountInput} keyboardType="number-pad" style={styles.input} /></View>
        </View>
      </Card>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search players…" placeholderTextColor={colors.textDim} style={styles.searchInput} />
      <Text variant="caption" tone="muted">Select the Playing XI and one match captain for each team.</Text>
      <TeamPlayersBlock team={teamA} players={filter(playersA)} selectedIds={selectedAIds} max={maxPerSide} setSelectedIds={setSelectedAIds} captainId={matchCaptainAId} setCaptainId={setMatchCaptainAId} />
      <TeamPlayersBlock team={teamB} players={filter(playersB)} selectedIds={selectedBIds} max={maxPerSide} setSelectedIds={setSelectedBIds} captainId={matchCaptainBId} setCaptainId={setMatchCaptainBId} />
    </View>
  );
}

function TeamPlayersBlock({
  team, players, selectedIds, max, setSelectedIds, captainId, setCaptainId,
}: {
  team: Team; players: User[]; selectedIds: string[]; max: number;
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  captainId?: string; setCaptainId: (value?: string) => void;
}) {
  const router = useRouter();
  const togglePlayer = (player: User) => setSelectedIds(current => {
    if (current.includes(player.id)) {
      if (captainId === player.id) {
        setCaptainId(undefined);
        Alert.alert('Select a new match captain', `${player.name} was removed from the Playing XI. Choose another selected player as captain.`);
      }
      return current.filter(id => id !== player.id);
    }
    if (current.length >= max) return current;
    return [...current, player.id];
  });

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
        <View style={[styles.teamSwatch, { backgroundColor: team.colorHex, width: 32, height: 32 }]}>
          <Text variant="caption" style={{ color: palette.black, fontWeight: '800' }}>{team.shortName}</Text>
        </View>
        <Text variant="bodyStrong" style={{ flex: 1 }}>{team.name}</Text>
        <Text variant="caption" tone={selectedIds.length === max ? 'accent' : 'muted'}>{selectedIds.length}/{max} selected</Text>
      </View>

      <Card>
        {players.length === 0 && (
          <Text variant="caption" tone="muted">No signed-in players have joined this team yet.</Text>
        )}
        {players.map((p, i) => {
          const selected = selectedIds.includes(p.id);
          return <Pressable key={p.id} onPress={() => togglePlayer(p)} style={[styles.xiPlayerRow, selected && styles.xiPlayerRowSelected]}>
            <Text variant="caption" tone="muted" style={{ width: 24 }}>{i + 1}</Text>
            <MaterialCommunityIcons name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={21} color={selected ? colors.accent : colors.textDim} />
            <Text variant="body" style={{ flex: 1 }}>{p.name}</Text>
            {selected ? <Pressable onPress={event => { event.stopPropagation(); setCaptainId(p.id); }} style={[styles.captainChip, captainId === p.id && styles.captainChipActive]}>
              <MaterialCommunityIcons name="account-star" size={16} color={captainId === p.id ? colors.accentInk : colors.textMuted} />
              <Text variant="caption" style={{ color: captainId === p.id ? colors.accentInk : colors.textMuted }}>{captainId === p.id ? 'CAPTAIN' : 'C'}</Text>
            </Pressable> : null}
          </Pressable>;
        })}

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

function fitPlayingSelection(current: string[], players: User[], count: number, captainCloudId?: string): string[] {
  if (!Number.isInteger(count) || count < 1) return [];
  const available = new Set(players.map(player => player.id));
  const captain = players.find(player => player.cloudId === captainCloudId);
  const kept = current.filter(id => available.has(id)).slice(0, count);
  if (captain && !kept.includes(captain.id)) {
    if (kept.length === count) kept.pop();
    kept.unshift(captain.id);
  }
  const remaining = players.filter(player => !kept.includes(player.id)).slice(0, count - kept.length);
  return [...kept, ...remaining.map(player => player.id)];
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
  format, teamA, teamB, playersA, playersB, rules, tossWinnerName, tossChoice, venue, scheduledAt,
}: {
  format: MatchFormat;
  teamA: Team;
  teamB: Team;
  playersA: User[];
  playersB: User[];
  rules: FormatRules;
  tossWinnerName: string;
  tossChoice: TossChoice;
  venue: string;
  scheduledAt: string;
}) {
  const r = rules;
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
        <Text variant="caption" tone="muted">WHEN & WHERE</Text>
        <Text variant="h3" style={{ marginTop: 4 }}>{new Date(scheduledAt).toLocaleString()}</Text>
        <Text variant="caption" tone="dim" style={{ marginTop: 4 }}>{venue.trim() || 'Venue not set'}</Text>
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
  searchInput: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 15 },
  rulesCard: { gap: spacing.sm },
  ruleInputs: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  xiPlayerRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  xiPlayerRowSelected: { backgroundColor: colors.surfaceElevated },
  captainChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  captainChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  teamRowLocked: { opacity: 0.4 },
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
