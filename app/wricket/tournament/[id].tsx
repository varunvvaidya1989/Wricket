import { FixturePagination, fixturePageSize } from '@/components/wricket/fixtures/FixturePagination';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, Stack } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/wricket/ui/Text';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { LinkRow } from '@/components/wricket/ui/DesignRows';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { SectionRow } from '@/components/wricket/ui/SectionRow';
import { matchStatus } from '@/lib/wricket/presentation/status';
import { StatusBadge } from '@/components/wricket/ui/StatusBadge';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { googleStaticMapUrl } from '@/lib/maps/googlePlaces';
import { Card } from '@/components/wricket/ui/Card';
import { Button } from '@/components/wricket/ui/Button';
import { colors, palette } from '@/lib/wricket/presentation/design';
import { spacing, radius } from '@/lib/theme/spacing';
import {
  getTournament,
  getTournamentByCloudId,
  listTeams,
  listMatches,
  listBalls,
  listInningsForMatch,
  listTeamCaptains,
  listUsers,
  deleteTeam,
} from '@/lib/wricket/db/repo';
import { Tournament, Team, Match, Ball, User, FORMAT_LABEL } from '@/lib/wricket/domain/types';
import { computePointsTable, PointsRow } from '@/lib/wricket/app/points';
import { fixturesApi, GeneratedFixtureSetup } from '@/lib/supabase/fixturesApi';
import { useAuth } from '@/components/providers/AuthProvider';
import { TournamentTeamDirectory } from '@/components/wricket/teams/TournamentTeamDirectory';
import { AddTournamentTeamSheet } from '@/components/wricket/teams/AddTournamentTeamSheet';
import { TournamentMvpLeaderboard } from '@/components/wricket/mvp/TournamentMvpLeaderboard';
import { StandingsCalculator } from '@/lib/wricket/fixtures';
import { tournamentStatsApi } from '@/lib/supabase/tournamentStatsApi';
import {
  scorerManagementApi,
  ScorerSearchResult,
  TournamentScorer,
} from '@/lib/supabase/scorerManagementApi';
import { TournamentShareBanner } from '@/components/wricket/tournament/TournamentShareBanner';
import { TournamentWorkspace } from '@/components/wricket/tournament/TournamentWorkspace';
import { TournamentSponsors } from '@/components/sponsors/TournamentSponsors';
import { tournamentManagementApi } from '@/lib/supabase/tournamentManagementApi';
import { syncTournamentData } from '@/lib/wricket/sync/tournamentSync';
import { teamManagementApi } from '@/lib/supabase/teamManagementApi';
import { TournamentPlayers, TournamentRegistrationManagement } from '@/components/wricket/tournament/TournamentRegistrations';

type Tab = 'fixtures' | 'table' | 'teams' | 'players' | 'stats' | 'settings' | 'about';

interface TournamentPlayerStats {
  id: string;
  name: string;
  runs: number;
  wickets: number;
  matches: number;
  innings: number;
  ballsFaced: number;
  dismissals: number;
  bowlingBalls: number;
  runsConceded: number;
  catches: number;
  stumpings: number;
  recentScores: number[];
  recentWickets: number[];
}

interface TournamentStats {
  matches: number;
  completedMatches: number;
  balls: number;
  runs: number;
  wickets: number;
  players: TournamentPlayerStats[];
}

