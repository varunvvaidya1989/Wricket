import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  addCompetitionFixture,
  calculateCompetitionStandings,
  canManageCompetition,
  canScoreCompetition,
  competitionEntrantPlayers,
  getSportCompetition,
  listScoringSessions,
  projectCompetitionFixtures,
  replay,
  saveSportCompetition,
  withCompetitionFixtureSchedule,
  withCompetitionPointsRule,
  withLeagueSportProfile,
  withTournamentSquad,
  withCompetitionOfficial,
  withoutCompetitionOfficial,
  type CompetitionFixtureResult,
  type ProjectedCompetitionFixture,
  type ScoringSessionRecord,
  type ScoringSportId,
  type SportCompetitionRecord,
} from '@/lib/sports/scoring';
import { globalSearchApi, type GlobalSearchResult } from '@/lib/supabase/globalSearchApi';
import {
  sportRosterApi,
  type SportPlayerSearchResult,
  type SportTeamSummary,
} from '@/lib/supabase/sportRosterApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

type DetailTab = 'overview' | 'schedule' | 'draw' | 'table';

const tabs: readonly { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'draw', label: 'Fixtures' },
  { id: 'table', label: 'Table' },
];

export function SportCompetitionDetailScreen({ sportId }: { sportId: ScoringSportId }) {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [competition, setCompetition] = useState<SportCompetitionRecord>();
  const [sessions, setSessions] = useState<readonly ScoringSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [entrantOpen, setEntrantOpen] = useState(false);
  const [entrantQuery, setEntrantQuery] = useState('');
  const [playerResults, setPlayerResults] = useState<readonly SportPlayerSearchResult[]>([]);
  const [teamResults, setTeamResults] = useState<readonly SportTeamSummary[]>([]);
  const [searchingEntrants, setSearchingEntrants] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [winPoints, setWinPoints] = useState('2');
  const [lossPoints, setLossPoints] = useState('0');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [fixtureId, setFixtureId] = useState<string>();
  const [sideAId, setSideAId] = useState<string>();
  const [sideBId, setSideBId] = useState<string>();
  const [scheduleAt, setScheduleAt] = useState('');
  const [court, setCourt] = useState('');
  const [officialsOpen, setOfficialsOpen] = useState(false);
  const [officialQuery, setOfficialQuery] = useState('');
  const [officialResults, setOfficialResults] = useState<readonly GlobalSearchResult[]>([]);
  const [searchingOfficials, setSearchingOfficials] = useState(false);
  const [officialBusyId, setOfficialBusyId] = useState<string>();

  const canManage = Boolean(competition && mode !== 'view'
    && canManageCompetition(competition, auth.session?.user.id));
  const canScore = Boolean(competition && mode !== 'view'
    && canScoreCompetition(competition, auth.session?.user.id));

  const reload = useCallback(() => {
    if (!id) {
      setError('The competition ID is missing.');
      setLoading(false);
      return;
    }
    void Promise.all([getSportCompetition(id), listScoringSessions()])
      .then(([stored, storedSessions]) => {
        if (!stored || stored.sportId !== sportId) {
          setError(`This ${config.name} competition could not be found.`);
          return;
        }
        setCompetition(stored);
        setSessions(storedSessions.filter((session) => session.competitionId === stored.id));
        setWinPoints(String(stored.pointsRule.win));
        setLossPoints(String(stored.pointsRule.loss));
        setError(undefined);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this competition.'))
      .finally(() => setLoading(false));
  }, [config.name, id, sportId]);
  useFocusEffect(reload);

  useEffect(() => {
    if (!officialsOpen || !canManage || officialQuery.trim().length < 2) {
      setOfficialResults([]);
      setSearchingOfficials(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setSearchingOfficials(true);
      void globalSearchApi.search(officialQuery, 'USER')
        .then((results) => { if (active) setOfficialResults(results.slice(0, 8)); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not search match officials.'); })
        .finally(() => { if (active) setSearchingOfficials(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [canManage, officialQuery, officialsOpen]);

  useEffect(() => {
    if (!entrantOpen || !competition || !canManage) {
      setPlayerResults([]);
      setTeamResults([]);
      setSearchingEntrants(false);
      return;
    }
    let active = true;
    if (competition.kind === 'TOURNAMENT') {
      const accountId = auth.session?.user.id;
      if (!accountId) return;
      setSearchingEntrants(true);
      void sportRosterApi.listOwnedTeams(accountId, presentation.catalogCode)
        .then((teams) => { if (active) setTeamResults(teams); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load reusable teams.'); })
        .finally(() => { if (active) setSearchingEntrants(false); });
      return () => { active = false; };
    }
    if (entrantQuery.trim().length < 2) {
      setPlayerResults([]);
      return () => { active = false; };
    }
    const timer = setTimeout(() => {
      setSearchingEntrants(true);
      void sportRosterApi.searchPlayers(presentation.catalogCode, entrantQuery)
        .then((players) => { if (active) setPlayerResults(players); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not search players.'); })
        .finally(() => { if (active) setSearchingEntrants(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [auth.session?.user.id, canManage, competition, entrantOpen, entrantQuery, presentation.catalogCode]);

  const sessionData = useMemo(() => {
    if (!competition) return { results: [] as CompetitionFixtureResult[], byFixture: new Map<string, ScoringSessionRecord>(), completed: new Set<string>() };
    const results: CompetitionFixtureResult[] = [];
    const byFixture = new Map<string, ScoringSessionRecord>();
    const completed = new Set<string>();
    sessions.forEach((session) => {
      if (!session.fixtureId || byFixture.has(session.fixtureId)) return;
      byFixture.set(session.fixtureId, session);
      if (!session.sideEntrantIds) return;
      const state = replay(SPORT_CONFIGS[session.sportId], session.events, {
        initialServer: session.initialServer,
        options: session.options,
      });
      if (state.winner === undefined) return;
      completed.add(session.fixtureId);
      results.push({
        fixtureId: session.fixtureId,
        winnerEntrantId: session.sideEntrantIds[state.winner],
      });
    });
    return { results, byFixture, completed };
  }, [competition, sessions]);

  const fixtures = useMemo(
    () => competition ? projectCompetitionFixtures(competition, sessionData.results) : [],
    [competition, sessionData.results],
  );
  const standings = useMemo(
    () => competition ? calculateCompetitionStandings(competition, sessionData.results) : [],
    [competition, sessionData.results],
  );
  const entrantById = useMemo(
    () => new Map(competition?.entrants.map((entrant) => [entrant.id, entrant]) ?? []),
    [competition],
  );

  const persist = async (next: SportCompetitionRecord) => {
    setSaving(true);
    try {
      const stored = await saveSportCompetition(next);
      setCompetition(stored);
      setError(undefined);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save this competition.';
      setError(message);
      Alert.alert('Could not save', message);
      throw cause;
    } finally {
      setSaving(false);
    }
  };

  const ensureEntrantsUnlocked = (): boolean => {
    if (!competition || !canManage || saving) return false;
    if (competition.fixtures.length) {
      Alert.alert(
        `${competition.kind === 'TOURNAMENT' ? 'Teams' : 'Players'} locked`,
        'The field is locked after the owner schedules the first match.',
      );
      return false;
    }
    return true;
  };

  const addLeaguePlayer = async (player: SportPlayerSearchResult) => {
    if (!competition || !ensureEntrantsUnlocked()) return;
    try {
      await persist(withLeagueSportProfile(competition, player));
      setEntrantQuery('');
      setEntrantOpen(false);
    } catch {
      // Persist reports the actionable error.
    }
  };

  const addTournamentTeam = async (team: SportTeamSummary) => {
    if (!competition || !ensureEntrantsUnlocked()) return;
    setSaving(true);
    try {
      const roster = await sportRosterApi.listTeamMemberships(team.id);
      const players = roster.filter((member) => member.status === 'ACTIVE').map((member) => ({
        sportProfileId: member.sportProfileId,
        accountId: member.accountId ?? '',
        displayName: member.displayName,
        eligibility: member.eligibility,
      }));
      const next = withTournamentSquad(competition, {
        sourceTeamId: team.id,
        name: team.name,
        players,
      });
      const stored = await saveSportCompetition(next);
      setCompetition(stored);
      setError(undefined);
      setEntrantOpen(false);
    } catch (cause) {
      const errorMessage = cause instanceof Error ? cause.message : 'Could not register that team.';
      setError(errorMessage);
      Alert.alert('Could not register team', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const savePoints = async () => {
    if (!competition || !canManage || saving) return;
    try {
      await persist(withCompetitionPointsRule(competition, {
        win: Number(winPoints),
        loss: Number(lossPoints),
      }));
      setPointsOpen(false);
    } catch {
      // Persist reports the actionable error.
    }
  };

  const openSchedule = (fixture?: ProjectedCompetitionFixture) => {
    if (!canManage) return;
    setFixtureId(fixture?.id);
    setSideAId(fixture?.sideAId);
    setSideBId(fixture?.sideBId);
    setScheduleAt(formatScheduleInput(fixture?.scheduledAt ?? nextHour()));
    setCourt(fixture?.court ?? '');
    setScheduleOpen(true);
  };

  const saveSchedule = async () => {
    if (!competition || !canManage || saving) return;
    const timestamp = Date.parse(scheduleAt.trim().replace(' ', 'T'));
    if (!Number.isFinite(timestamp)) {
      Alert.alert('Invalid date and time', 'Use a date such as 2026-08-20 18:30.');
      return;
    }
    try {
      const next = fixtureId
        ? withCompetitionFixtureSchedule(competition, fixtureId, { scheduledAt: timestamp, court })
        : sideAId && sideBId
          ? addCompetitionFixture(competition, { entrantAId: sideAId, entrantBId: sideBId, scheduledAt: timestamp, court })
          : undefined;
      if (!next) {
        Alert.alert('Choose both sides', `Select two different ${competition.kind === 'TOURNAMENT' ? 'teams' : 'players'} for this match.`);
        return;
      }
      await persist(next);
      setScheduleOpen(false);
    } catch {
      // Persist or the domain helper reports the actionable error.
    }
  };

  const openFixture = (fixture: ProjectedCompetitionFixture) => {
    if (!competition || !fixture.sideAId || !fixture.sideBId) return;
    const existing = sessionData.byFixture.get(fixture.id);
    if (existing) {
      const viewSuffix = canScore ? '' : '?mode=view';
      router.push(`/${presentation.routeSegment}/match/${existing.id}/score${viewSuffix}` as Href);
      return;
    }
    if (!canScore) {
      Alert.alert('Match not live yet', 'You can view this match after the creator or a match official starts scoring.');
      return;
    }
    if (competition.kind === 'TOURNAMENT') {
      const sideA = competition.entrants.find((entrant) => entrant.id === fixture.sideAId);
      const sideB = competition.entrants.find((entrant) => entrant.id === fixture.sideBId);
      if ((sideA?.entrantType === 'TEAM' && sideA.sourceTeamId)
        || (sideB?.entrantType === 'TEAM' && sideB.sourceTeamId)) {
        Alert.alert(
          'Team lineup required',
          'A singles or doubles lineup must be submitted before this team match can start.',
        );
        return;
      }
    }
    router.push(
      `/${presentation.routeSegment}/match/new?competitionId=${encodeURIComponent(competition.id)}&fixtureId=${encodeURIComponent(fixture.id)}&sideAId=${encodeURIComponent(fixture.sideAId)}&sideBId=${encodeURIComponent(fixture.sideBId)}` as Href,
    );
  };

  const assignOfficial = async (result: GlobalSearchResult) => {
    if (!competition || !canManage || officialBusyId) return;
    setOfficialBusyId(result.id);
    try {
      const profile = await globalSearchApi.getProfile(result.id);
      if (!profile) throw new Error('That SportStage member could not be loaded.');
      await persist(withCompetitionOfficial(competition, {
        accountId: profile.accountId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      }, auth.session?.user.id));
      setOfficialResults((current) => current.filter((item) => item.id !== result.id));
    } catch (cause) {
      Alert.alert('Could not assign official', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setOfficialBusyId(undefined);
    }
  };

  const removeOfficial = (accountId: string, displayName: string) => {
    if (!competition || !canManage) return;
    Alert.alert('Remove match official?', `${displayName} will no longer be able to score matches in this competition.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void persist(withoutCompetitionOfficial(
          competition,
          accountId,
          auth.session?.user.id,
        )).catch(() => undefined),
      },
    ]);
  };

  if (loading) {
    return <Screen padded={false}><SportStageLoader message={`Opening ${config.name} competition`} detail="Loading entrants, fixtures, and standings" accent={presentation.accent} /></Screen>;
  }
  if (!competition) {
    return <Screen padded={false}><AppHeader title="Competition" back /><View style={styles.center}><MaterialCommunityIcons name="trophy-broken" size={38} color={colors.textDim} /><Text variant="h3">Competition unavailable</Text><Text tone="muted" style={styles.centerText}>{error}</Text></View></Screen>;
  }

  const nextFixture = [...fixtures]
    .filter((fixture) => fixture.sideAId && fixture.sideBId && !sessionData.completed.has(fixture.id))
    .sort((left, right) => (left.scheduledAt ?? Number.MAX_SAFE_INTEGER) - (right.scheduledAt ?? Number.MAX_SAFE_INTEGER))[0];

  return (
    <Screen padded={false} edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader title={competition.name} eyebrow={config.name.toUpperCase()} back />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { borderColor: presentation.accent }]}>
          <View style={[styles.heroIcon, { backgroundColor: `${presentation.accent}18` }]}>
            <MaterialCommunityIcons name={competition.kind === 'LEAGUE' ? 'table-large' : 'trophy-outline'} size={33} color={presentation.accent} />
          </View>
          <View style={styles.flex}>
            <Text variant="overline" style={{ color: presentation.accent }}>{competition.kind} · {competition.matchFormat} · MANUAL SCHEDULE</Text>
            <Text variant="h1" numberOfLines={2}>{competition.name}</Text>
            <Text variant="caption" tone="muted">Created by {competition.creatorName} · {competition.officials.length} match official{competition.officials.length === 1 ? '' : 's'}</Text>
            {!canManage && !canScore ? <Text variant="overline" style={{ color: presentation.accent }}>SPECTATOR VIEW</Text> : canScore && !canManage ? <Text variant="overline" style={{ color: presentation.accent }}>MATCH OFFICIAL</Text> : null}
          </View>
        </View>

        <View style={styles.metrics}>
          <Metric value={competition.entrants.length} label={competition.kind === 'TOURNAMENT' ? 'TEAMS' : 'PLAYERS'} />
          <Metric value={competition.fixtures.length} label="MATCHES" />
          <Metric value={sessionData.completed.size} label="RESULTS" />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map((item) => (
            <Pressable key={item.id} onPress={() => setTab(item.id)} style={[styles.tab, tab === item.id && { borderColor: presentation.accent, backgroundColor: `${presentation.accent}14` }]}>
              <Text variant="caption" style={tab === item.id ? { color: presentation.accent } : undefined}>{item.label.toUpperCase()}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {error ? <View style={styles.error}><MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} /><Text variant="caption" tone="danger" style={styles.flex}>{error}</Text></View> : null}

        {tab === 'overview' ? (
          <View style={styles.sectionStack}>
            <SectionHeader title="NEXT MATCH" />
            {nextFixture ? (
              <FixtureCard
                fixture={nextFixture}
                entrantById={entrantById}
                session={sessionData.byFixture.get(nextFixture.id)}
                complete={sessionData.completed.has(nextFixture.id)}
                accent={presentation.accent}
                canManage={canManage}
                canScore={canScore}
                onSchedule={() => openSchedule(nextFixture)}
                onOpen={() => openFixture(nextFixture)}
              />
            ) : <EmptyCard icon="calendar-blank-outline" title="No upcoming match" copy="Add a match schedule to get started." />}

            <View style={styles.quickGrid}>
              <Pressable onPress={() => setTab('draw')} style={styles.quickCard}>
                <MaterialCommunityIcons name="tournament" size={24} color={presentation.accent} />
                <Text variant="bodyStrong">Fixtures</Text>
                <Text variant="caption" tone="muted">{fixtures.length ? `${fixtures.length} manually scheduled` : 'Owner chooses every match'}</Text>
              </Pressable>
              <Pressable onPress={() => canManage ? setPointsOpen(true) : setTab('table')} style={styles.quickCard}>
                <MaterialCommunityIcons name="counter" size={24} color={presentation.accent} />
                <Text variant="bodyStrong">Points system</Text>
                <Text variant="caption" tone="muted">Win {competition.pointsRule.win} · Loss {competition.pointsRule.loss}</Text>
              </Pressable>
            </View>

            <Pressable
              disabled={!canManage}
              onPress={() => setOfficialsOpen(true)}
              style={[styles.officialsCard, !canManage && styles.disabled]}
            >
              <View style={[styles.officialsIcon, { backgroundColor: `${presentation.accent}16` }]}><MaterialCommunityIcons name="whistle-outline" size={22} color={presentation.accent} /></View>
              <View style={styles.flex}><Text variant="bodyStrong">Match officials</Text><Text variant="caption" tone="muted">{competition.officials.length ? `${competition.officials.length} assigned to score matches` : canManage ? 'Assign trusted SportStage scorers' : 'No officials assigned'}</Text></View>
              {canManage ? <MaterialCommunityIcons name="chevron-right" size={21} color={colors.textDim} /> : null}
            </Pressable>

            <View style={styles.headingRow}>
              <SectionHeader title={competition.kind === 'TOURNAMENT' ? 'TEAMS' : 'PLAYERS'} />
              {canManage ? <Pressable disabled={competition.fixtures.length > 0} onPress={() => setEntrantOpen(true)} style={[styles.smallAction, { borderColor: presentation.accent }, competition.fixtures.length > 0 && styles.disabled]}>
                <MaterialCommunityIcons name="plus" size={17} color={presentation.accent} />
                <Text variant="caption" style={{ color: presentation.accent }}>ADD</Text>
              </Pressable> : null}
            </View>
            {competition.entrants.length ? competition.entrants.map((entrant) => (
              <View key={entrant.id} style={styles.entrantRow}>
                <View style={[styles.seed, { backgroundColor: `${presentation.accent}16` }]}><Text variant="mono" style={{ color: presentation.accent }}>{entrant.seed}</Text></View>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{entrant.name}</Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {entrant.entrantType === 'TEAM'
                      ? competitionEntrantPlayers(entrant).map((player) => player.name).join(' · ')
                      : 'Individual player'}
                  </Text>
                </View>
              </View>
            )) : <EmptyCard icon="account-multiple-plus-outline" title="Add the field" copy={`Enter at least two ${competition.kind === 'TOURNAMENT' ? 'teams' : 'players'} before scheduling matches.`} />}
          </View>
        ) : null}

        {tab === 'schedule' ? (
          <View style={styles.sectionStack}>
            <View style={styles.headingRow}>
              <View style={styles.flex}><SectionHeader title="MATCH SCHEDULE" /><Text variant="caption" tone="muted">The owner chooses every pairing, date, and court.</Text></View>
              {canManage ? <Pressable disabled={competition.entrants.length < 2} onPress={() => openSchedule()} style={[styles.smallAction, { borderColor: presentation.accent }, competition.entrants.length < 2 && styles.disabled]}>
                <MaterialCommunityIcons name="calendar-plus" size={17} color={presentation.accent} />
                <Text variant="caption" style={{ color: presentation.accent }}>ADD</Text>
              </Pressable> : null}
            </View>
            {fixtures.length ? fixtures.map((fixture) => (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                entrantById={entrantById}
                session={sessionData.byFixture.get(fixture.id)}
                complete={sessionData.completed.has(fixture.id)}
                accent={presentation.accent}
                canManage={canManage}
                canScore={canScore}
                onSchedule={() => openSchedule(fixture)}
                onOpen={() => openFixture(fixture)}
              />
            )) : <EmptyCard icon="calendar-blank-outline" title="Schedule is empty" copy="Add each match manually in the order you want it played." />}
          </View>
        ) : null}

        {tab === 'draw' ? (
          <View style={styles.sectionStack}>
            <View style={styles.headingRow}>
              <View style={styles.flex}><SectionHeader title="FIXTURES" /><Text variant="caption" tone="muted">No automatic draw—the owner controls every matchup.</Text></View>
              {canManage ? <Pressable disabled={competition.entrants.length < 2} onPress={() => openSchedule()} style={[styles.smallAction, { borderColor: presentation.accent }, competition.entrants.length < 2 && styles.disabled]}>
                <MaterialCommunityIcons name="plus" size={17} color={presentation.accent} />
                <Text variant="caption" style={{ color: presentation.accent }}>ADD</Text>
              </Pressable> : null}
            </View>
            {fixtures.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.drawRail}>
                {drawRounds(fixtures).map(([roundLabel, roundFixtures]) => (
                  <View key={roundLabel} style={styles.drawRound}>
                    <Text variant="overline" style={{ color: presentation.accent }}>{roundLabel}</Text>
                    {roundFixtures.map((fixture) => (
                      <View key={fixture.id} style={styles.drawMatch}>
                        <DrawSide name={fixtureSideName(fixture.sideAId, fixture.sourceA?.fixtureId, entrantById)} winner={fixture.winnerEntrantId === fixture.sideAId} />
                        <View style={styles.drawDivider} />
                        <DrawSide name={fixtureSideName(fixture.sideBId, fixture.sourceB?.fixtureId, entrantById, fixture.isBye)} winner={fixture.winnerEntrantId === fixture.sideBId} />
                        {fixture.isBye ? <Text variant="overline" tone="dim">BYE</Text> : null}
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
            ) : <EmptyCard icon="tournament" title="No fixtures scheduled" copy="The owner can add pairings one by one in any order." />}
          </View>
        ) : null}

        {tab === 'table' ? (
          <View style={styles.sectionStack}>
            <View style={styles.headingRow}>
              <View style={styles.flex}><SectionHeader title="POINTS TABLE" /><Text variant="caption" tone="muted">Win {competition.pointsRule.win} · Loss {competition.pointsRule.loss}</Text></View>
              {canManage ? <Pressable onPress={() => setPointsOpen(true)} style={[styles.smallAction, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="pencil-outline" size={16} color={presentation.accent} /><Text variant="caption" style={{ color: presentation.accent }}>EDIT</Text></Pressable> : null}
            </View>
            {standings.length ? (
              <View style={styles.tableCard}>
                <View style={[styles.tableRow, styles.tableHeader]}><Text variant="overline" tone="dim" style={styles.rank}>#</Text><Text variant="overline" tone="dim" style={styles.flex}>{competition.kind === 'TOURNAMENT' ? 'TEAM' : 'PLAYER'}</Text><Text variant="overline" tone="dim" style={styles.number}>P</Text><Text variant="overline" tone="dim" style={styles.number}>W</Text><Text variant="overline" tone="dim" style={styles.number}>L</Text><Text variant="overline" tone="dim" style={styles.number}>PTS</Text></View>
                {standings.map((standing, index) => (
                  <View key={standing.entrantId} style={styles.tableRow}><Text variant="mono" tone="dim" style={styles.rank}>{index + 1}</Text><Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>{entrantById.get(standing.entrantId)?.name ?? 'Unknown'}</Text><Text variant="mono" style={styles.number}>{standing.played}</Text><Text variant="mono" style={styles.number}>{standing.won}</Text><Text variant="mono" style={styles.number}>{standing.lost}</Text><Text variant="bodyStrong" style={[styles.number, { color: presentation.accent }]}>{standing.points}</Text></View>
                ))}
              </View>
            ) : <EmptyCard icon="table-large" title="Table awaiting entrants" copy={`Add ${competition.kind === 'TOURNAMENT' ? 'teams' : 'players'} and record results to build the standings.`} />}
          </View>
        ) : null}
      </ScrollView>

      <EntryModal visible={entrantOpen} title={competition.kind === 'TOURNAMENT' ? 'Add team' : 'Add player'} onClose={() => setEntrantOpen(false)}>
        {competition.fixtures.length ? <Text variant="caption" tone="danger">The entrant field is locked because match scheduling has started.</Text> : null}
        <Text variant="caption" tone="muted">{competition.kind === 'TOURNAMENT'
          ? 'Choose one of your reusable club teams. Its accepted account-backed roster is snapshotted for this tournament.'
          : `Search active SportStage ${config.name} players. Free-text and guest entrants are not allowed.`}</Text>
        {competition.kind === 'LEAGUE' ? <TextInput value={entrantQuery} onChangeText={setEntrantQuery} autoFocus maxLength={60} placeholder="Search SportStage players" placeholderTextColor={colors.textDim} style={styles.input} /> : null}
        {searchingEntrants ? <ActivityIndicator color={presentation.accent} /> : null}
        {competition.kind === 'LEAGUE' ? playerResults.map((player) => (
          <Pressable key={player.sportProfileId} disabled={saving || competition.entrants.some((entrant) => entrant.entrantType === 'PLAYER' && entrant.player.sportProfileId === player.sportProfileId)} onPress={() => void addLeaguePlayer(player)} style={styles.searchResult}>
            <View style={styles.flex}><Text variant="bodyStrong">{player.displayName}</Text><Text variant="caption" tone="muted">Verified {config.name} profile</Text></View><Text variant="overline" style={{ color: presentation.accent }}>ADD</Text>
          </Pressable>
        )) : teamResults.map((team) => (
          <Pressable key={team.id} disabled={saving || competition.entrants.some((entrant) => entrant.entrantType === 'TEAM' && entrant.sourceTeamId === team.id)} onPress={() => void addTournamentTeam(team)} style={styles.searchResult}>
            <View style={[styles.teamColor, { backgroundColor: team.colorHex ?? presentation.accent }]} /><View style={styles.flex}><Text variant="bodyStrong">{team.name}</Text><Text variant="caption" tone="muted">Reusable club team · {team.shortName || 'TEAM'}</Text></View><Text variant="overline" style={{ color: presentation.accent }}>REGISTER</Text>
          </Pressable>
        ))}
        {!searchingEntrants && competition.kind === 'TOURNAMENT' && !teamResults.length ? <Text variant="caption" tone="muted">Create a club and reusable team in My {config.name} before registering a tournament squad.</Text> : null}
      </EntryModal>

      <EntryModal visible={pointsOpen} title="Points system" onClose={() => setPointsOpen(false)}>
        <Text variant="caption" tone="muted">Standings update from completed competition matches.</Text>
        <View style={styles.pointsInputs}>
          <LabeledInput label="WIN" value={winPoints} onChangeText={setWinPoints} />
          <LabeledInput label="LOSS" value={lossPoints} onChangeText={setLossPoints} />
        </View>
        <Button title="Save points system" loading={saving} onPress={() => void savePoints()} fullWidth style={{ backgroundColor: presentation.accent }} />
      </EntryModal>

      <EntryModal visible={scheduleOpen} title={fixtureId ? 'Schedule match' : 'Add match schedule'} onClose={() => setScheduleOpen(false)}>
        {!fixtureId ? (
          <View style={styles.sideSelectors}>
            <EntrantSelector label="SIDE A" selectedId={sideAId} excludedId={sideBId} entrants={competition.entrants} accent={presentation.accent} onSelect={setSideAId} />
            <EntrantSelector label="SIDE B" selectedId={sideBId} excludedId={sideAId} entrants={competition.entrants} accent={presentation.accent} onSelect={setSideBId} />
          </View>
        ) : <Text variant="bodyStrong">{entrantById.get(sideAId ?? '')?.name ?? 'TBD'} <Text tone="dim">vs</Text> {entrantById.get(sideBId ?? '')?.name ?? 'TBD'}</Text>}
        <View><Text variant="overline" tone="dim">DATE AND TIME</Text><TextInput value={scheduleAt} onChangeText={setScheduleAt} placeholder="2026-08-20 18:30" placeholderTextColor={colors.textDim} style={styles.input} /></View>
        <View><Text variant="overline" tone="dim">COURT OR VENUE</Text><TextInput value={court} onChangeText={setCourt} maxLength={50} placeholder="Court 1" placeholderTextColor={colors.textDim} style={styles.input} /></View>
        <Button title="Save schedule" disabled={!scheduleAt.trim() || (!fixtureId && (!sideAId || !sideBId || sideAId === sideBId))} loading={saving} onPress={() => void saveSchedule()} fullWidth style={{ backgroundColor: presentation.accent }} />
      </EntryModal>

      <EntryModal visible={officialsOpen} title="Match officials" onClose={() => setOfficialsOpen(false)}>
        <Text variant="caption" tone="muted">Only you and assigned officials can score. Everyone else can watch in spectator view.</Text>
        <View style={styles.officialList}>
          <OfficialRow name={competition.creatorName} detail="Competition creator" accent={presentation.accent} />
          {competition.officials.map((official) => (
            <OfficialRow
              key={official.accountId}
              name={official.displayName}
              detail="Assigned match official"
              accent={presentation.accent}
              action="REMOVE"
              disabled={officialBusyId === official.accountId}
              onAction={() => removeOfficial(official.accountId, official.displayName)}
            />
          ))}
        </View>
        <TextInput value={officialQuery} onChangeText={setOfficialQuery} placeholder="Search SportStage players" placeholderTextColor={colors.textDim} style={styles.input} />
        {searchingOfficials ? <Text variant="caption" tone="muted">Searching…</Text> : null}
        {!searchingOfficials && officialQuery.trim().length >= 2 && officialResults.length === 0 ? <Text variant="caption" tone="muted">No SportStage players found.</Text> : null}
        {officialResults.map((result) => (
          <OfficialRow
            key={result.id}
            name={result.title}
            detail={result.subtitle || 'SportStage player'}
            accent={presentation.accent}
            action="ASSIGN"
            disabled={Boolean(officialBusyId) || competition.officials.some((official) => official.accountId === result.id)}
            onAction={() => void assignOfficial(result)}
          />
        ))}
      </EntryModal>
    </Screen>
  );
}

function FixtureCard({
  fixture,
  entrantById,
  session,
  complete,
  accent,
  canManage,
  canScore,
  onSchedule,
  onOpen,
}: {
  fixture: ProjectedCompetitionFixture;
  entrantById: ReadonlyMap<string, { name: string }>;
  session?: ScoringSessionRecord;
  complete: boolean;
  accent: string;
  canManage: boolean;
  canScore: boolean;
  onSchedule: () => void;
  onOpen: () => void;
}) {
  const ready = Boolean(fixture.sideAId && fixture.sideBId);
  return (
    <View style={styles.fixtureCard}>
      <View style={[styles.fixtureStripe, { backgroundColor: complete ? colors.gold : accent }]} />
      <View style={styles.fixtureMain}>
        <View style={styles.fixtureTop}>
          <Text variant="overline" style={{ color: complete ? colors.gold : accent }}>{fixture.roundLabel} {fixture.slot}</Text>
          <Text variant="overline" tone="dim">{complete ? 'FINAL' : session ? 'IN PROGRESS' : fixture.isBye ? 'BYE' : 'UPCOMING'}</Text>
        </View>
        <Text variant="bodyStrong" numberOfLines={1}>{entrantById.get(fixture.sideAId ?? '')?.name ?? 'TBD'}</Text>
        <Text variant="caption" tone="dim">vs</Text>
        <Text variant="bodyStrong" numberOfLines={1}>{entrantById.get(fixture.sideBId ?? '')?.name ?? (fixture.isBye ? 'Bye' : 'TBD')}</Text>
        <View style={styles.fixtureMeta}>
          <MaterialCommunityIcons name="calendar-outline" size={15} color={colors.textDim} />
          <Text variant="caption" tone="muted" style={styles.flex}>{fixture.scheduledAt ? new Date(fixture.scheduledAt).toLocaleString() : 'Date and time TBD'}{fixture.court ? ` · ${fixture.court}` : ''}</Text>
        </View>
      </View>
      <View style={styles.fixtureActions}>
        {ready && !fixture.isBye && (session || canScore) ? <Pressable onPress={onOpen} style={[styles.scoreAction, { backgroundColor: accent }]}><MaterialCommunityIcons name={!canScore || complete ? 'eye-outline' : session ? 'play' : 'plus'} size={18} color={colors.accentInk} /><Text variant="overline" style={styles.scoreActionText}>{!canScore || complete ? 'VIEW' : session ? 'RESUME' : 'SCORE'}</Text></Pressable> : null}
        {ready && !complete && canManage ? <Pressable accessibilityLabel="Edit match schedule" onPress={onSchedule} style={styles.iconAction}><MaterialCommunityIcons name="calendar-edit" size={18} color={colors.textMuted} /></Pressable> : null}
      </View>
    </View>
  );
}

function EntrantSelector({ label, selectedId, excludedId, entrants, accent, onSelect }: {
  label: string;
  selectedId?: string;
  excludedId?: string;
  entrants: readonly { id: string; name: string }[];
  accent: string;
  onSelect: (id: string) => void;
}) {
  return <View style={styles.selector}><Text variant="overline" tone="dim">{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorRail}>{entrants.filter((entrant) => entrant.id !== excludedId).map((entrant) => <Pressable key={entrant.id} onPress={() => onSelect(entrant.id)} style={[styles.selectorOption, selectedId === entrant.id && { borderColor: accent, backgroundColor: `${accent}16` }]}><Text variant="caption" style={selectedId === entrant.id ? { color: accent } : undefined}>{entrant.name}</Text></Pressable>)}</ScrollView></View>;
}

function OfficialRow({
  name,
  detail,
  accent,
  action,
  disabled,
  onAction,
}: {
  name: string;
  detail: string;
  accent: string;
  action?: 'ASSIGN' | 'REMOVE';
  disabled?: boolean;
  onAction?: () => void;
}) {
  return (
    <View style={styles.officialRow}>
      <View style={[styles.officialAvatar, { backgroundColor: `${accent}16` }]}><Text variant="bodyStrong" style={{ color: accent }}>{name.trim().charAt(0).toUpperCase() || 'O'}</Text></View>
      <View style={styles.flex}><Text variant="bodyStrong" numberOfLines={1}>{name}</Text><Text variant="caption" tone="muted" numberOfLines={1}>{detail}</Text></View>
      {action ? <Pressable disabled={disabled} onPress={onAction} style={[styles.officialAction, disabled && styles.disabled]}><Text variant="overline" tone={action === 'REMOVE' ? 'danger' : undefined} style={action === 'ASSIGN' ? { color: accent } : undefined}>{action}</Text></Pressable> : null}
    </View>
  );
}

function EntryModal({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.modalCard}><View style={styles.modalHeading}><Text variant="h2">{title}</Text><Pressable accessibilityLabel="Close" onPress={onClose} style={styles.close}><MaterialCommunityIcons name="close" size={21} color={colors.textMuted} /></Pressable></View>{children}</View></View></Modal>;
}

function LabeledInput({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.pointInput}><Text variant="overline" tone="dim">{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType="number-pad" maxLength={2} style={[styles.input, styles.numberInput]} /></View>;
}

function DrawSide({ name, winner }: { name: string; winner: boolean }) {
  return <View style={styles.drawSide}><Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>{name}</Text>{winner ? <MaterialCommunityIcons name="check-circle" size={16} color={colors.gold} /> : null}</View>;
}

function EmptyCard({ icon, title, copy }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; copy: string }) {
  return <View style={styles.empty}><MaterialCommunityIcons name={icon} size={29} color={colors.textDim} /><Text variant="bodyStrong">{title}</Text><Text variant="caption" tone="muted" style={styles.centerText}>{copy}</Text></View>;
}

function SectionHeader({ title }: { title: string }) {
  return <Text variant="overline" tone="dim">{title}</Text>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <View style={styles.metric}><Text variant="scoreMd">{value}</Text><Text variant="overline" tone="dim">{label}</Text></View>;
}

function drawRounds(fixtures: readonly ProjectedCompetitionFixture[]): readonly [string, ProjectedCompetitionFixture[]][] {
  const rounds = new Map<string, ProjectedCompetitionFixture[]>();
  fixtures.forEach((fixture) => rounds.set(fixture.roundLabel, [...(rounds.get(fixture.roundLabel) ?? []), fixture]));
  return [...rounds.entries()];
}

function fixtureSideName(
  entrantId: string | undefined,
  sourceFixtureId: string | undefined,
  entrantById: ReadonlyMap<string, { name: string }>,
  bye = false,
): string {
  if (entrantId) return entrantById.get(entrantId)?.name ?? 'Unknown';
  if (bye) return 'Bye';
  if (sourceFixtureId) return 'Winner of previous match';
  return 'TBD';
}

function nextHour(): number {
  const value = new Date();
  value.setMinutes(0, 0, 0);
  value.setHours(value.getHours() + 1);
  return value.getTime();
}

function formatScheduleInput(timestamp: number): string {
  const value = new Date(timestamp);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  center: { flex: 1, minHeight: 360, padding: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centerText: { textAlign: 'center', lineHeight: 19 },
  hero: { padding: spacing.lg, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 62, height: 62, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  metrics: { paddingVertical: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row' },
  metric: { flex: 1, alignItems: 'center', gap: 2 },
  tabs: { gap: spacing.sm },
  tab: { minWidth: 92, minHeight: 40, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  error: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: 'rgba(224,57,75,0.10)', flexDirection: 'row', gap: spacing.sm },
  sectionStack: { gap: spacing.md },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  smallAction: { minHeight: 36, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: 4 },
  quickGrid: { flexDirection: 'row', gap: spacing.sm },
  quickCard: { flex: 1, minHeight: 110, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.sm },
  officialsCard: { minHeight: 72, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  officialsIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  entrantRow: { minHeight: 58, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  seed: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, alignItems: 'center', gap: spacing.sm },
  fixtureCard: { minHeight: 130, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', overflow: 'hidden' },
  fixtureStripe: { width: 3 },
  fixtureMain: { flex: 1, minWidth: 0, padding: spacing.md, gap: 4 },
  fixtureTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  fixtureMeta: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 5 },
  fixtureActions: { padding: spacing.sm, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  scoreAction: { minWidth: 68, minHeight: 40, paddingHorizontal: spacing.sm, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  scoreActionText: { color: colors.accentInk },
  iconAction: { width: 40, height: 36, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  drawRail: { alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  drawRound: { width: 210, gap: spacing.sm },
  drawMatch: { padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, gap: 5 },
  drawSide: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  drawDivider: { height: 1, backgroundColor: colors.border },
  tableCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  tableRow: { minHeight: 52, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 4 },
  tableHeader: { minHeight: 40, backgroundColor: colors.surfaceElevated },
  rank: { width: 24 },
  number: { width: 34, textAlign: 'center' },
  overlay: { flex: 1, padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.74)', justifyContent: 'center' },
  modalCard: { maxHeight: '88%', padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.md },
  modalHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 38, height: 38, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 50, marginTop: 6, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.bg, color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 15 },
  pointsInputs: { flexDirection: 'row', gap: spacing.sm },
  searchResult: { minHeight: 62, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  teamColor: { width: 7, height: 38, borderRadius: radius.pill },
  officialList: { gap: spacing.sm },
  officialRow: { minHeight: 58, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  officialAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  officialAction: { minWidth: 58, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  pointInput: { flex: 1 },
  numberInput: { textAlign: 'center', fontSize: 20 },
  sideSelectors: { gap: spacing.md },
  selector: { gap: 6 },
  selectorRail: { gap: spacing.sm },
  selectorOption: { minHeight: 38, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  flex: { flex: 1, minWidth: 0 },
});
