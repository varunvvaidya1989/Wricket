import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/wricket/ui/Text';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { useAuth } from '@/components/providers/AuthProvider';
import { colors, palette } from '@/lib/wricket/presentation/design';
import { spacing, radius } from '@/lib/theme/spacing';
import {
  listTeams,
  listTeamPlayers,
  getTournament,
  getTournamentByCloudId,
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
import { fixturesApi, type GeneratedFixtureSetup } from '@/lib/supabase/fixturesApi';
import { googleStaticMapUrl } from '@/lib/maps/googlePlaces';
import { CricketToss } from '@/components/wricket/setup/CricketToss';
import { initialToss, tossReducer } from '@/lib/wricket/presentation/tossState';
import { syncTournamentData } from '@/lib/wricket/sync/tournamentSync';
import { newUuid } from '@/lib/wricket/db/ids';
import {
  clearMatchSetupDraft,
  loadMatchSetupDraft,
  matchSetupDraftKey,
  saveMatchSetupDraft,
} from '@/lib/wricket/setup/matchSetupDraft';

type Step = 'teams' | 'players' | 'toss' | 'review';
type TournamentMatchType = 'RANDOM' | 'GROUP' | 'KNOCKOUT';

const FORMATS: MatchFormat[] = ['BOX', 'TURF', 'TURF_TEST', 'T20', 'T10', 'ODI'];

export default function NewMatchScreen() {
  const router = useRouter();
  const auth = useAuth();
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
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [teamReasons, setTeamReasons] = useState<Record<string, 'MY_TEAM' | 'PLAYED_AGAINST'>>({});
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
  const [toss, dispatchToss] = useReducer(tossReducer, initialToss);
  const { winnerId: tossWinnerId, choice: tossChoice } = toss;
  const previousParticipants = useRef(':');
  useEffect(() => {
    const participants = `${teamAId ?? ''}:${teamBId ?? ''}`;
    if (previousParticipants.current !== ':' && previousParticipants.current !== participants) {
      dispatchToss({ type: 'participantsChanged' });
    }
    previousParticipants.current = participants;
  }, [teamAId, teamBId]);
  const [setupRequestId, setSetupRequestId] = useState(newUuid);
  const [createdCloudMatchId, setCreatedCloudMatchId] = useState<string>();
  const [createdFingerprint, setCreatedFingerprint] = useState<string>();
  const [draftReady, setDraftReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveGate = useRef(false);
  const [setupError, setSetupError] = useState<{ title: string; detail: string }>();
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const showSetupError = useCallback((title: string, detail: string) => setSetupError({ title, detail }), []);
  const [venue, setVenue] = useState('');
  const [scheduledAt, setScheduledAt] = useState(
    initialScheduledAt && Number.isFinite(Date.parse(initialScheduledAt))
      ? new Date(initialScheduledAt).toISOString()
      : new Date().toISOString(),
  );
  const [isTournamentMatch, setIsTournamentMatch] = useState(Boolean(tournamentId));
  const [selectedTournament, setSelectedTournament] = useState<Awaited<ReturnType<typeof getTournament>>>(null);
  const [fixtureSetup, setFixtureSetup] = useState<GeneratedFixtureSetup>();
  const [tournamentMatchType, setTournamentMatchType] = useState<TournamentMatchType>('RANDOM');
  const [linkedGroupId, setLinkedGroupId] = useState('');
  const [linkedRound, setLinkedRound] = useState('1');
  const [knockoutRoundName, setKnockoutRoundName] = useState('QF');
  const teamA = allTeams.find(t => t.id === teamAId);
  const teamB = allTeams.find(t => t.id === teamBId);
  const manualGroupStage = fixtureSetup?.stages.find(stage => stage.type === 'GROUP' && stage.config?.manual);
  const manualKnockoutStage = fixtureSetup?.stages.find(stage => stage.type === 'KNOCKOUT' && stage.config?.manual);
  const linkedGroup = fixtureSetup?.groups.find(group => group.id === linkedGroupId && group.stage_id === manualGroupStage?.id);
  const selectableTeams = tournamentMatchType === 'GROUP' && linkedGroup
    ? allTeams.filter(team => team.cloudId && linkedGroup.team_ids.includes(team.cloudId))
    : allTeams;
  const draftContext = canonicalMatchId
    ? `match:${canonicalMatchId}`
    : editFixtureId ? `fixture:${editFixtureId}` : tournamentId ? `tournament:${tournamentId}` : 'friendly';
  const draftKey = auth.session ? matchSetupDraftKey(auth.session.user.id, draftContext) : undefined;

  useEffect(() => {
    let active = true;
    setDraftReady(false);
    if (!draftKey) return () => { active = false; };
    void loadMatchSetupDraft(draftKey).then(draft => {
      if (!active || !draft) return;
      setSetupRequestId(draft.requestId);
      setCreatedCloudMatchId(draft.cloudMatchId);
      setCreatedFingerprint(draft.creationFingerprint);
      setStep(draft.step);
      setFormat(draft.format);
      setTeamAId(draft.teamAId);
      setTeamBId(draft.teamBId);
      setOversInput(draft.oversInput);
      setPlayingCountInput(draft.playingCountInput);
      setSelectedAIds(draft.selectedAIds);
      setSelectedBIds(draft.selectedBIds);
      setMatchCaptainAId(draft.matchCaptainAId);
      setMatchCaptainBId(draft.matchCaptainBId);
      setVenue(draft.venue);
      setScheduledAt(draft.scheduledAt);
      const winnerIsCurrent = !draft.toss.winnerId
        || draft.toss.winnerId === draft.teamAId || draft.toss.winnerId === draft.teamBId;
      if (winnerIsCurrent) dispatchToss({ type: 'restore', state: draft.toss });
    }).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !draftReady) return;
    const timer = setTimeout(() => {
      void saveMatchSetupDraft(draftKey, {
        version: 1,
        requestId: setupRequestId,
        cloudMatchId: createdCloudMatchId,
        creationFingerprint: createdFingerprint,
        step,
        format,
        teamAId,
        teamBId,
        oversInput,
        playingCountInput,
        selectedAIds,
        selectedBIds,
        matchCaptainAId,
        matchCaptainBId,
        venue,
        scheduledAt,
        toss,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [createdCloudMatchId, createdFingerprint, draftKey, draftReady, format, matchCaptainAId, matchCaptainBId,
    oversInput, playingCountInput, scheduledAt, selectedAIds, selectedBIds, setupRequestId,
    step, teamAId, teamBId, toss, venue]);

  useEffect(() => {
    if (!draftReady) return;
    let active = true;
    setTeamsLoading(true);
    (async () => {
      if (tournamentId) {
        let tournament = await getTournament(tournamentId) ?? await getTournamentByCloudId(tournamentId);
        if (!tournament && auth.session) {
          await syncTournamentData(auth.session.user.id);
          tournament = await getTournament(tournamentId) ?? await getTournamentByCloudId(tournamentId);
        }
        const teamList = tournament ? await listTeams(tournament.id) : [];
        if (!active) return;
        setAllTeams(teamList);
        if (initialTeamAId) setTeamAId(teamList.find(team => team.id === initialTeamAId || team.cloudId === initialTeamAId)?.id ?? null);
        if (initialTeamBId) setTeamBId(teamList.find(team => team.id === initialTeamBId || team.cloudId === initialTeamBId)?.id ?? null);
        setTeamReasons({});
        if (tournament) {
          setSelectedTournament(tournament);
          setFormat(tournament.format);
          setOversInput(String(tournament.oversPerMatch));
          setPlayingCountInput(String(Math.min(11, tournament.playersPerTeam)));
          // Tournament fixtures always inherit the canonical tournament venue.
          setVenue(tournament.location ?? '');
          setIsTournamentMatch(true);
          if (tournament.cloudId) setFixtureSetup(await fixturesApi.getFixtureSetup(tournament.cloudId));
        }
        return;
      }
      if (!auth.session) {
        setAllTeams([]);
        return;
      }
      const eligible = await teamManagementApi.listStandaloneMatchTeams();
      const localTeams = await teamManagementApi.hydrateTeamsForScoring(eligible.map(team => team.id));
      const reasonByCloudId = new Map(eligible.map(team => [team.id, team.reason]));
      if (!active) return;
      setAllTeams(localTeams);
      setTeamReasons(Object.fromEntries(localTeams.flatMap(team => team.cloudId
        ? [[team.id, reasonByCloudId.get(team.cloudId) ?? 'PLAYED_AGAINST']]
        : [])));
    })().catch(cause => showSetupError(
      'Could not load match teams',
      cause instanceof Error ? cause.message : 'Please try again.',
    )).finally(() => { if (active) setTeamsLoading(false); });
    return () => { active = false; };
  }, [draftReady, auth.session, initialTeamAId, initialTeamBId, tournamentId, reloadAttempt, showSetupError]);

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
    void loadEligibility().catch(cause => showSetupError('Could not load roster roles', cause instanceof Error ? cause.message : 'Please try again.'));
  }, [teamA?.cloudId, teamB?.cloudId, showSetupError]);

  useEffect(() => {
    if (tournamentMatchType !== 'GROUP') return;
    const groups = fixtureSetup?.groups.filter(group => group.stage_id === manualGroupStage?.id) ?? [];
    if (!groups.some(group => group.id === linkedGroupId)) setLinkedGroupId(groups[0]?.id ?? '');
  }, [fixtureSetup?.groups, linkedGroupId, manualGroupStage?.id, tournamentMatchType]);

  const previousLinkage = useRef(`${tournamentMatchType}:${linkedGroupId}`);
  useEffect(() => {
    const linkage = `${tournamentMatchType}:${linkedGroupId}`;
    if (!canonicalMatchId && !editFixtureId && previousLinkage.current !== linkage) {
      setTeamAId(null);
      setTeamBId(null);
    }
    previousLinkage.current = linkage;
  }, [canonicalMatchId, editFixtureId, linkedGroupId, tournamentMatchType]);

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
  const creationFingerprint = JSON.stringify({
    tournamentId: tournamentId ?? null,
    teamAId,
    teamBId,
    format,
    rules,
    scheduledAt,
    venue: venue.trim(),
  });
  useEffect(() => {
    if (!canonicalMatchId && createdCloudMatchId && createdFingerprint
      && createdFingerprint !== creationFingerprint) {
      setCreatedCloudMatchId(undefined);
      setCreatedFingerprint(undefined);
      setSetupRequestId(newUuid());
    }
  }, [canonicalMatchId, createdCloudMatchId, createdFingerprint, creationFingerprint]);

  const canProceedTeams = Boolean(teamA && teamB && teamAId !== teamBId);
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
      showSetupError('Invalid date and time', 'Enter a valid ISO date and time.');
      return;
    }
    if (saveGate.current) return;
    saveGate.current = true; setSaving(true); setSetupError(undefined);
    try {
      if (!teamA.cloudId || !teamB.cloudId) {
        throw new Error('Both teams must be available online before starting the match');
      }
      const selectedPlayersA = selectedAIds.map(id => playersA.find(player => player.id === id)).filter(Boolean) as User[];
      const selectedPlayersB = selectedBIds.map(id => playersB.find(player => player.id === id)).filter(Boolean) as User[];
      if (selectedPlayersA.some(player => !player.cloudId) || selectedPlayersB.some(player => !player.cloudId)) {
        throw new Error('Every selected player must be available online before starting the match');
      }
      const tournament = tournamentId
        ? await getTournament(tournamentId) ?? await getTournamentByCloudId(tournamentId)
        : null;
      if (tournamentId && !tournament?.cloudId) {
        throw new Error('Tournament is not available online');
      }
      let cloudMatchId = canonicalMatchId ?? createdCloudMatchId;
      if (!cloudMatchId && tournamentMatchType !== 'RANDOM') {
        const round = Number(linkedRound);
        if (!Number.isInteger(round) || round < 1) {
          throw new Error('Enter a valid round number for the linked fixture');
        }
        const stageId = tournamentMatchType === 'GROUP' ? manualGroupStage?.id : manualKnockoutStage?.id;
        if (!stageId) {
          throw new Error(`Add a manual ${tournamentMatchType === 'GROUP' ? 'group' : 'knockout'} stage before starting this match`);
        }
        if (tournamentMatchType === 'GROUP' && !linkedGroupId) {
          throw new Error('Choose the group this match belongs to');
        }
        const fixture = await fixturesApi.addManualFixture({
          stageId,
          groupId: tournamentMatchType === 'GROUP' ? linkedGroupId : undefined,
          teamAId: teamA.cloudId,
          teamBId: teamB.cloudId,
          round,
          roundName: tournamentMatchType === 'KNOCKOUT' ? knockoutRoundName : undefined,
        });
        cloudMatchId = fixture.canonicalMatchId;
      }
      if (!cloudMatchId) {
        cloudMatchId = await matchSetupApi.createMatch({
          requestId: setupRequestId,
          tournamentId: tournament?.cloudId ?? null,
          teamAId: teamA.cloudId,
          teamBId: teamB.cloudId,
          format,
          rules,
          scheduledAt,
          venue,
        });
        setCreatedCloudMatchId(cloudMatchId);
        setCreatedFingerprint(creationFingerprint);
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
        tournamentId: tournament?.id ?? tournamentId ?? null,
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
      if (draftKey) await clearMatchSetupDraft(draftKey);
      router.replace({
        pathname: '/wricket/match/[id]/score',
        params: { id: match.id },
      });
    } catch (cause) {
      const detail = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Please try again.';
      showSetupError('Could not start match', detail);
    } finally {
      saveGate.current = false; setSaving(false);
    }
  };

  const onSaveFixture = async () => {
    if (!editFixtureId || !canonicalMatchId || !teamA || !teamB || !teamA.cloudId || !teamB.cloudId) return;
    if (teamA.id === teamB.id) {
      showSetupError('Pick both teams', 'Choose two different teams.');
      return;
    }
    if (!Number.isFinite(Date.parse(scheduledAt))) {
      showSetupError('Invalid date and time', 'Enter a valid ISO date and time.');
      return;
    }
    if (saveGate.current) return;
    saveGate.current = true; setSaving(true); setSetupError(undefined);
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
      showSetupError('Could not update fixture', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      saveGate.current = false; setSaving(false);
    }
  };

  return (
    <Screen padded={false} edges={['top', 'bottom', 'left', 'right']} style={{ backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <WricketHeader title={step === 'toss' ? 'Toss & start' : 'New match'} backTo="/wricket/live" onBack={() => {
        if (saving) return;
        if (step !== 'teams') setStep(prevStep(step));
        else if (router.canGoBack()) router.back();
        else router.replace('/wricket/live');
      }} />
      <View style={{ flex: 1, paddingHorizontal: 18 }}>
      <ScrollView key={step} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <View style={{ paddingTop: spacing.md, gap: spacing.lg }}>
        {step === 'review' ? <StepBadge step={step} /> : null}
        {setupError ? <StateNotice error title={setupError.title} detail={setupError.detail} action={{ label: setupError.title.includes('load') ? 'Reload setup' : 'Dismiss message', onPress: () => { setSetupError(undefined); if (setupError.title.includes('load')) setReloadAttempt(value => value + 1); } }} /> : null}

        {step === 'teams' && (
          <View style={{ gap: spacing.lg }}>
            {Boolean(tournamentId && !canonicalMatchId && !editFixtureId) && (
              <TournamentMatchTypePicker
                type={tournamentMatchType}
                setType={setTournamentMatchType}
                setup={fixtureSetup}
                groupId={linkedGroupId}
                setGroupId={setLinkedGroupId}
                round={linkedRound}
                setRound={setLinkedRound}
                knockoutRoundName={knockoutRoundName}
                setKnockoutRoundName={setKnockoutRoundName}
              />
            )}
            <TeamsStep
              format={format}
              setFormat={setFormat}
              teams={selectableTeams}
              teamAId={teamAId}
              teamBId={teamBId}
              setTeamAId={setTeamAId}
              setTeamBId={setTeamBId}
              teamReasons={teamReasons}
              lockFormat={isTournamentMatch}
              venue={venue}
              scheduledAt={scheduledAt}
              setVenue={setVenue}
              setScheduledAt={setScheduledAt}
              tournament={selectedTournament}
              oversInput={oversInput}
              setOversInput={setOversInput}
              playingCountInput={playingCountInput}
              setPlayingCountInput={setPlayingCountInput}
            />
          </View>
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
            playingCountInput={playingCountInput}
            selectedAIds={selectedAIds}
            selectedBIds={selectedBIds}
            setSelectedAIds={setSelectedAIds}
            setSelectedBIds={setSelectedBIds}
            captainCloudIdA={captainCloudIdA}
            captainCloudIdB={captainCloudIdB}
            lockRules={isTournamentMatch}
            matchCaptainAId={matchCaptainAId}
            matchCaptainBId={matchCaptainBId}
            setMatchCaptainAId={setMatchCaptainAId}
            setMatchCaptainBId={setMatchCaptainBId}
            onError={showSetupError}
          />
        )}

        {step === 'toss' && teamA && teamB && (
          <CricketToss key={`${teamA.id}:${teamB.id}`} teamA={teamA} teamB={teamB} state={toss} dispatch={dispatchToss} />
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

      </View>
      </ScrollView>
        <View style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
          {step !== 'teams' && (
            <Button
              title="Back"
              disabled={saving}
              variant="secondary"
              onPress={() => setStep(prevStep(step))}
              style={{ flex: 1 }}
            />
          )}
          {step === 'teams' && editFixtureId ? (
            <Button title="Save fixture" onPress={onSaveFixture} loading={saving} style={{ flex: 1 }} />
          ) : step !== 'review' ? (
            <Button
              title={step === 'teams' ? 'Choose players' : step === 'players' ? 'Continue to toss' : 'Review match'}
              disabled={step === 'teams' && (teamsLoading || !draftReady)}
              onPress={() => {
                if (step === 'teams' && !canProceedTeams) {
                  showSetupError('Pick both teams', 'Choose two different teams.');
                  return;
                }
                if (step === 'players' && !canProceedPlayers) {
                  showSetupError(
                    'Playing XI incomplete',
                    `Select exactly ${rules.playersPerSide} players and one match captain for each team.`,
                  );
                  return;
                }
                if (step === 'toss' && !canProceedToss) {
                  showSetupError(
                    'Toss incomplete',
                    'Record the toss winner or flip the coin, then choose to bat or field first.',
                  );
                  return;
                }
                setStep(nextStep(step));
              }}
              style={{ flex: 1 }}
            />
          ) : (
            <Button title="Start scoring" onPress={onStart} loading={saving} style={{ flex: 1 }} />
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
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>{[1, 2, 3, 4].map(index => <View key={index} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: index <= stepNum ? colors.accent : colors.border }} />)}</View>
      <Text variant="overline" tone="muted">Step {stepNum} of 4</Text>
      <Text variant="h1">{title}</Text>
    </View>
  );
}

function TournamentMatchTypePicker({
  type, setType, setup, groupId, setGroupId, round, setRound, knockoutRoundName, setKnockoutRoundName,
}: {
  type: TournamentMatchType;
  setType: (type: TournamentMatchType) => void;
  setup?: GeneratedFixtureSetup;
  groupId: string;
  setGroupId: (id: string) => void;
  round: string;
  setRound: (value: string) => void;
  knockoutRoundName: string;
  setKnockoutRoundName: (value: string) => void;
}) {
  const groupStage = setup?.stages.find(stage => stage.type === 'GROUP' && stage.config?.manual);
  const knockoutStage = setup?.stages.find(stage => stage.type === 'KNOCKOUT' && stage.config?.manual);
  const groups = setup?.groups.filter(group => group.stage_id === groupStage?.id) ?? [];
  const groupAvailable = Boolean(groupStage && groups.length);
  const knockoutAvailable = Boolean(knockoutStage);
  const selectKnockoutRound = (name: string) => {
    setKnockoutRoundName(name);
    setRound(name === 'QF' ? '1' : name === 'SF' ? '2' : '3');
  };
  return (
    <Card>
      <Text variant="h3">Match type</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
        Link this match to a manual group or knockout stage, or keep it as an independent tournament match.
      </Text>
      <View style={[styles.matchTypeChoices, { marginTop: spacing.md }]}>
        {([
          ['RANDOM', 'Independent'],
          ['GROUP', 'Group fixture'],
          ['KNOCKOUT', 'Knockout fixture'],
        ] as const).map(([value, label]) => {
          const disabled = (value === 'GROUP' && !groupAvailable) || (value === 'KNOCKOUT' && !knockoutAvailable);
          return (
            <Pressable
              key={value}
              disabled={disabled}
              onPress={() => setType(value)}
              style={[styles.chip, type === value && styles.chipActive, disabled && styles.teamRowLocked]}
            >
              <Text variant="caption" style={type === value ? { color: colors.accentInk } : undefined}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {!groupAvailable && !knockoutAvailable && (
        <Text variant="caption" tone="dim" style={{ marginTop: spacing.sm }}>
          Add manual stages in Tournament fixtures to link a match to the schedule.
        </Text>
      )}
      {type === 'GROUP' && (
        <View style={{ marginTop: spacing.md }}>
          <Text variant="caption" tone="muted">GROUP</Text>
          <View style={[styles.matchTypeChoices, { marginTop: spacing.sm }]}>
            {groups.map(group => (
              <Pressable
                key={group.id}
                onPress={() => setGroupId(group.id)}
                style={[styles.chip, groupId === group.id && styles.chipActive]}
              >
                <Text variant="caption" style={groupId === group.id ? { color: colors.accentInk } : undefined}>
                  {group.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {type === 'KNOCKOUT' && (
        <View style={{ marginTop: spacing.md }}>
          <Text variant="caption" tone="muted">KNOCKOUT ROUND</Text>
          <View style={[styles.matchTypeChoices, { marginTop: spacing.sm }]}>
            {([
              ['QF', 'Quarter-final'],
              ['SF', 'Semi-final'],
              ['F', 'Final'],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => selectKnockoutRound(value)}
                style={[styles.chip, knockoutRoundName === value && styles.chipActive]}
              >
                <Text variant="caption" style={knockoutRoundName === value ? { color: colors.accentInk } : undefined}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {type !== 'RANDOM' && (
        <View style={{ marginTop: spacing.md }}>
          <Text variant="caption" tone="muted">ROUND ORDER</Text>
          <TextInput
            value={round}
            onChangeText={setRound}
            keyboardType="number-pad"
            style={[styles.input, { marginTop: spacing.sm, marginBottom: 0, width: 96 }]}
          />
        </View>
      )}
    </Card>
  );
}

function TeamsStep({
  format, setFormat, teams, teamAId, teamBId, setTeamAId, setTeamBId,
  teamReasons, lockFormat, venue, scheduledAt, setVenue, setScheduledAt, tournament,
  oversInput, setOversInput, playingCountInput, setPlayingCountInput,
}: {
  format: MatchFormat;
  setFormat: (f: MatchFormat) => void;
  teams: Team[];
  teamAId: string | null;
  teamBId: string | null;
  setTeamAId: (id: string) => void;
  setTeamBId: (id: string) => void;
  teamReasons: Record<string, 'MY_TEAM' | 'PLAYED_AGAINST'>;
  lockFormat: boolean;
  venue: string;
  scheduledAt: string;
  setVenue: (value: string) => void;
  setScheduledAt: (value: string) => void;
  tournament: Awaited<ReturnType<typeof getTournament>>;
  oversInput: string; setOversInput: (value: string) => void;
  playingCountInput: string; setPlayingCountInput: (value: string) => void;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View><Text variant="overline" tone="muted">Quick match</Text><Text variant="h1" style={{ marginTop: 8 }}>Less setup.{`\n`}More cricket.</Text><Text variant="caption" tone="muted" style={{ marginTop: 9 }}>Choose the teams and confirm today&apos;s playing conditions.</Text></View>

      <Card>
        <Text variant="overline" tone="muted" style={{ marginBottom: spacing.sm }}>The teams</Text>
        <TeamPicker label="TEAM A" teams={teams} teamReasons={teamReasons} selectedId={teamAId} excludeId={teamBId} onSelect={setTeamAId} />
        <View style={{ height: 12 }} />
        <TeamPicker label="TEAM B" teams={teams} teamReasons={teamReasons} selectedId={teamBId} excludeId={teamAId} onSelect={setTeamBId} />
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text variant="overline" tone="muted">Playing conditions</Text>{lockFormat ? <Text variant="overline" tone="muted">Tournament locked</Text> : null}</View>
        <Text variant="caption" tone="muted" style={{ marginTop: 14, marginBottom: spacing.sm }}>FORMAT</Text>
        {lockFormat ? (
          <View>
            <Text variant="bodyStrong">{FORMAT_LABEL[format]}</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
              Inherited from tournament
            </Text>
          </View>
        ) : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {FORMATS.map(f => (
            <Pressable
              key={f}
              accessibilityRole="radio"
              accessibilityLabel={FORMAT_LABEL[f]}
              accessibilityState={{ checked: format === f }}
              aria-checked={format === f}
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
        {lockFormat ? <Text variant="bodyStrong" style={{ marginTop: 14 }}>{oversInput} overs · {playingCountInput}-a-side</Text> : <View style={styles.ruleInputs}>
          <View style={{ flex: 1 }}><Text variant="caption" tone="muted">OVERS</Text><TextInput accessibilityLabel="Overs" value={oversInput} onChangeText={setOversInput} keyboardType="number-pad" style={styles.input} /></View>
          <View style={{ flex: 1 }}><Text variant="caption" tone="muted">PLAYERS PER SIDE</Text><TextInput accessibilityLabel="Players per side" value={playingCountInput} onChangeText={setPlayingCountInput} keyboardType="number-pad" style={styles.input} /></View>
        </View>}
      </Card>

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

      {teams.length < 2 && (
        <Text variant="caption" tone="muted">
          You need at least two teams you play for or have played against.
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
  label, teams, teamReasons, selectedId, excludeId, onSelect,
}: {
  label: string;
  teams: Team[];
  teamReasons: Record<string, 'MY_TEAM' | 'PLAYED_AGAINST'>;
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
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${t.name}`}
            accessibilityState={{ selected: selectedId === t.id, disabled: locked }}
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
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{t.name}</Text>
              {teamReasons[t.id] ? <Text variant="caption" tone="muted">
                {teamReasons[t.id] === 'MY_TEAM' ? 'Your team' : 'Played against'}
              </Text> : null}
            </View>
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
  teamA, teamB, playersA, playersB, maxPerSide, oversInput,
  playingCountInput, selectedAIds, selectedBIds,
  setSelectedAIds, setSelectedBIds,
  captainCloudIdA, captainCloudIdB,
  lockRules,
  matchCaptainAId, matchCaptainBId, setMatchCaptainAId, setMatchCaptainBId, onError,
}: {
  teamA: Team; teamB: Team; playersA: User[]; playersB: User[]; onChange: () => void;
  maxPerSide: number; oversInput: string; playingCountInput: string;
  selectedAIds: string[]; selectedBIds: string[];
  setSelectedAIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedBIds: React.Dispatch<React.SetStateAction<string[]>>;
  captainCloudIdA?: string; captainCloudIdB?: string;
  lockRules: boolean;
  matchCaptainAId?: string; matchCaptainBId?: string;
  setMatchCaptainAId: (value?: string) => void; setMatchCaptainBId: (value?: string) => void;
  onError: (title: string, detail: string) => void;
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
      <View><Text variant="h1">The playing {maxPerSide}.</Text><Text variant="caption" tone="muted" style={{ marginTop: 9 }}>Confirm the players taking the field today.</Text></View>
      <Card style={styles.rulesCard}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text variant="overline" tone="muted">Playing conditions</Text>{lockRules ? <Text variant="overline" tone="muted">Tournament locked</Text> : null}</View><Text variant="bodyStrong" style={{ marginTop: 10 }}>{oversInput} overs · {playingCountInput}-a-side</Text></Card>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search players…" placeholderTextColor={colors.textDim} style={styles.searchInput} />
      <Text variant="caption" tone="muted">Select the Playing XI and one match captain for each team.</Text>
      <TeamPlayersBlock team={teamA} players={filter(playersA)} selectedIds={selectedAIds} max={maxPerSide} setSelectedIds={setSelectedAIds} captainId={matchCaptainAId} setCaptainId={setMatchCaptainAId} onError={onError} />
      <TeamPlayersBlock team={teamB} players={filter(playersB)} selectedIds={selectedBIds} max={maxPerSide} setSelectedIds={setSelectedBIds} captainId={matchCaptainBId} setCaptainId={setMatchCaptainBId} onError={onError} />
    </View>
  );
}

function TeamPlayersBlock({
  team, players, selectedIds, max, setSelectedIds, captainId, setCaptainId, onError,
}: {
  team: Team; players: User[]; selectedIds: string[]; max: number;
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  captainId?: string; setCaptainId: (value?: string) => void;
  onError: (title: string, detail: string) => void;
}) {
  const router = useRouter();
  const togglePlayer = (player: User) => setSelectedIds(current => {
    if (current.includes(player.id)) {
      if (captainId === player.id) {
        setCaptainId(undefined);
        onError('Select a new match captain', `${player.name} was removed from the Playing XI. Choose another selected player as captain.`);
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
  matchTypeChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