export default function TournamentDetailScreen() {
  const { id, tab: linkedTab } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const router = useRouter();
  const auth = useAuth();
  const reducedMotion = useReducedMotion();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [captainByTeamId, setCaptainByTeamId] = useState<Map<string, string>>(new Map());
  const [points, setPoints] = useState<PointsRow[]>([]);
  const initialTab = linkedTab && ['fixtures', 'table', 'teams', 'players', 'stats', 'settings', 'about'].includes(linkedTab) ? linkedTab : 'fixtures';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [manageSection, setManageSection] = useState<'details' | 'scorers' | 'sponsors' | 'registrations'>();
  const [loadError, setLoadError] = useState<string>();
  const [progressionError, setProgressionError] = useState<string>();
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showShareBanner, setShowShareBanner] = useState(false);
  const [showChampionCelebration, setShowChampionCelebration] = useState(false);
  const [stats, setStats] = useState<TournamentStats>({
    matches: 0, completedMatches: 0, balls: 0, runs: 0, wickets: 0, players: [],
  });
  const [generatedSetup, setGeneratedSetup] = useState<GeneratedFixtureSetup>({
    stages: [], groups: [], matches: [], bracket: null,
  });
  const [organizerContact, setOrganizerContact] = useState<{ name: string; phone?: string }>({ name: 'Tournament organiser' });
  const [canScore, setCanScore] = useState(false);

  const loadTournament = useCallback(async () => {
    if (!id) return;
    let t = await getTournament(id) ?? await getTournamentByCloudId(id);
    if (!t && auth.session) {
      await syncTournamentData(auth.session.user.id);
      t = await getTournament(id) ?? await getTournamentByCloudId(id);
    }
    if (!t) throw new Error('This tournament is unavailable. Return to My cricket or try again.');
    const [teamList, matchList, users] = await Promise.all([
      listTeams(t.id), listMatches(t.id), listUsers(),
    ]);
    const cloudTeamIds = teamList.flatMap(team => team.cloudId ? [team.cloudId] : []);
    const [cloudLogos, captainNames] = await Promise.all([
      cloudTeamIds.length ? teamManagementApi.listTeamLogos(cloudTeamIds) : Promise.resolve(new Map<string, string | undefined>()),
      listTeamCaptains(teamList.map(team => team.id)),
    ]);
    // A successful cloud read is authoritative for entries removed on another device.
    // Retain any cached match history while excluding those entries from management.
    const visibleTeams = teamList.filter(team => !team.cloudId || cloudLogos.has(team.cloudId));
    if (auth.session) {
      for (const team of teamList) {
        if (team.cloudId && !cloudLogos.has(team.cloudId) && team.syncStatus === 'SYNCED'
          && !matchList.some(match => match.teamAId === team.id || match.teamBId === team.id)) await deleteTeam(team.id);
      }
    }
    const refreshedTeams = visibleTeams.map(team => team.cloudId && cloudLogos.has(team.cloudId)
      ? { ...team, logoUrl: cloudLogos.get(team.cloudId) }
      : team);
    setTournament(t);
    setTeams(refreshedTeams);
    setCaptainByTeamId(captainNames);
    if (t?.cloudId) {
      const contact = auth.session ? await tournamentManagementApi.getOrganizerContact(t.cloudId) : { name: 'Tournament organiser' };
      setOrganizerContact({ name: contact.name, phone: t.organizerProfileId === auth.session?.user.id ? contact.phone : undefined });
      setCanScore(auth.session?.user.id
        ? await scorerManagementApi.canScoreTournament(t.cloudId, auth.session.user.id)
        : false);
    } else {
      setOrganizerContact({ name: 'Tournament organiser', phone: t?.organizerProfileId === auth.session?.user.id ? t.organizerPhone : undefined });
      setCanScore(t?.organizerProfileId === auth.session?.user.id);
    }
    setMatches(matchList);
    if (t?.cloudId && t.organizerProfileId === auth.session?.user.id) {
      try { await fixturesApi.advanceTournamentIfReady(t.cloudId); setProgressionError(undefined); }
      catch (cause) { setProgressionError(cause instanceof Error ? cause.message : 'The bracket needs review.'); }
    }
    setGeneratedSetup(t?.cloudId
      ? await fixturesApi.getFixtureSetup(t.cloudId)
      : { stages: [], groups: [], matches: [], bracket: null });
    const pts = await computePointsTable(t.id);
    setPoints(pts.filter(row => visibleTeams.some(team => team.id === row.teamId)));
    setStats(t?.cloudId
      ? await tournamentStatsApi.get(t.cloudId)
      : await buildTournamentStats(matchList, users));
  }, [auth.session, id]);

  const refresh = useCallback(async () => {
    try { await loadTournament(); setLoadError(undefined); }
    catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Could not load tournament'); }
  }, [loadTournament]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!tournament?.cloudId) return;
    return fixturesApi.subscribeToTournament(tournament.cloudId, () => {
      void refresh().catch(() => undefined);
    });
  }, [refresh, tournament?.cloudId]);

  const championTeam = tournamentChampion(generatedSetup, teams);
  const championTeamId = championTeam?.id;
  useEffect(() => {
    if (championTeamId && !reducedMotion) setShowChampionCelebration(true);
  }, [championTeamId, reducedMotion]);

  useEffect(() => {
    setTab(linkedTab && ['fixtures', 'table', 'teams', 'players', 'stats', 'settings', 'about'].includes(linkedTab) ? linkedTab : 'fixtures');
  }, [linkedTab]);
  const selectTab = (next: Tab) => { setManageSection(undefined); router.setParams({ tab: next }); };

  if (!tournament) {
    return <Screen padded={false}><Stack.Screen options={{ headerShown: false }} /><WricketHeader title="Tournament" backTo="/wricket/my-wricket" />
      {loadError ? <StateNotice error title="Tournament unavailable" detail={loadError} action={{ label: 'Try again', onPress: () => void refresh() }} />
        : <SportStageLoader message="Opening tournament" detail="Loading teams, fixtures, and standings" />}</Screen>;
  }

  const overviewNode = <View style={{ gap: 14 }}>
    <View><Text variant="overline" tone="muted">{tournament.name}</Text>
      <Text variant="h1" style={{ marginTop: 8 }}>Cricket brings{'\n'}the community together.</Text>
      {tournament.description ? <Text style={{ fontSize: 12, lineHeight: 19.8, marginTop: 9 }} tone="muted">{tournament.description}</Text> : null}</View>
    <Card>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><DesignIcon name="calendar" /><Text variant="caption">{formatTournamentDate(tournament.startDate)}{tournament.endDate ? ` – ${formatTournamentDate(tournament.endDate)}` : ''}</Text></View>
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 14 }} />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><DesignIcon name="bat" /><Text variant="caption">{FORMAT_LABEL[tournament.format]} · {tournament.oversPerMatch} overs · {tournament.playersPerTeam}-a-side</Text></View>
    </Card>
    {tournament.location ? <View><Text variant="overline" tone="muted">The venue</Text><Text variant="h3" style={{ marginVertical: 9 }}>{tournament.location}</Text>
      {tournament.latitude != null && tournament.longitude != null && googleStaticMapUrl(tournament.latitude, tournament.longitude) ? <Image source={{ uri: googleStaticMapUrl(tournament.latitude!, tournament.longitude!) }} style={{ height: 126, borderRadius: 11 }} /> : null}
    </View> : null}
    <Card style={{ backgroundColor: 'transparent' }}><Text variant="overline" tone="muted">Organised by</Text>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 12 }}><View style={{ width: 33, height: 33, borderRadius: 17, backgroundColor: '#34472f', alignItems: 'center', justifyContent: 'center' }}><Text variant="mono" style={{ fontSize: 10 }}>{organizerContact.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</Text></View><Text variant="h3" style={{ flex: 1 }}>{organizerContact.name}</Text></View>
      {tournament.socialMediaUrl ? <Button title="Visit tournament social page ↗" variant="ghost" size="sm" onPress={() => void Linking.openURL(tournament.socialMediaUrl!)} /> : null}
    </Card>
    <LinkRow title="Match moments" detail="Photos and stories from the boundary" icon="image" onPress={() => router.push({ pathname: '/wricket/tournament/[id]/moments', params: { id: tournament.id } })} />
    {tournament.cloudId ? <TournamentSponsors parent={{ kind: 'cricket', id: tournament.cloudId }} /> : null}
  </View>;

  const tabBarNode = <SectionRow label="Tournament sections" selected={tab} onSelect={selectTab}
    items={[{ id: 'fixtures', label: 'Matches' }, { id: 'table', label: 'Standings' }, { id: 'teams', label: 'Teams' }, { id: 'players', label: 'Players' }, { id: 'stats', label: 'Stats' }]} />;

  const tabContentNode = <View style={[styles.tabContent, (tab === 'teams' || tab === 'players' || (tab === 'settings' && manageSection === 'registrations')) && { paddingHorizontal: 0 }]}>
          {tab === 'fixtures' && (
            <FixturesView
              matches={matches}
              generatedSetup={generatedSetup}
              teams={teams}
              tournament={tournament}
              canManage={tournament.organizerProfileId === auth.session?.user.id}
              canScore={canScore}
              onChanged={refresh}
            />
          )}
          {tab === 'table' && (
            <PointsTableView rows={points} teams={teams} generatedSetup={generatedSetup} />
          )}
          {tab === 'teams' && (
            <TournamentTeamDirectory
              tournamentId={tournament.cloudId}
              accountId={auth.session?.user.id}
              teams={teams}
              setup={generatedSetup}
              plannedCount={tournament.plannedTeamCount}
              canManage={tournament.organizerProfileId === auth.session?.user.id}
              onAdd={() => setShowAddTeam(true)}
              onRemove={async team => {
                if (!tournament.cloudId || !team.cloudId) throw new Error('Connect and sync this tournament before removing a team.');
                await teamManagementApi.removeTournamentTeam(tournament.cloudId, team.cloudId);
                setTeams(current => current.filter(item => item.id !== team.id));
                try { await deleteTeam(team.id); await refresh(); }
                catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Team removed online. Refresh the tournament to update this device.'); }
              }}
            />
          )}
          {tab === 'players' && (tournament.cloudId ? <TournamentPlayers tournamentId={tournament.cloudId} accountId={auth.session?.user.id} owner={tournament.organizerProfileId === auth.session?.user.id} /> : <StateNotice title="Connect to view registrations" detail="Player registrations are available for online tournaments." />)}
          {tab === 'stats' && (
            <View style={styles.statsPanelContent}>
              <TournamentStatsView stats={stats} />
              <TournamentMvpLeaderboard
                tournamentId={tournament.id}
                cloudTournamentId={tournament.cloudId}
                completedMatches={stats.completedMatches}
              />
            </View>
          )}
          {tab === 'settings' && tournament.organizerProfileId === auth.session?.user.id && (
            !manageSection ? <TournamentWorkspace tournament={tournament} teamCount={teams.length} setup={generatedSetup} onAction={action => {
              if (action === 'teams') selectTab('teams');
              else if (action === 'view') selectTab('fixtures');
              else if (action === 'fixtures' || action === 'bracket') router.push({ pathname: '/wricket/tournament/[id]/fixtures', params: { id: tournament.id, focus: action === 'bracket' ? 'knockout' : 'plan' } });
              else setManageSection(action);
            }} /> : manageSection === 'registrations' ? tournament.cloudId && auth.session ? <TournamentRegistrationManagement tournamentId={tournament.cloudId} accountId={auth.session.user.id} teamCount={teams.length} onTeamsChanged={async () => { if (auth.session) await syncTournamentData(auth.session.user.id); await refresh(); }} /> : <StateNotice title="Connect to manage registrations" detail="Sync your tournament to publish and review applications." /> : manageSection === 'sponsors' ? tournament.cloudId ? <TournamentSponsors parent={{ kind: 'cricket', id: tournament.cloudId }} canManage /> : <Text tone="muted">Sync this tournament before managing sponsors.</Text> : <TournamentSettingsView
              tournament={{ ...tournament, organizerPhone: organizerContact.phone }}
              teams={teams}
              hasGenerated={generatedSetup.stages.length > 0}
              section={manageSection}
              onChanged={refresh}
            />
          )}
        </View>;

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <WricketHeader title={tab === 'settings' ? 'Manage tournament' : tab === 'about' ? 'About the tournament' : tab === 'fixtures' ? 'Tournament' : tournament.name}
        backTo="/wricket/my-wricket" onBack={tab === 'settings' && manageSection ? () => setManageSection(undefined) : tab === 'about' || tab === 'settings' ? () => selectTab('fixtures') : undefined}>
        {tab !== 'about' && tab !== 'settings' ? <Pressable accessibilityRole="button" accessibilityLabel="Share tournament" onPress={() => setShowShareBanner(true)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><DesignIcon name="share" /></Pressable> : null}
      </WricketHeader>
      {tab === 'fixtures' ? <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><View style={{ width: 46, height: 46, borderRadius: 14, borderWidth: 1, borderColor: '#465e38', backgroundColor: '#243c22', alignItems: 'center', justifyContent: 'center' }}><DesignIcon name="trophy" size={24} color={colors.accent} /></View><StatusBadge kind="tournament" status={tournament.status} /></View>
        <Text variant="h2" style={{ marginTop: 10 }}>{tournament.name}</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontSize: 10, flex: 1 }} tone="muted">{formatTournamentDate(tournament.startDate)} · {FORMAT_LABEL[tournament.format]}</Text><Button title="About" size="sm" variant="ghost" onPress={() => selectTab('about')} /></View>
      </View> : null}
      {tab !== 'about' && tab !== 'settings' ? tabBarNode : null}
      {loadError ? <StateNotice error title="Could not refresh tournament" detail={loadError} action={{ label: 'Try again', onPress: () => void refresh() }} /> : null}
      {progressionError ? <StateNotice title="Bracket needs review" detail={progressionError} action={{ label: 'Review bracket', onPress: () => router.push({ pathname: '/wricket/tournament/[id]/fixtures', params: { id: tournament.id, focus: 'knockout' } }) }} /> : null}
      <ChampionCelebration team={championTeam} visible={showChampionCelebration} onClose={() => setShowChampionCelebration(false)} />
      <ScrollView testID="tournament-detail-scroll" style={styles.pageScroll} contentContainerStyle={[styles.overviewContent, { paddingHorizontal: 18, paddingTop: 19, gap: 14 }]} showsVerticalScrollIndicator={false}>
        {tab === 'fixtures' && tournament.organizerProfileId === auth.session?.user.id ? <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text variant="overline" tone="muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Text><Button title="Manage" size="sm" variant="ghost" onPress={() => selectTab('settings')} /></View> : null}
        {tab === 'about' ? overviewNode : tab === 'settings' && tournament.organizerProfileId !== auth.session?.user.id
          ? <StateNotice title="Owner access required" detail="Tournament management is available to the tournament owner." action={{ label: 'View matches', onPress: () => selectTab('fixtures') }} />
          : tabContentNode}
      </ScrollView>

      <AddTournamentTeamSheet
        visible={showAddTeam}
        tournament={tournament}
        onClose={() => setShowAddTeam(false)}
        onSaved={async () => {
          setShowAddTeam(false);
          try {
            if (auth.session) await syncTournamentData(auth.session.user.id);
            await refresh();
          } catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Team was saved. Try refreshing the tournament.'); }
        }}
      />
      <TournamentShareBanner
        tournament={tournament}
        teams={teams}
        captainByTeamId={captainByTeamId}
        fixtureSetup={generatedSetup}
        visible={showShareBanner}
        onClose={() => setShowShareBanner(false)}
      />
    </Screen>
  );
}


function FixturesView({
  matches,
  generatedSetup,
  teams,
  tournament,
  canManage,
  canScore,
  onChanged,
}: {
  matches: Match[];
  generatedSetup: GeneratedFixtureSetup;
  teams: Team[];
  tournament: Tournament;
  canManage: boolean;
  canScore: boolean;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const [section, setSection] = useState<'UPCOMING' | 'LIVE' | 'PAST'>('UPCOMING');
  const [fixturePage, setFixturePage] = useState(0);
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const cloudTeamMap = new Map(teams.filter(t => t.cloudId).map(t => [t.cloudId!, t]));
  const groupMap = new Map(generatedSetup.groups.map(group => [group.id, group.name]));
  const stageMap = new Map(generatedSetup.stages.map(stage => [stage.id, stage.type]));
  const generatedCanonicalIds = new Set(
    generatedSetup.matches.flatMap(match => match.canonicalMatchId ? [match.canonicalMatchId] : []),
  );
  const sortedMatches = matches.filter(match =>
    !generatedCanonicalIds.has(match.id) && matchSectionLabel(match) === section);
  const generatedMatches = generatedSetup.matches.filter(item =>
    section === 'UPCOMING'
      ? item.status === 'SCHEDULED'
      : section === 'LIVE'
        ? item.status === 'LIVE'
        : item.status === 'COMPLETED' || item.status === 'WALKOVER',
  );

  const total = generatedMatches.length + sortedMatches.length;
  const currentPage = Math.min(fixturePage, Math.max(0, Math.ceil(total / fixturePageSize) - 1));
  const start = currentPage * fixturePageSize, end = start + fixturePageSize;
  const shownGenerated = generatedMatches.slice(start, end);
  const shownMatches = sortedMatches.slice(Math.max(0, start - generatedMatches.length), Math.max(0, end - generatedMatches.length));
  if (matches.length === 0 && generatedSetup.matches.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingTop: spacing.xxl }}>
        <Text variant="body" tone="muted" style={{ marginBottom: spacing.lg, textAlign: 'center' }}>
          No matches yet. {teams.length < 2 ? 'Add teams first, then schedule a match.' : 'Schedule a match between two teams.'}
        </Text>
        <Text variant="caption" tone="dim">Use Tournament Settings to generate fixtures or start a match.</Text>
      </View>
    );
  }

  return (
    <FlatList
      scrollEnabled={false}
      data={shownMatches}
      keyExtractor={m => m.id}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: spacing.xxxl }}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
          <View style={styles.fixtureTabs}>
            {(['UPCOMING', 'LIVE', 'PAST'] as const).map(item => (
              <Pressable
                key={item}
                accessibilityRole="tab" accessibilityLabel={`Fixtures ${item.toLowerCase()}`} aria-selected={section === item} accessibilityState={{ selected: section === item }}
                onPress={() => { setSection(item); setFixturePage(0); }}
                style={[styles.fixtureTab, section === item && styles.fixtureTabActive]}
              >
                <Text variant="caption" tone={section === item ? 'accent' : 'muted'}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <FixturePagination total={total} page={currentPage} onPage={setFixturePage} />
          {shownGenerated.length > 0 && (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {shownGenerated.map(item => {
                const teamA = cloudTeamMap.get(item.teamA);
                const teamB = item.teamB ? cloudTeamMap.get(item.teamB) : undefined;
                return (
                  <Card
                    key={item.id}
                    onPress={item.canonicalMatchId ? () => router.push({
                      pathname: '/wricket/match/[id]/live',
                      params: {
                        id: item.canonicalMatchId!,
                        tab: item.status === 'COMPLETED' || item.status === 'WALKOVER'
                          ? 'insights'
                          : 'summary',
                      },
                    }) : undefined}
                  >
                    <View style={styles.generatedMeta}>
                      <Text variant="caption" tone="dim">
                        {item.groupId ? groupMap.get(item.groupId) ?? 'GROUP' : stageMap.get(item.stageId) ?? 'TOURNAMENT'} · {fixtureRoundLabel(item.round, stageMap.get(item.stageId), item.roundId)}
                        {item.leg > 1 ? ` · LEG ${item.leg}` : ''}
                      </Text>
                      {item.status === 'COMPLETED' || item.status === 'WALKOVER' ? <Text variant="caption" tone="muted">Final score</Text> : null}
                    </View>
                    <View style={styles.generatedTeams}>
                      <Text variant="bodyStrong" style={styles.generatedTeamName}>
                        {teamA?.name ?? 'TBD'}
                      </Text>
                      <Text variant="caption" tone="dim">vs</Text>
                      <Text variant="bodyStrong" style={styles.generatedTeamName}>
                        {item.teamB ? teamB?.name ?? 'TBD' : 'BYE'}
                      </Text>
                    </View>
                    {item.status === 'SCHEDULED' && (
                      <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
                        {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : 'Date and time to be confirmed'}
                        {item.venue ? ` · ${item.venue}` : ' · Location to be confirmed'}
                      </Text>
                    )}
                    {item.status === 'LIVE' && item.liveScore && (
                      <View style={styles.liveScoreStrip}>
                        <View style={{ flex: 1 }}>
                          <Text variant="caption" tone="accent">● LIVE · {(item.liveScore.battingTeamId ? cloudTeamMap.get(item.liveScore.battingTeamId) : teamA)?.shortName ?? 'BATTING'}</Text>
                          {item.liveScore.target != null ? <Text variant="caption" tone="muted">Target {item.liveScore.target} · Need {Math.max(0, item.liveScore.target - item.liveScore.runs)}</Text> : null}
                        </View>
                        <Text variant="h2" tone="accent">{item.liveScore.runs}/{item.liveScore.wickets}</Text>
                        <Text variant="caption" tone="muted">{Math.floor(item.liveScore.legalBalls / 6)}.{item.liveScore.legalBalls % 6} OV</Text>
                      </View>
                    )}
                    {(item.status === 'COMPLETED' || item.status === 'WALKOVER') && (
                      <>
                        <Text variant="bodyStrong" tone="muted" style={{ marginTop: spacing.sm }}>
                          {formatFixtureResult(item.result, [
                            teamA && { id: item.teamA, name: teamA.name },
                            teamB && item.teamB && { id: item.teamB, name: teamB.name },
                          ].filter((team): team is { id: string; name: string } => Boolean(team)))}
                        </Text>
                        {item.canonicalMatchId && (
                          <Pressable
                            style={styles.insightsLink}
                            onPress={() => router.push({
                              pathname: '/wricket/match/[id]/live',
                              params: { id: item.canonicalMatchId!, tab: 'insights' },
                            })}
                          ><Text variant="caption" tone="accent">MATCH INSIGHTS ›</Text></Pressable>
                        )}
                      </>
                    )}
                    {canScore && item.status === 'LIVE' && item.canonicalMatchId && (
                      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                        <Button
                          title="Resume scoring"
                          size="sm"
                          style={{ flex: 1 }}
                          onPress={() => router.push({
                            pathname: '/wricket/match/[id]/score',
                            params: { id: item.canonicalMatchId! },
                          })}
                        />
                        <Button
                          title="Live feed"
                          size="sm"
                          variant="secondary"
                          style={{ flex: 1 }}
                          onPress={() => router.push({
                            pathname: '/wricket/match/[id]/live',
                            params: { id: item.canonicalMatchId! },
                          })}
                        />
                      </View>
                    )}
                    {!canScore && item.status === 'LIVE' && item.canonicalMatchId && (
                      <Button
                        title="Watch live"
                        size="sm"
                        style={{ marginTop: spacing.md }}
                        onPress={() => router.push({
                          pathname: '/wricket/match/[id]/live',
                          params: { id: item.canonicalMatchId! },
                        })}
                      />
                    )}
                    {canScore && item.status === 'SCHEDULED' && item.canonicalMatchId && item.teamB && teamA && teamB && (
                      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                        <Button title="Start match" size="sm" style={{ flex: 1 }} onPress={() => router.push({
                          pathname: '/wricket/match/new',
                          params: {
                            tournamentId: tournament.id,
                            teamAId: teamA.id,
                            teamBId: teamB.id,
                            canonicalMatchId: item.canonicalMatchId,
                            format: tournament.format,
                          },
                        })} />
                        {canManage && <Button title="Delete" size="sm" variant="secondary" onPress={() => {
                          Alert.alert('Delete fixture?', 'This fixture will be removed from the schedule.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => fixturesApi.deleteMatch(item.id).then(onChanged).catch(showFixtureError) },
                          ]);
                        }} />}
                        {canManage && <Button title="Edit" size="sm" variant="secondary" onPress={() => router.push({
                          pathname: '/wricket/match/new',
                          params: {
                            tournamentId: tournament.id,
                            teamAId: teamA.id,
                            teamBId: teamB.id,
                            canonicalMatchId: item.canonicalMatchId,
                            editFixtureId: item.id,
                            scheduledAt: item.scheduledAt,
                            venue: tournament.location,
                          },
                        })} />}
                      </View>
                    )}
                  </Card>
                );
              })}
            </View>
          )}
          {generatedMatches.length === 0 && sortedMatches.length === 0 && (
            <Text variant="body" tone="muted" style={{ textAlign: 'center', marginTop: spacing.xl }}>
              No {section.toLowerCase()} matches.
            </Text>
          )}
        </View>
      }
      renderItem={({ item, index }) => {
        const a = teamMap.get(item.teamAId);
        const b = teamMap.get(item.teamBId);
        const isCompleted = item.status === 'COMPLETED';
        return (
          <View style={{ gap: spacing.sm }}>
          <Card
            onPress={() =>
              router.push({
                pathname: matchStatus(item.status).terminal || !canScore ? '/wricket/match/[id]/live' : '/wricket/match/[id]/score',
                params: isCompleted ? { id: item.id, tab: 'insights' } : { id: item.id },
              })
            }
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={[styles.teamDot, { backgroundColor: a?.colorHex ?? palette.ink400 }]} />
                  <Text variant="bodyStrong">{a?.name ?? '—'}</Text>
                </View>
                <Text variant="caption" tone="dim" style={{ marginVertical: 2 }}>vs</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={[styles.teamDot, { backgroundColor: b?.colorHex ?? palette.ink400 }]} />
                  <Text variant="bodyStrong">{b?.name ?? '—'}</Text>
                </View>
              </View>
              <StatusBadge status={item.status} />
              {isCompleted && (
                <Text variant="caption" tone="muted" style={{ maxWidth: 150, textAlign: 'right' }}>
                  {formatFixtureResult(
                    item.result as unknown as Record<string, unknown> | undefined,
                    [
                      a && { id: item.teamAId, name: a.name },
                      b && { id: item.teamBId, name: b.name },
                    ].filter((team): team is { id: string; name: string } => Boolean(team)),
                  )}
                </Text>
              )}
              {item.status === 'SETUP' && (
                <Text variant="caption" tone="muted">Setup</Text>
              )}
            </View>
          </Card>
          </View>
        );
      }}
    />
  );
}

function PointsTableView({
  rows, teams, generatedSetup,
}: { rows: PointsRow[]; teams: Team[]; generatedSetup: GeneratedFixtureSetup }) {
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const router = useRouter();
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const cloudTeamMap = new Map(teams.filter(team => team.cloudId).map(team => [team.cloudId!, team]));
  const groupStage = generatedSetup.stages.find(stage => stage.type === 'GROUP');
  const groupTables = groupStage
    ? generatedSetup.groups.filter(group => group.stage_id === groupStage.id).map(group => ({
        group,
        rows: new StandingsCalculator().calculate(
          {
            id: group.id,
            stageId: group.stage_id,
            name: group.name,
            teamIds: group.team_ids,
          },
          generatedSetup.matches,
          groupStage.config?.pointsRule,
          groupStage.config?.tiebreakers,
        ),
      }))
    : [];
  const bracket = generatedSetup.bracket;
  const fixtureById = new Map(generatedSetup.matches.map(match => [match.id, match]));
  const bracketRounds = bracket?.rounds.filter(round => round.name !== '3RD_PLACE' || round.matches.length) ?? [];
  const finalBracketMatch = bracketRounds[bracketRounds.length - 1]?.matches[0];
  const finalFixture = finalBracketMatch ? fixtureById.get(finalBracketMatch.id) : undefined;
  const championId = finalFixture?.result && (finalFixture.result.winnerTeamId ?? finalFixture.result.winner_team_id);
  const champion = typeof championId === 'string' ? cloudTeamMap.get(championId) : undefined;
  const toggleTeam = (teamId: string) => setExpandedTeams(current => {
    const next = new Set(current);
    if (next.has(teamId)) next.delete(teamId); else next.add(teamId);
    return next;
  });
  const pointsRowFor = (teamId: string) => {
    const team = cloudTeamMap.get(teamId) ?? teamMap.get(teamId);
    return rows.find(row => row.teamId === teamId || row.teamId === team?.id || row.teamId === team?.cloudId);
  };
  if (rows.length === 0 && groupTables.length === 0 && !bracket) {
    return (
      <Text variant="body" tone="muted" style={{ textAlign: 'center', paddingTop: spacing.xxl }}>
        Points table appears once matches are played.
      </Text>
    );
  }
  return (
    <View style={styles.publicTables}>
      {groupTables.map(({ group, rows: standings }) => (
        <Card key={group.id}>
          <Text variant="h3">{group.name}</Text>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text variant="caption" tone="muted" style={{ width: 24 }}>#</Text>
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>TEAM</Text>
            <Text variant="caption" tone="muted" style={styles.numCol}>P</Text>
            <Text variant="caption" tone="muted" style={styles.numCol}>W</Text>
            <Text variant="caption" tone="muted" style={styles.numCol}>L</Text>
            <Text variant="caption" tone="muted" style={styles.numCol}>NR</Text>
            <Text variant="caption" tone="muted" style={styles.numCol}>PTS</Text>
            <Text variant="caption" tone="muted" style={[styles.numCol, { width: 52 }]}>NRR</Text>
          </View>
          {standings.map(standing => {
            const team = cloudTeamMap.get(standing.teamId);
            const groupMatches = generatedSetup.matches.filter(match => match.groupId === group.id);
            const historyRow = generatedPointsHistory(
              standing.teamId,
              groupMatches,
              groupStage?.config?.pointsRule,
            ) ?? pointsRowFor(standing.teamId);
            const expanded = expandedTeams.has(standing.teamId);
            return (
              <View key={standing.teamId}>
              <Pressable style={styles.tableRow} onPress={() => toggleTeam(standing.teamId)}>
                <Text variant="bodyStrong" style={{ width: 24 }}>{standing.rank}</Text>
                <Text variant="bodyStrong" style={{ flex: 1 }}>{team?.shortName ?? '—'}</Text>
                <Text variant="body" style={styles.numCol}>{standing.played}</Text>
                <Text variant="body" style={styles.numCol}>{standing.won}</Text>
                <Text variant="body" style={styles.numCol}>{standing.lost}</Text>
                <Text variant="body" style={styles.numCol}>{standing.noResult}</Text>
                <Text variant="bodyStrong" tone="accent" style={styles.numCol}>{standing.points}</Text>
                <Text variant="body" style={[styles.numCol, { width: 52 }]}>
                  {groupNetRunRate(standing.teamId, generatedSetup.matches.filter(match => match.groupId === group.id))}
                </Text>
                <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </Pressable>
              {expanded ? <PointsHistory row={historyRow} teams={teams} /> : null}
              </View>
            );
          })}
        </Card>
      ))}
      {bracket && (
        <View>
          <Text variant="overline" tone="dim" style={{ marginBottom: spacing.sm }}>KNOCKOUT BRACKET</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bracketRail}>
          {bracketRounds.map((round, roundIndex, rounds) => {
            const isFinal = roundIndex === rounds.length - 1 || round.name === 'FINAL';
            return <React.Fragment key={round.id}><View style={styles.bracketColumn}>
              <Text variant="overline" tone="muted" style={isFinal ? { color: colors.gold } : undefined}>{knockoutRoundLabel(round.name)}</Text>
              <View style={styles.bracketMatches}>
              {round.matches.length ? round.matches.map(match => {
                const fixture = fixtureById.get(match.id);
                const teamA = cloudTeamMap.get(match.teamA);
                const teamB = match.teamB ? cloudTeamMap.get(match.teamB) : undefined;
                const teamAStats = fixture?.teamInningsStats?.[match.teamA];
                const teamBStats = match.teamB ? fixture?.teamInningsStats?.[match.teamB] : undefined;
                const winnerId = fixture?.result && (fixture.result.winnerTeamId ?? fixture.result.winner_team_id);
                const resultText = fixture?.result ? formatFixtureResult(fixture.result, [
                  teamA && { id: match.teamA, name: teamA.name },
                  teamB && match.teamB && { id: match.teamB, name: teamB.name },
                ].filter((team): team is { id: string; name: string } => Boolean(team))) : undefined;
                const completedMatchId = fixture && (fixture.status === 'COMPLETED' || fixture.status === 'WALKOVER')
                  ? fixture.canonicalMatchId
                  : undefined;
                return <Pressable
                  key={match.id}
                  disabled={!completedMatchId}
                  accessibilityRole={completedMatchId ? 'button' : undefined}
                  accessibilityLabel={completedMatchId ? 'Open match insights' : undefined}
                  onPress={() => completedMatchId && router.push({ pathname: '/wricket/match/[id]/live', params: { id: completedMatchId } })}
                  style={[styles.bracketMatch, isFinal && styles.bracketFinal, completedMatchId && styles.bracketMatchClickable]}
                >
                  <BracketScoreRow team={teamA?.shortName ?? 'TBD'} stat={teamAStats} fallback={fixture?.scoreA ?? match.scoreA} winner={winnerId === match.teamA} />
                  <View style={styles.bracketTeamDivider} />
                  <BracketScoreRow team={match.teamB ? teamB?.shortName ?? 'TBD' : 'BYE'} stat={teamBStats} fallback={fixture?.scoreB ?? match.scoreB} winner={Boolean(match.teamB && winnerId === match.teamB)} />
                  {resultText ? <Text variant="caption" tone="muted" style={styles.bracketResult}>{resultText}</Text> : null}
                </Pressable>;
              }) : (
                <Text variant="caption" tone="dim">Awaiting qualifiers</Text>
              )}
              </View>
            </View>{!isFinal ? <View style={styles.bracketConnector}><View style={styles.bracketConnectorFork} /><View style={styles.bracketConnectorLine} /></View> : null}</React.Fragment>
          })}
          {champion ? <View style={styles.championColumn}><MaterialCommunityIcons name="trophy" size={30} color={colors.gold} /><Text variant="h3" style={{ color: colors.gold }}>{champion.shortName}</Text><Text variant="overline" style={{ color: colors.gold }}>CHAMPION</Text></View> : null}
          </ScrollView>
        </View>
      )}
      {groupTables.length === 0 && rows.length > 0 && (
        <Card>
          <Text variant="h3">Overall table</Text>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text variant="caption" tone="muted" style={{ width: 24 }}>#</Text>
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>TEAM</Text>
            {['P', 'W', 'L', 'NR', 'PTS'].map(label => <Text key={label} variant="caption" tone="muted" style={styles.numCol}>{label}</Text>)}
            <Text variant="caption" tone="muted" style={[styles.numCol, { width: 52 }]}>NRR</Text>
          </View>
          {rows.map((row, index) => <View key={row.teamId}>
            <Pressable style={styles.tableRow} onPress={() => toggleTeam(row.teamId)}>
              <Text variant="bodyStrong" style={{ width: 24 }}>{index + 1}</Text>
              <Text variant="bodyStrong" style={{ flex: 1 }}>{teamMap.get(row.teamId)?.shortName ?? '—'}</Text>
              {[row.played, row.won, row.lost, row.noResult].map((value, column) => <Text key={column} variant="body" style={styles.numCol}>{value}</Text>)}
              <Text variant="bodyStrong" tone="accent" style={styles.numCol}>{row.points}</Text>
              <Text variant="body" style={[styles.numCol, { width: 52 }]}>{formatNrr(row.nrr)}</Text>
              <MaterialCommunityIcons name={expandedTeams.has(row.teamId) ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>
            {expandedTeams.has(row.teamId) ? <PointsHistory row={row} teams={teams} /> : null}
          </View>)}
        </Card>
      )}
    </View>
  );
}

function tournamentChampion(setup: GeneratedFixtureSetup, teams: Team[]): Team | undefined {
  const finalRound = setup.bracket?.rounds.find(round => round.name === 'F' || round.name === 'FINAL');
  const finalTemplate = finalRound?.matches[0];
  if (!finalTemplate) return undefined;
  const fixture = setup.matches.find(match => match.id === finalTemplate.id);
  if (!fixture || (fixture.status !== 'COMPLETED' && fixture.status !== 'WALKOVER')) return undefined;
  const winnerId = fixture.result?.winnerTeamId ?? fixture.result?.winner_team_id;
  return typeof winnerId === 'string' ? teams.find(team => team.cloudId === winnerId || team.id === winnerId) : undefined;
}

function ChampionCelebration({ team, visible, onClose }: { team?: Team; visible: boolean; onClose: () => void }) {
  if (!team) return null;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.celebrationBackdrop} onPress={onClose}>
      <View style={styles.celebrationCard}>
        <View style={styles.confettiRow}>{['◆', '●', '★', '◆', '●'].map((shape, index) => <Text key={index} variant="h2" style={{ color: [colors.accent, colors.gold, colors.six][index % 3] }}>{shape}</Text>)}</View>
        <MaterialCommunityIcons name="trophy-award" size={82} color={colors.gold} />
        <Text variant="overline" style={{ color: colors.gold }}>TOURNAMENT CHAMPIONS</Text>
        <Text variant="h1" style={{ textAlign: 'center' }}>{team.name}</Text>
        <Text variant="body" tone="muted" style={{ textAlign: 'center' }}>Congratulations on lifting the SportStage trophy!</Text>
        <Button title="Celebrate" onPress={onClose} fullWidth />
      </View>
    </Pressable>
  </Modal>;
}

function PointsHistory({ row, teams }: { row?: PointsRow; teams: Team[] }) {
  if (!row?.history.length) {
    return <Text variant="caption" tone="muted" style={styles.pointsHistoryEmpty}>No completed match history yet.</Text>;
  }
  const teamMap = new Map(teams.flatMap(team => [[team.id, team] as const, ...(team.cloudId ? [[team.cloudId, team] as const] : [])]));
  return <View style={styles.pointsHistory}>
    {row.history.map((entry, index) => (
      <View key={entry.matchId} style={styles.pointsHistoryRow}>
        <View style={[styles.resultBadge, entry.result === 'W' ? styles.resultWin : entry.result === 'L' ? styles.resultLoss : styles.resultNeutral]}>
          <Text variant="caption" style={styles.resultBadgeText}>{entry.result}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">vs {teamMap.get(entry.opponentTeamId)?.shortName ?? 'Opponent'}</Text>
          <Text variant="caption" tone="muted">{entry.scheduledAt ? new Date(entry.scheduledAt).toLocaleDateString() : `Match ${index + 1}`}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="caption" tone="accent">+{entry.pointsAwarded} → {entry.cumulativePoints} pts</Text>
          <Text variant="caption" tone="muted">NRR {formatNrr(entry.nrrAfterMatch)}</Text>
        </View>
      </View>
    ))}
  </View>;
}

function generatedPointsHistory(
  teamId: string,
  matches: GeneratedFixtureSetup['matches'],
  pointsRule?: { win: number; draw: number; loss: number },
): PointsRow | undefined {
  const completed = matches
    .filter(match =>
      (match.status === 'COMPLETED' || match.status === 'WALKOVER') &&
      String(match.result?.kind ?? match.result?.result_kind ?? '') !== 'CANCELLED' &&
      (match.teamA === teamId || match.teamB === teamId))
    .sort((a, b) => Date.parse(a.scheduledAt ?? '') - Date.parse(b.scheduledAt ?? ''));
  if (!completed.length) return undefined;
  let cumulativePoints = 0;
  let runsFor = 0; let ballsFor = 0; let runsAgainst = 0; let ballsAgainst = 0;
  const history = completed.map(match => {
    const opponentTeamId = match.teamA === teamId ? match.teamB! : match.teamA;
    const kind = String(match.result?.kind ?? match.result?.result_kind ?? '');
    const winnerId = match.result?.winnerTeamId ?? match.result?.winner_team_id;
    let result: 'W' | 'L' | 'T' | 'D' | 'NR';
    let pointsAwarded: number;
    if (kind === 'NO_RESULT' || kind === 'ABANDONED') {
      result = 'NR'; pointsAwarded = 1;
    } else if (kind === 'DRAW') {
      result = 'D'; pointsAwarded = 1;
    } else if (kind === 'TIE' || (!winnerId && match.scoreA === match.scoreB)) {
      result = 'T'; pointsAwarded = 1;
    } else {
      const won = winnerId === teamId || (!winnerId && ((match.teamA === teamId && Number(match.scoreA) > Number(match.scoreB)) || (match.teamB === teamId && Number(match.scoreB) > Number(match.scoreA))));
      result = won ? 'W' : 'L';
      pointsAwarded = won ? pointsRule?.win ?? 2 : pointsRule?.loss ?? 0;
    }
    cumulativePoints += pointsAwarded;
    if (result !== 'NR') {
      const own = match.teamInningsStats?.[teamId];
      const opponent = match.teamInningsStats?.[opponentTeamId];
      if (own && opponent) {
        runsFor += own.runs; ballsFor += own.legalBalls;
        runsAgainst += opponent.runs; ballsAgainst += opponent.legalBalls;
      }
    }
    const nrrAfterMatch = (ballsFor ? runsFor / (ballsFor / 6) : 0) - (ballsAgainst ? runsAgainst / (ballsAgainst / 6) : 0);
    return {
      matchId: match.canonicalMatchId ?? match.id,
      opponentTeamId,
      scheduledAt: match.scheduledAt ? Date.parse(match.scheduledAt) : undefined,
      result,
      pointsAwarded,
      cumulativePoints,
      nrrAfterMatch,
    };
  });
  const won = history.filter(item => item.result === 'W').length;
  const lost = history.filter(item => item.result === 'L').length;
  const tied = history.filter(item => item.result === 'T' || item.result === 'D').length;
  const noResult = history.filter(item => item.result === 'NR').length;
  return {
    teamId, played: history.length, won, lost, tied, noResult, points: cumulativePoints,
    runsFor, oversFor: ballsFor / 6, runsAgainst, oversAgainst: ballsAgainst / 6,
    nrr: history.at(-1)?.nrrAfterMatch ?? 0, history,
  };
}

function formatNrr(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}

function knockoutRoundLabel(name: string): string {
  return ({ R16: 'Round of 16', QF: 'Quarter-finals', SF: 'Semi-finals', F: 'Final', '3RD_PLACE': 'Third place' } as Record<string, string>)[name] ?? name;
}

function fixtureRoundLabel(round: number, stageType?: string, roundId?: string): string {
  if (stageType === 'KNOCKOUT') {
    if (roundId && !roundId.startsWith('MANUAL_R')) return knockoutRoundLabel(roundId);
    return round === 1 ? 'SF' : round === 2 ? 'FINAL' : `R${round}`;
  }
  return `R${round}`;
}

function BracketScoreRow({ team, stat, fallback, winner }: {
  team: string;
  stat?: { runs: number; wickets: number; legalBalls: number };
  fallback?: number;
  winner: boolean;
}) {
  return <View style={styles.bracketScoreRow}>
    <Text variant="bodyStrong" tone={winner ? 'accent' : 'default'}>{team}</Text>
    <View style={{ alignItems: 'flex-end' }}>
      <Text variant="bodyStrong" tone={winner ? 'accent' : 'default'}>{stat ? `${stat.runs}/${stat.wickets}` : fallback ?? '—'}</Text>
      {stat ? <Text variant="caption" tone="dim">{Math.floor(stat.legalBalls / 6)}.{stat.legalBalls % 6} OV</Text> : null}
    </View>
  </View>;
}

function groupNetRunRate(teamId: string, matches: GeneratedFixtureSetup['matches']): string {
  let runsFor = 0;
  let ballsFaced = 0;
  let runsAgainst = 0;
  let ballsBowled = 0;
  for (const match of matches.filter(item =>
    (item.status === 'COMPLETED' || item.status === 'WALKOVER') &&
    !['NO_RESULT', 'WALKOVER', 'CANCELLED'].includes(String(item.result?.kind ?? item.result?.result_kind ?? '')) &&
    (item.teamA === teamId || item.teamB === teamId))) {
    const own = match.teamInningsStats?.[teamId];
    const opponentId = match.teamA === teamId ? match.teamB : match.teamA;
    const opponent = opponentId ? match.teamInningsStats?.[opponentId] : undefined;
    if (!own || !opponent) continue;
    runsFor += own.runs;
    ballsFaced += own.legalBalls;
    runsAgainst += opponent.runs;
    ballsBowled += opponent.legalBalls;
  }
  if (!ballsFaced || !ballsBowled) return '—';
  const nrr = runsFor / (ballsFaced / 6) - runsAgainst / (ballsBowled / 6);
  return `${nrr >= 0 ? '+' : ''}${nrr.toFixed(2)}`;
}

function TournamentSettingsView({
  tournament,
  teams,
  hasGenerated,
  section,
  onChanged,
}: {
  tournament: Tournament;
  teams: Team[];
  hasGenerated: boolean;
  section: 'details' | 'scorers';
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const auth = useAuth();
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState<'logo' | 'banner'>();
  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailPicker, setDetailPicker] = useState<'date' | 'time'>();
  const [details, setDetails] = useState({
    name: tournament.name, startDate: tournament.startDate, location: tournament.location ?? '',
    teams: String(tournament.plannedTeamCount), players: String(tournament.playersPerTeam), overs: String(tournament.oversPerMatch),
    phone: tournament.organizerPhone ?? '', description: tournament.description ?? '',
    social: tournament.socialMediaUrl ?? '', rewards: tournament.rewards ?? '',
  });
  const confirmationMatches = deleteConfirmation.trim() === tournament.name.trim();

  const deleteTournament = async () => {
    if (!auth.session || tournament.organizerProfileId !== auth.session.user.id) {
      Alert.alert('Owner access required', 'Only the tournament owner can delete this tournament.');
      return;
    }
    setDeleting(true);
    try {
      await tournamentManagementApi.deleteOwnedTournament({
        localTournamentId: tournament.id,
        cloudTournamentId: tournament.cloudId,
        ownerId: auth.session.user.id,
      });
      router.replace({ pathname: '/wricket/my-wricket', params: { section: 'tournaments' } });
    } catch (cause) {
      Alert.alert(
        'Could not delete tournament',
        cause instanceof Error ? cause.message : 'No data was removed locally. Please try again.',
      );
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteTournament = () => {
    if (!confirmationMatches || deleting) return;
    Alert.alert(
      `Delete ${tournament.name}?`,
      'This permanently deletes the tournament and all of its teams, fixtures, matches, live scores, ball-by-ball events, moments, standings and assignments.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete permanently', style: 'destructive', onPress: () => void deleteTournament() },
      ],
    );
  };
  const chooseTournamentMedia = async (kind: 'logo' | 'banner') => {
    if (!auth.session || !tournament.cloudId || tournament.organizerProfileId !== auth.session.user.id) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo permission needed', `Allow photo access to choose a tournament ${kind}.`);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'logo' ? [1, 1] : [16, 7],
      quality: 0.84,
    });
    if (result.canceled) return;
    setUploadingMedia(kind);
    try {
      await tournamentManagementApi.updateMedia({
        cloudTournamentId: tournament.cloudId,
        localTournamentId: tournament.id,
        ownerId: auth.session.user.id,
        localUri: result.assets[0].uri,
        kind,
      });
      await onChanged();
    } catch (cause) {
      Alert.alert('Could not update tournament media', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setUploadingMedia(undefined);
    }
  };

  const saveDetails = async () => {
    if (!tournament.cloudId) return;
    const teamsCount = Number(details.teams); const playersCount = Number(details.players); const oversCount = Number(details.overs);
    if (details.name.trim().length < 2) return Alert.alert('Name required', 'Enter a tournament name.');
    if (!Number.isInteger(teamsCount) || teamsCount < teams.length || teamsCount > 64) return Alert.alert('Invalid team count', `Choose ${teams.length} to 64 teams.`);
    if (!Number.isInteger(playersCount) || playersCount < 2 || playersCount > 25) return Alert.alert('Invalid squad size', 'Choose 2 to 25 players.');
    if (!Number.isInteger(oversCount) || oversCount < 1 || oversCount > 100) return Alert.alert('Invalid overs', 'Choose 1 to 100 overs per match.');
    setSavingDetails(true);
    try {
      await tournamentManagementApi.updateDetails({ cloudTournamentId: tournament.cloudId, localTournamentId: tournament.id,
        name: details.name, startDate: details.startDate, location: details.location || undefined,
        plannedTeamCount: teamsCount, playersPerTeam: playersCount, oversPerMatch: oversCount, organizerPhone: details.phone || undefined,
        description: details.description || undefined, socialMediaUrl: details.social || undefined, rewards: details.rewards || undefined });
      await onChanged(); setEditingDetails(false);
    } catch (cause) { Alert.alert('Could not update tournament', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { setSavingDetails(false); }
  };

  const changeDetailDate = (event: DateTimePickerEvent, value?: Date) => {
    const mode = detailPicker; setDetailPicker(undefined);
    if (event.type === 'dismissed' || !value || !mode) return;
    const next = new Date(details.startDate);
    if (mode === 'date') next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
    else next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    setDetails(current => ({ ...current, startDate: next.getTime() }));
  };
  if (section === 'scorers') return tournament.cloudId ? <ScorerSettingsCard tournamentId={tournament.cloudId} /> : <Text tone="muted">Sync this tournament before assigning scorers.</Text>;
  return (
    <View style={{ gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}>
      <Text variant="h2">Tournament settings</Text>
      <Card>
        <View style={styles.settingsTitleRow}><View style={{ flex: 1 }}><Text variant="h3">Tournament details</Text><Text variant="caption" tone="muted">Schedule, venue, capacity, contact and rewards.</Text></View><Button title={editingDetails ? 'CANCEL' : 'EDIT'} size="sm" variant="secondary" onPress={() => setEditingDetails(value => !value)} /></View>
        {editingDetails ? <View style={styles.detailsForm}>
          <SettingsInput label="NAME" value={details.name} onChangeText={name => setDetails(value => ({ ...value, name }))} />
          <View style={styles.brandingRow}><Button title={new Date(details.startDate).toLocaleDateString()} variant="secondary" onPress={() => setDetailPicker('date')} style={{ flex: 1 }} /><Button title={new Date(details.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} variant="secondary" onPress={() => setDetailPicker('time')} style={{ flex: 1 }} /></View>
          {detailPicker ? <DateTimePicker value={new Date(details.startDate)} mode={detailPicker} onChange={changeDetailDate} /> : null}
          <SettingsInput label="LOCATION" value={details.location} onChangeText={location => setDetails(value => ({ ...value, location }))} />
          <View style={styles.brandingRow}><SettingsInput label="NUMBER OF TEAMS" value={details.teams} keyboardType="number-pad" onChangeText={teamsValue => setDetails(value => ({ ...value, teams: teamsValue }))} containerStyle={{ flex: 1 }} /><SettingsInput label="PLAYERS PER TEAM" value={details.players} keyboardType="number-pad" onChangeText={players => setDetails(value => ({ ...value, players }))} containerStyle={{ flex: 1 }} /></View>
          <SettingsInput label="OVERS PER MATCH" value={details.overs} keyboardType="number-pad" onChangeText={overs => setDetails(value => ({ ...value, overs }))} />
          <SettingsInput label="ORGANISER PHONE" value={details.phone} keyboardType="phone-pad" onChangeText={phone => setDetails(value => ({ ...value, phone }))} />
          <SettingsInput label="DESCRIPTION" value={details.description} multiline onChangeText={description => setDetails(value => ({ ...value, description }))} />
          <SettingsInput label="SOCIAL LINK" value={details.social} autoCapitalize="none" onChangeText={social => setDetails(value => ({ ...value, social }))} />
          <SettingsInput label="REWARDS / PRIZES" value={details.rewards} multiline onChangeText={rewards => setDetails(value => ({ ...value, rewards }))} />
          <Button title="Save tournament details" loading={savingDetails} onPress={() => void saveDetails()} fullWidth />
        </View> : null}
      </Card>
      <Card>
        <Text variant="h3">Tournament branding</Text>
        <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>Update the logo used in lists and the banner shown on the tournament page.</Text>
        <View style={styles.brandingRow}>
          <Pressable disabled={!tournament.cloudId || Boolean(uploadingMedia)} onPress={() => void chooseTournamentMedia('logo')} style={styles.brandingItem}>
            <View style={styles.brandingLogo}>{tournament.logoUrl ? <Image source={{ uri: tournament.logoUrl }} style={styles.brandingImage} /> : <MaterialCommunityIcons name="image-plus" size={26} color={colors.accent} />}</View>
            <Text variant="caption">{uploadingMedia === 'logo' ? 'UPLOADING…' : 'CHANGE LOGO'}</Text>
          </Pressable>
          <Pressable disabled={!tournament.cloudId || Boolean(uploadingMedia)} onPress={() => void chooseTournamentMedia('banner')} style={[styles.brandingItem, { flex: 2 }]}>
            <View style={styles.brandingBanner}>{tournament.bannerUrl ? <Image source={{ uri: tournament.bannerUrl }} style={styles.brandingImage} /> : <MaterialCommunityIcons name="image-plus" size={26} color={colors.accent} />}</View>
            <Text variant="caption">{uploadingMedia === 'banner' ? 'UPLOADING…' : 'CHANGE BANNER'}</Text>
          </Pressable>
        </View>
      </Card>
      <Card>
        <Text variant="h3">Matches and fixtures</Text>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {!hasGenerated && (
            <Button
              title="Set up tournament schedule"
              disabled={teams.length < 2}
              onPress={() => router.push({
                pathname: '/wricket/tournament/[id]/fixtures',
                params: { id: tournament.id },
              })}
              fullWidth
            />
          )}
          <Button
            title="Start match"
            variant="secondary"
            disabled={teams.length < 2}
            onPress={() => router.push({
              pathname: '/wricket/match/new',
              params: { tournamentId: tournament.id },
            })}
            fullWidth
          />
          {hasGenerated && (
            <Button title="Manage tournament schedule" variant="secondary" onPress={() => router.push({ pathname: '/wricket/tournament/[id]/fixtures', params: { id: tournament.id } })} fullWidth />
          )}
        </View>
      </Card>
      <Card style={styles.dangerZone}>
        <View style={styles.dangerHeading}>
          <MaterialCommunityIcons name="alert-octagon-outline" size={22} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text variant="h3" tone="danger">Danger zone</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
              Permanently delete this tournament and every related team, fixture, match, live score, ball event, moment and assignment.
            </Text>
          </View>
        </View>
        <Text variant="caption" tone="muted" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Type {tournament.name} to confirm
        </Text>
        <TextInput
          value={deleteConfirmation}
          onChangeText={setDeleteConfirmation}
          placeholder={tournament.name}
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!deleting}
          style={styles.deleteConfirmationInput}
        />
        <Button
          title="Delete tournament permanently"
          variant="danger"
          loading={deleting}
          disabled={!confirmationMatches}
          onPress={confirmDeleteTournament}
          fullWidth
          style={{ marginTop: spacing.md }}
        />
      </Card>
    </View>
  );
}

function SettingsInput({ label, containerStyle, ...props }: React.ComponentProps<typeof TextInput> & { label: string; containerStyle?: object }) {
  return <View style={containerStyle}><Text variant="caption" tone="muted" style={{ marginBottom: spacing.xs }}>{label}</Text><TextInput {...props} placeholderTextColor={colors.textDim} style={[styles.scorerSearch, props.multiline && { minHeight: 90, textAlignVertical: 'top' }]} /></View>;
}

function ScorerSettingsCard({ tournamentId }: { tournamentId: string }) {
  const [assigned, setAssigned] = useState<TournamentScorer[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScorerSearchResult[]>([]);
  const [busyAccountId, setBusyAccountId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [removing, setRemoving] = useState<TournamentScorer>();

  const loadAssigned = useCallback(async () => {
    try {
      setAssigned(await scorerManagementApi.list(tournamentId));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load tournament scorers');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => { void loadAssigned(); }, [loadAssigned]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      scorerManagementApi.search(tournamentId, query)
        .then(items => { if (!cancelled) setResults(items); })
        .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Scorer search failed'); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, tournamentId]);

  const assign = async (scorer: ScorerSearchResult) => {
    setBusyAccountId(scorer.accountId);
    try {
      await scorerManagementApi.assign(tournamentId, scorer.accountId);
      await loadAssigned();
      setResults(current => current.map(item => item.accountId === scorer.accountId ? { ...item, isAssigned: true } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not assign scorer. Please try again.');
    } finally { setBusyAccountId(undefined); }
  };

  const confirmRemove = (scorer: TournamentScorer) => { setError(undefined); setRemoving(scorer); };
  const remove = async () => {
    if (!removing || busyAccountId) return;
    setBusyAccountId(removing.accountId);
    setError(undefined);
    try {
      await scorerManagementApi.remove(tournamentId, removing.scorerId);
      setResults(current => current.map(item => item.accountId === removing.accountId ? { ...item, isAssigned: false } : item));
      setRemoving(undefined);
      await loadAssigned();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove scorer. Please try again.'); }
    finally { setBusyAccountId(undefined); }
  };

  return <Card>
    <View style={styles.scorerHeading}>
      <View style={styles.scorerIcon}><MaterialCommunityIcons name="scoreboard-outline" size={20} color={colors.accent} /></View>
      <View style={{ flex: 1 }}><Text variant="h3">Manage scorers</Text><Text variant="caption" tone="muted">Search and assign Wricket members who can score matches.</Text></View>
    </View>

    <TextInput
      value={query}
      onChangeText={setQuery}
      accessibilityLabel="Search tournament scorers"
      placeholder="Search members by name"
      placeholderTextColor={colors.textDim}
      autoCapitalize="words"
      style={styles.scorerSearch}
    />

    {query.trim().length >= 2 && results.length === 0 ? <Text variant="caption" tone="dim" style={styles.scorerMessage}>No matching members found.</Text> : null}
    {results.map(item => <ScorerRow
      key={item.accountId}
      name={item.displayName}
      avatarUrl={item.avatarUrl}
      detail={item.availabilityStatus === 'UNAVAILABLE' ? 'Unavailable' : item.isAssigned ? 'Already assigned' : 'Available'}
      actionLabel={item.isAssigned ? undefined : 'ASSIGN'}
      disabled={item.availabilityStatus === 'UNAVAILABLE' || busyAccountId === item.accountId}
      onAction={() => void assign(item)}
    />)}

    <View style={styles.scorerDivider} />
    <Text variant="overline" tone="dim">ASSIGNED · {assigned.length}</Text>
    {loading ? <Text variant="caption" tone="muted" style={styles.scorerMessage}>Loading scorers…</Text> : assigned.length === 0 ? <Text variant="caption" tone="muted" style={styles.scorerMessage}>No dedicated scorer assigned. The owner can still score.</Text> : null}
    {assigned.map(item => <ScorerRow
      key={item.assignmentId}
      name={item.displayName}
      avatarUrl={item.avatarUrl}
      detail="Tournament scorer"
      actionLabel="REMOVE"
      disabled={busyAccountId === item.accountId}
      onAction={() => confirmRemove(item)}
    />)}
    {error ? <Pressable onPress={() => void loadAssigned()}><Text variant="caption" tone="danger" style={styles.scorerMessage}>{error} · Tap to retry</Text></Pressable> : null}
    <Modal visible={Boolean(removing)} transparent animationType="fade" onRequestClose={() => { if (!busyAccountId) setRemoving(undefined); }}>
      <View style={styles.modalBackdrop}><View style={[styles.modalSheet, { maxHeight: '90%' }]} accessibilityViewIsModal>
        <Text variant="h2">Remove tournament scorer?</Text>
        <Text tone="muted" style={{ marginVertical: 16 }}>{removing?.displayName} will lose scoring access to this tournament.</Text>
        {error ? <Text accessibilityRole="alert" tone="danger">{error}</Text> : null}
        <Button title="Confirm remove scorer" variant="danger" loading={Boolean(busyAccountId)} onPress={() => void remove()} />
        <Button title="Keep scorer" variant="ghost" disabled={Boolean(busyAccountId)} onPress={() => setRemoving(undefined)} />
      </View></View>
    </Modal>
  </Card>;
}

function ScorerRow({ name, avatarUrl, detail, actionLabel, disabled, onAction }: {
  name: string;
  avatarUrl?: string;
  detail: string;
  actionLabel?: string;
  disabled?: boolean;
  onAction: () => void;
}) {
  return <View style={styles.scorerRow}>
    {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.scorerAvatar} /> : <View style={styles.scorerAvatarFallback}><Text variant="bodyStrong" tone="accent">{name.slice(0, 1).toUpperCase()}</Text></View>}
    <View style={{ flex: 1 }}><Text variant="bodyStrong">{name}</Text><Text variant="caption" tone="muted">{detail}</Text></View>
    {actionLabel ? <Pressable accessibilityRole="button" accessibilityLabel={`${actionLabel === 'REMOVE' ? 'Remove' : 'Assign'} scorer ${name}`} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onAction} style={[styles.scorerAction, disabled && styles.scorerActionDisabled]}><Text variant="overline" tone={actionLabel === 'REMOVE' ? 'danger' : 'accent'}>{actionLabel}</Text></Pressable> : null}
  </View>;
}

function formatTournamentDate(value: number): string {
  const date = new Date(value);
  const month = date.toLocaleString('en', { month: 'short' });
  const time = date.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${ordinalDay(date.getDate())} ${month}, ${date.getFullYear()} · ${time}`;
}

function ordinalDay(day: number): string {
  const lastTwoDigits = day % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

function matchSectionRank(match: Match): number {
  if (['IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION'].includes(match.status)) return 0;
  if (['COMPLETED', 'ABANDONED'].includes(match.status)) return 2;
  return 1;
}

function matchSectionLabel(match: Match): 'LIVE' | 'UPCOMING' | 'PAST' {
  const rank = matchSectionRank(match);
  return rank === 0 ? 'LIVE' : rank === 1 ? 'UPCOMING' : 'PAST';
}


function showFixtureError(cause: unknown) {
  Alert.alert('Fixture update failed', cause instanceof Error ? cause.message : 'Please try again.');
}

function formatFixtureResult(
  result?: Record<string, unknown>,
  teams: readonly { id: string; name: string }[] = [],
): string {
  if (!result) return 'Match completed';
  const kind = String(result.kind ?? result.result_kind ?? '');
  if (kind === 'NO_RESULT') return 'No result';
  if (kind === 'CANCELLED') return 'Match cancelled';
  if (kind === 'TIE') return 'Match tied';
  if (kind === 'DRAW') return 'Match drawn';

  const winnerId = typeof result.winnerTeamId === 'string'
    ? result.winnerTeamId
    : typeof result.winner_team_id === 'string'
      ? result.winner_team_id
      : undefined;
  const winner = teams.find(team => team.id === winnerId)?.name
    ?? (winnerId ? 'Winning team' : undefined);
  if (kind === 'WALKOVER') return winner ? `${winner} won by walkover` : 'Won by walkover';
  const margin = typeof result.margin === 'number' || typeof result.margin === 'string'
    ? result.margin
    : undefined;
  const rawUnit = result.marginUnit ?? result.margin_unit;
  const unit = typeof rawUnit === 'string' ? rawUnit.toLowerCase() : undefined;

  if (kind === 'WIN_BY_INNINGS') {
    return winner && margin != null
      ? `${winner} won by an innings and ${margin} run${Number(margin) === 1 ? '' : 's'}`
      : 'Won by an innings';
  }
  if (winner && margin != null && unit) {
    const normalizedUnit = Number(margin) === 1 ? unit.replace(/s$/, '') : unit;
    return `${winner} won by ${margin} ${normalizedUnit}`;
  }
  if (winner) return `${winner} won the match`;
  return 'Match completed';
}


function TournamentStatsView({ stats }: { stats: TournamentStats }) {
  if (stats.balls === 0) {
    return (
      <View style={styles.statsEmpty}>
        <MaterialCommunityIcons name="chart-line" size={36} color={colors.accent} />
        <Text variant="h3" style={{ marginTop: spacing.md }}>No tournament stats yet</Text>
        <Text variant="body" tone="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
          Tournament totals appear after eligible matches are completed.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.statsContent}>
      <View style={styles.statsSummary}>
        <StatTile label="MATCHES" value={String(stats.matches)} detail={`${stats.completedMatches} completed`} />
        <StatTile label="RUNS" value={String(stats.runs)} detail={`${stats.balls} balls`} />
        <StatTile label="WICKETS" value={String(stats.wickets)} detail="Tournament" />
      </View>
    </View>
  );
}

function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View style={styles.statTile}>
      <Text variant="caption" tone="dim">{label}</Text>
      <Text variant="h2" style={{ marginTop: spacing.xs }}>{value}</Text>
      <Text variant="caption" tone="muted">{detail}</Text>
    </View>
  );
}

async function buildTournamentStats(matches: Match[], users: User[]): Promise<TournamentStats> {
  const inningsGroups = await Promise.all(matches.map(match => listInningsForMatch(match.id)));
  const ballGroups = await Promise.all(inningsGroups.flat().map(innings => listBalls(innings.id)));
  const balls = ballGroups.flat();
  const byPlayer = new Map(users.map(user => [
    user.id,
    emptyTournamentPlayer(user.id, user.name),
  ]));
  const player = (id: string) => {
    const existing = byPlayer.get(id);
    if (existing) return existing;
    const fallback = emptyTournamentPlayer(id, 'Unknown player');
    byPlayer.set(id, fallback);
    return fallback;
  };
  for (const ball of balls) {
    const batter = player(ball.strikerId);
    batter.runs += ball.runsBat;
    if (ball.extraKind !== 'WIDE') batter.ballsFaced += 1;
    const bowler = player(ball.bowlerId);
    if (ball.isLegal) bowler.bowlingBalls += 1;
    bowler.runsConceded += ball.runsBat + (ball.extraKind === 'BYE' || ball.extraKind === 'LEG_BYE' ? 0 : ball.runsExtra);
    if (isBowlerWicket(ball)) bowler.wickets += 1;
    if (ball.dismissal?.outPlayerId) player(ball.dismissal.outPlayerId).dismissals += 1;
    if (ball.dismissal?.kind === 'CAUGHT' && ball.dismissal.fielderId) player(ball.dismissal.fielderId).catches += 1;
    if (ball.dismissal?.kind === 'STUMPED' && ball.dismissal.fielderId) player(ball.dismissal.fielderId).stumpings += 1;
  }
  return {
    matches: matches.length,
    completedMatches: matches.filter(match => match.status === 'COMPLETED').length,
    balls: balls.length,
    runs: balls.reduce((sum, ball) => sum + ball.runsBat + ball.runsExtra, 0),
    wickets: balls.filter(ball => ball.isWicket).length,
    players: Array.from(byPlayer.values()),
  };
}

function emptyTournamentPlayer(id: string, name: string): TournamentPlayerStats {
  return { id, name, runs: 0, wickets: 0, matches: 0, innings: 0, ballsFaced: 0, dismissals: 0,
    bowlingBalls: 0, runsConceded: 0, catches: 0, stumpings: 0, recentScores: [], recentWickets: [] };
}

function isBowlerWicket(ball: Ball): boolean {
  return Boolean(
    ball.isWicket &&
    ball.dismissal &&
    ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'].includes(ball.dismissal.kind),
  );
}

const styles = StyleSheet.create({
  compactHeader: { height: 48, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 20 },
  compactBack: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  compactContext: { flex: 1, minWidth: 0, height: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  compactStatus: { flexShrink: 0, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: colors.surfaceElevated },
  compactLogo: { flexShrink: 0, borderWidth: 1, borderColor: colors.borderStrong },
  compactStatusLive: { backgroundColor: colors.accentMuted },
  collapsedPage: { flex: 1, backgroundColor: colors.bg },
  overviewReveal: { overflow: 'hidden', backgroundColor: colors.bg },
  dragHandleZone: { height: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  collapsedTabScroll: { flex: 1 },
  collapsedTabContent: { paddingBottom: spacing.xxxl },
  quickActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  quickAction: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  banner: {
    width: '100%',
    height: 112,
    backgroundColor: colors.surface,
  },
  pageScroll: { flex: 1 },
  overview: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  overviewContent: {
    paddingBottom: spacing.xxxl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  hero: { minHeight: 224, paddingTop: 100, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, position: 'relative', borderWidth: 1, borderColor: colors.border },
  heroImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  heroFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8, 11, 9, 0.34)', borderBottomWidth: 108, borderBottomColor: 'rgba(8, 11, 9, 0.42)' },
  pitchStripeOne: { position: 'absolute', top: 0, bottom: 0, left: '18%', width: '18%', backgroundColor: 'rgba(95, 227, 138, 0.035)' },
  pitchStripeTwo: { position: 'absolute', top: 0, bottom: 0, right: '18%', width: '18%', backgroundColor: 'rgba(95, 227, 138, 0.035)' },
  pitchSeam: { height: 112, width: 18, borderLeftWidth: 2, borderRightWidth: 2, borderColor: 'rgba(232, 196, 104, 0.36)', alignItems: 'center', justifyContent: 'space-around' },
  pitchStitch: { width: 9, height: 2, transform: [{ rotate: '-25deg' }], backgroundColor: 'rgba(232, 196, 104, 0.6)' },
  heroIdentity: { margin: spacing.md, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  heroLogo: { flexShrink: 0, borderWidth: 3, borderColor: 'rgba(238, 242, 237, 0.9)', backgroundColor: colors.surface },
  heroCopy: { flex: 1, minWidth: 0, gap: spacing.xs, paddingBottom: 2 },
  overviewMetrics: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  overviewMetric: { flex: 1, minHeight: 96, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'flex-end', gap: spacing.xs },
  metricIcon: { position: 'absolute', top: spacing.sm, right: spacing.sm, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  sectionHeading: { marginTop: spacing.xl, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  infoCard: { padding: 0, overflow: 'hidden', borderRadius: radius.lg },
  infoRow: { minHeight: 48, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoRowLast: { borderBottomWidth: 0 },
  infoAction: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.accentMuted },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.xs },
  statusPill: { position: 'absolute', top: spacing.md, right: spacing.md, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: 'rgba(8, 11, 9, 0.82)' },
  statusPillComplete: { backgroundColor: 'rgba(27, 33, 28, 0.9)' },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  mapPreview: {
    marginTop: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  momentsPreview: { marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  momentsPreviewTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  momentsIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  mapImage: { width: '100%', height: 72 },
  mapFallback: { height: 72, alignItems: 'center', justifyContent: 'center' },
  mapCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  tabBarShell: {
    position: 'relative',
    zIndex: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
    boxShadow: `0px 3px 6px rgba(0, 0, 0, 0.18)`,
  },
  stickyGapCover: { position: 'absolute', left: 0, right: 0, top: -10, height: 10, backgroundColor: colors.bg },
  tabContent: {
    paddingHorizontal: spacing.lg,
  },
  tabBar: {
    paddingHorizontal: spacing.md,
    paddingRight: 54,
    gap: spacing.xs,
  },
  tabFadeEdge: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 48, alignItems: 'flex-end', paddingRight: spacing.sm, justifyContent: 'center', backgroundColor: 'rgba(11, 14, 12, 0.94)' },
  tab: {
    minWidth: 92,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  teamDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  teamSwatch: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamListSwatch: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  teamLogo: { width: '100%', height: '100%', borderRadius: radius.md },
  teamRecordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
  },
  liveScoreStrip: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: 'rgba(95, 227, 138, 0.28)', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  generatedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  generatedTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  insightsLink: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-end' },
  fixtureTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  fixtureTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  fixtureTabActive: {
    backgroundColor: colors.surfaceElevated,
  },
  generatedTeamName: {
    flex: 1,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeader: {
    borderBottomColor: colors.borderStrong,
  },
  numCol: {
    width: 32,
    textAlign: 'right',
  },
  pointsHistory: { backgroundColor: colors.surfaceElevated, paddingHorizontal: spacing.md },
  pointsHistoryEmpty: { backgroundColor: colors.surfaceElevated, padding: spacing.md },
  pointsHistoryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  resultWin: { backgroundColor: colors.accentMuted },
  resultLoss: { backgroundColor: 'rgba(224, 57, 75, 0.16)' },
  resultNeutral: { backgroundColor: colors.goldMuted },
  resultBadgeText: { fontWeight: '800' },
  publicTables: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  bracketRail: { alignItems: 'center', paddingBottom: spacing.md },
  bracketColumn: { width: 210, gap: spacing.sm },
  bracketMatches: { flex: 1, justifyContent: 'space-around', gap: spacing.lg, minHeight: 170 },
  bracketMatch: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
  },
  bracketMatchClickable: { borderWidth: 1, borderColor: colors.accent },
  bracketScoreRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  bracketTeamDivider: { height: 1, backgroundColor: colors.border },
  bracketResult: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, textAlign: 'center' },
  bracketFinal: { borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.goldMuted },
  bracketConnector: { width: 28, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  bracketConnectorFork: { position: 'absolute', height: '58%', width: 14, left: 0, borderTopWidth: 2, borderBottomWidth: 2, borderRightWidth: 2, borderColor: colors.borderStrong },
  bracketConnectorLine: { width: 28, height: 2, backgroundColor: colors.borderStrong },
  championColumn: { width: 108, minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  celebrationBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  celebrationCard: { width: '100%', maxWidth: 430, alignItems: 'center', gap: spacing.lg, padding: spacing.xxl, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.gold },
  confettiRow: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-around' },
  statsEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  statsContent: {
    gap: spacing.md,
  },
  statsPanelContent: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  statsSummary: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  scorerHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scorerIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  scorerSearch: { marginTop: spacing.md, minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.bg, color: colors.text, paddingHorizontal: spacing.md, fontSize: 15 },
  scorerMessage: { marginTop: spacing.sm },
  scorerDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  scorerRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  scorerAvatar: { width: 38, height: 38, borderRadius: 19 },
  scorerAvatarFallback: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  scorerAction: { minWidth: 64, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  scorerActionDisabled: { opacity: 0.45 },
  dangerZone: { borderColor: 'rgba(239, 83, 80, 0.42)', backgroundColor: 'rgba(239, 83, 80, 0.055)' },
  dangerHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  deleteConfirmationInput: { minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(239, 83, 80, 0.5)', backgroundColor: colors.bg, color: colors.text, paddingHorizontal: spacing.md, fontSize: 15 },
  brandingRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  brandingItem: { flex: 1, gap: spacing.xs },
  brandingLogo: { height: 82, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  brandingBanner: { height: 82, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  brandingImage: { width: '100%', height: '100%' },
  settingsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detailsForm: { gap: spacing.md, marginTop: spacing.lg },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontSize: 16,
  },
  colorDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: colors.text,
  },
  teamLogoPicker: { width: 92, height: 92, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, overflow: 'hidden' },
  teamLogoPreview: { width: '100%', height: '100%' },
});
