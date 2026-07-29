import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, Pressable, TextInput, Modal, Alert, Image, Linking, ScrollView } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, Stack } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { googleStaticMapUrl } from '@/lib/maps/googlePlaces';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, palette } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import {
  getTournament,
  listTeams,
  listMatches,
  listBalls,
  listInningsForMatch,
  listUsers,
} from '@/lib/wricket/db/repo';
import { Tournament, Team, Match, Ball, User, FORMAT_LABEL } from '@/lib/wricket/domain/types';
import { computePointsTable, PointsRow } from '@/lib/wricket/app/points';
import { fixturesApi, GeneratedFixtureSetup } from '@/lib/supabase/fixturesApi';
import { TeamRosterMember, teamManagementApi } from '@/lib/supabase/teamManagementApi';
import { useAuth } from '@/components/providers/AuthProvider';
import { createOnlineTeam, deleteOnlineTeam } from '@/lib/wricket/data/cloudFirst';

type Tab = 'fixtures' | 'table' | 'teams' | 'stats' | 'settings';

interface TournamentPlayerStats {
  id: string;
  name: string;
  runs: number;
  wickets: number;
}

interface TournamentStats {
  balls: number;
  runs: number;
  wickets: number;
  players: TournamentPlayerStats[];
}

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [points, setPoints] = useState<PointsRow[]>([]);
  const [tab, setTab] = useState<Tab>('fixtures');
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [stats, setStats] = useState<TournamentStats>({ balls: 0, runs: 0, wickets: 0, players: [] });
  const [generatedSetup, setGeneratedSetup] = useState<GeneratedFixtureSetup>({
    stages: [], groups: [], matches: [], bracket: null,
  });

  const refresh = useCallback(async () => {
    if (!id) return;
    const [t, teamList, matchList, users] = await Promise.all([
      getTournament(id),
      listTeams(id),
      listMatches(id),
      listUsers(),
    ]);
    setTournament(t);
    setTeams(teamList);
    setMatches(matchList);
    setGeneratedSetup(t?.cloudId
      ? await fixturesApi.getFixtureSetup(t.cloudId)
      : { stages: [], groups: [], matches: [], bracket: null });
    const pts = await computePointsTable(id);
    setPoints(pts);
    setStats(await buildTournamentStats(matchList, users));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!tournament?.cloudId) return;
    return fixturesApi.subscribeToTournament(tournament.cloudId, () => {
      fixturesApi.getFixtureSetup(tournament.cloudId!)
        .then(setGeneratedSetup)
        .catch(() => undefined);
    });
  }, [tournament?.cloudId]);

  if (!tournament) {
    return <Screen><Text tone="muted">Loading…</Text></Screen>;
  }

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: tournament.name }} />
      {(tournament.bannerUrl || tournament.bannerLocalUri) && (
        <Image
          source={{ uri: tournament.bannerUrl ?? tournament.bannerLocalUri }}
          style={styles.banner}
        />
      )}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {(tournament.logoUrl || tournament.logoLocalUri) && (
            <Image
              source={{ uri: tournament.logoUrl ?? tournament.logoLocalUri }}
              style={styles.logo}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text variant="overline" tone="muted">{FORMAT_LABEL[tournament.format]}</Text>
            <Text variant="h1">{tournament.name}</Text>
          </View>
        </View>
        <Text variant="caption" tone="dim" style={{ marginTop: spacing.xs }}>
          {new Date(tournament.startDate).toLocaleString()} · {teams.length}/{tournament.plannedTeamCount} planned teams
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
          Organised by creator · {tournament.playersPerTeam} players per team
          {tournament.organizerPhone ? ` · ${tournament.organizerPhone}` : ''}
        </Text>
        {tournament.location && (
          <>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
              {tournament.location}
            </Text>
            {tournament.latitude != null && tournament.longitude != null && (
              <Pressable
                style={styles.mapPreview}
                onPress={() => Linking.openURL(
                  tournament.googleMapsUrl
                    ?? `https://www.google.com/maps/search/?api=1&query=${tournament.latitude},${tournament.longitude}`,
                ).catch(() => Alert.alert('Could not open map', 'Google Maps is unavailable.'))}
              >
                {googleStaticMapUrl(tournament.latitude, tournament.longitude) ? (
                  <Image
                    source={{ uri: googleStaticMapUrl(tournament.latitude, tournament.longitude) }}
                    style={styles.mapImage}
                  />
                ) : (
                  <View style={styles.mapFallback}>
                    <MaterialCommunityIcons name="map-marker" size={30} color={colors.accent} />
                  </View>
                )}
                <View style={styles.mapCaption}>
                  <Text variant="bodyStrong">Open venue in Google Maps</Text>
                  <MaterialCommunityIcons name="open-in-new" size={18} color={colors.accent} />
                </View>
              </Pressable>
            )}
          </>
        )}
        {tournament.description && (
          <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
            {tournament.description}
          </Text>
        )}
        {tournament.socialMediaUrl && (
          <Pressable
            onPress={() => Linking.openURL(tournament.socialMediaUrl!).catch(() => {
              Alert.alert('Could not open link', 'The tournament social link is unavailable.');
            })}
            style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
          >
            <Text variant="bodyStrong" style={{ color: colors.accent }}>Open tournament social page</Text>
          </Pressable>
        )}
        <Text variant="caption" tone="dim" style={{ marginTop: spacing.xs }}>
          {teams.length} teams · {matches.length} matches
        </Text>
      </View>

      <View style={styles.tabBar}>
        <TabBtn label="Fixtures" active={tab === 'fixtures'} onPress={() => setTab('fixtures')} />
        <TabBtn label="Table" active={tab === 'table'} onPress={() => setTab('table')} />
        <TabBtn label="Teams" active={tab === 'teams'} onPress={() => setTab('teams')} />
        <TabBtn label="Stats" active={tab === 'stats'} onPress={() => setTab('stats')} />
        {tournament.organizerProfileId === auth.session?.user.id && (
          <TabBtn label="Settings" active={tab === 'settings'} onPress={() => setTab('settings')} />
        )}
      </View>

      <View style={{ flex: 1, paddingHorizontal: spacing.lg }}>
        {tab === 'fixtures' && (
          <FixturesView
            matches={matches}
            generatedSetup={generatedSetup}
            teams={teams}
            tournament={tournament}
            canManage={tournament.organizerProfileId === auth.session?.user.id}
            onChanged={refresh}
          />
        )}
        {tab === 'table' && <PointsTableView rows={points} teams={teams} />}
        {tab === 'teams' && (
          <TeamsView
            teams={teams}
            plannedTeamCount={tournament.plannedTeamCount}
            canManage={tournament.organizerProfileId === auth.session?.user.id}
            onAdd={() => setShowAddTeam(true)}
            onChanged={refresh}
          />
        )}
        {tab === 'stats' && <TournamentStatsView stats={stats} matches={matches} />}
        {tab === 'settings' && (
          <TournamentSettingsView
            tournament={tournament}
            teams={teams}
            hasGenerated={generatedSetup.stages.length > 0}
            onChanged={refresh}
          />
        )}
      </View>

      <AddTeamModal
        visible={showAddTeam}
        tournament={tournament}
        usedColors={teams.map(t => t.colorHex)}
        onClose={() => setShowAddTeam(false)}
        onSaved={() => {
          setShowAddTeam(false);
          refresh();
        }}
      />
    </Screen>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text variant="bodyStrong" tone={active ? 'default' : 'muted'}>{label}</Text>
    </Pressable>
  );
}

function FixturesView({
  matches,
  generatedSetup,
  teams,
  tournament,
  canManage,
  onChanged,
}: {
  matches: Match[];
  generatedSetup: GeneratedFixtureSetup;
  teams: Team[];
  tournament: Tournament;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const [section, setSection] = useState<'UPCOMING' | 'LIVE' | 'PAST'>('UPCOMING');
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const cloudTeamMap = new Map(teams.filter(t => t.cloudId).map(t => [t.cloudId!, t]));
  const groupMap = new Map(generatedSetup.groups.map(group => [group.id, group.name]));
  const sortedMatches = matches.filter(match => matchSectionLabel(match) === section);
  const generatedMatches = generatedSetup.matches.filter(item =>
    section === 'UPCOMING'
      ? item.status === 'SCHEDULED'
      : section === 'LIVE'
        ? item.status === 'LIVE'
        : item.status === 'COMPLETED' || item.status === 'WALKOVER',
  );

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
      data={sortedMatches}
      keyExtractor={m => m.id}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: spacing.xxxl }}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
          <View style={styles.fixtureTabs}>
            {(['UPCOMING', 'LIVE', 'PAST'] as const).map(item => (
              <Pressable
                key={item}
                onPress={() => setSection(item)}
                style={[styles.fixtureTab, section === item && styles.fixtureTabActive]}
              >
                <Text variant="caption" tone={section === item ? 'accent' : 'muted'}>{item}</Text>
              </Pressable>
            ))}
          </View>
          {generatedMatches.length > 0 && (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {generatedMatches.map(item => {
                const teamA = cloudTeamMap.get(item.teamA);
                const teamB = item.teamB ? cloudTeamMap.get(item.teamB) : undefined;
                return (
                  <Card key={item.id}>
                    <View style={styles.generatedMeta}>
                      <Text variant="caption" tone="dim">
                        {item.groupId ? `${groupMap.get(item.groupId) ?? 'Group'} · ` : ''}
                        Round {item.round}{item.leg > 1 ? ` · Leg ${item.leg}` : ''}
                      </Text>
                      <Text variant="caption" tone={item.status === 'LIVE' ? 'accent' : 'muted'}>
                        {item.status}
                      </Text>
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
                      <Text variant="h3" style={{ marginTop: spacing.sm }}>
                        {item.liveScore.runs}/{item.liveScore.wickets} ({Math.floor(item.liveScore.legalBalls / 6)}.{item.liveScore.legalBalls % 6})
                      </Text>
                    )}
                    {(item.status === 'COMPLETED' || item.status === 'WALKOVER') && (
                      <Text variant="bodyStrong" tone="muted" style={{ marginTop: spacing.sm }}>
                        {formatFixtureResult(item.result)}
                      </Text>
                    )}
                    {canManage && item.status === 'LIVE' && item.canonicalMatchId && (
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
                    {!canManage && item.status === 'LIVE' && item.canonicalMatchId && (
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
                    {canManage && item.status === 'SCHEDULED' && item.canonicalMatchId && item.teamB && teamA && teamB && (
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
                        <Button title="Delete" size="sm" variant="secondary" onPress={() => {
                          Alert.alert('Delete fixture?', 'This fixture will be removed from the schedule.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => fixturesApi.deleteMatch(item.id).then(onChanged).catch(showFixtureError) },
                          ]);
                        }} />
                        <Button title="Edit" size="sm" variant="secondary" onPress={() => router.push({
                          pathname: '/wricket/match/new',
                          params: {
                            tournamentId: tournament.id,
                            teamAId: teamA.id,
                            teamBId: teamB.id,
                            canonicalMatchId: item.canonicalMatchId,
                            editFixtureId: item.id,
                          },
                        })} />
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
        const isLive = item.status === 'IN_PROGRESS' || item.status === 'INNINGS_BREAK';
        return (
          <View style={{ gap: spacing.sm }}>
          <Card
            onPress={() =>
              router.push({
                pathname: isCompleted
                  ? '/wricket/match/[id]/scorecard'
                  : isLive && !canManage
                    ? '/wricket/match/[id]/live'
                    : '/wricket/match/[id]/score',
                params: { id: item.id },
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
              {isLive && (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text variant="caption" style={{ color: colors.danger }}>LIVE</Text>
                </View>
              )}
              {isCompleted && (
                <Text variant="caption" tone="muted">Completed</Text>
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

function PointsTableView({ rows, teams }: { rows: PointsRow[]; teams: Team[] }) {
  const teamMap = new Map(teams.map(t => [t.id, t]));
  if (rows.length === 0) {
    return (
      <Text variant="body" tone="muted" style={{ textAlign: 'center', paddingTop: spacing.xxl }}>
        Points table appears once matches are played.
      </Text>
    );
  }
  return (
    <View style={{ paddingTop: spacing.md }}>
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text variant="caption" tone="muted" style={{ width: 24 }}>#</Text>
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>TEAM</Text>
        <Text variant="caption" tone="muted" style={styles.numCol}>P</Text>
        <Text variant="caption" tone="muted" style={styles.numCol}>W</Text>
        <Text variant="caption" tone="muted" style={styles.numCol}>L</Text>
        <Text variant="caption" tone="muted" style={styles.numCol}>PTS</Text>
        <Text variant="caption" tone="muted" style={[styles.numCol, { width: 56 }]}>NRR</Text>
      </View>
      {rows.map((r, i) => {
        const team = teamMap.get(r.teamId);
        return (
          <View key={r.teamId} style={styles.tableRow}>
            <Text variant="bodyStrong" style={{ width: 24 }}>{i + 1}</Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={[styles.teamDot, { backgroundColor: team?.colorHex ?? palette.ink400 }]} />
              <Text variant="bodyStrong">{team?.shortName ?? '—'}</Text>
            </View>
            <Text variant="body" style={styles.numCol}>{r.played}</Text>
            <Text variant="body" style={styles.numCol}>{r.won}</Text>
            <Text variant="body" style={styles.numCol}>{r.lost}</Text>
            <Text variant="bodyStrong" style={[styles.numCol, { color: colors.accent }]}>{r.points}</Text>
            <Text variant="body" style={[styles.numCol, { width: 56 }]}>{r.nrr.toFixed(2)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function TournamentSettingsView({
  tournament,
  teams,
  hasGenerated,
  onChanged,
}: {
  tournament: Tournament;
  teams: Team[];
  hasGenerated: boolean;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const resetFixtures = () => {
    if (!tournament.cloudId) return;
    Alert.alert('Reset fixtures?', 'This deletes every generated fixture and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => fixturesApi.resetFixtures(tournament.cloudId!).then(onChanged).catch(showFixtureError),
      },
    ]);
  };
  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}>
      <Text variant="h2">Tournament settings</Text>
      <Card>
        <Text variant="h3">Matches and fixtures</Text>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {!hasGenerated && (
            <Button
              title="Generate tournament fixtures"
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
            <Button title="Reset fixtures" variant="secondary" onPress={resetFixtures} fullWidth />
          )}
        </View>
      </Card>
    </ScrollView>
  );
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

function formatFixtureResult(result?: Record<string, unknown>): string {
  if (!result) return 'Match completed';
  if (result.kind === 'NO_RESULT') return 'No result';
  const margin = typeof result.margin === 'string' ? result.margin : undefined;
  return margin ?? 'Match completed';
}

function TeamsView({
  teams,
  plannedTeamCount,
  canManage,
  onAdd,
  onChanged,
}: {
  teams: Team[];
  plannedTeamCount: number;
  canManage: boolean;
  onAdd: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [rosters, setRosters] = useState<Record<string, TeamRosterMember[]>>({});

  useEffect(() => {
    let active = true;
    const cloudTeams = teams.filter(team => team.cloudId);
    if (!cloudTeams.length) {
      setRosters({});
      return () => { active = false; };
    }
    void Promise.all(cloudTeams.map(async team => [
      team.cloudId!,
      await teamManagementApi.listRoster(team.cloudId!),
    ] as const)).then(entries => {
      if (active) setRosters(Object.fromEntries(entries));
    }).catch(() => {
      if (active) setRosters({});
    });
    return () => { active = false; };
  }, [teams]);

  const removeTeam = (team: Team) => {
    Alert.alert('Delete team?', `${team.name} will be removed from this tournament.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteOnlineTeam(team).then(onChanged).catch(cause => {
          Alert.alert('Could not delete team', cause instanceof Error ? cause.message : 'Please try again.');
        }),
      },
    ]);
  };
  return (
    <View style={{ flex: 1, paddingTop: spacing.md }}>
      {canManage && teams.length < plannedTeamCount && (
        <Button title="Add team" onPress={onAdd} fullWidth style={{ marginBottom: spacing.lg }} />
      )}
      <Text variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
        {teams.length}/{plannedTeamCount} teams added. Owners assign one captain; captains add registered players.
      </Text>
      {teams.length === 0 ? (
        <Text variant="body" tone="muted" style={{ textAlign: 'center', marginTop: spacing.xl }}>
          No teams yet. Add at least 2 to schedule matches.
        </Text>
      ) : (
        <FlatList
          data={teams}
          keyExtractor={t => t.id}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => {
            const roster = item.cloudId ? rosters[item.cloudId] ?? [] : [];
            const captain = roster.find(member => member.role === 'CAPTAIN');
            const players = roster.filter(member => member.role === 'PLAYER');
            const visiblePlayers = players.slice(0, 3);
            return (
            <Card onPress={() => item.cloudId && router.push({
              pathname: '/wricket/team/[id]',
              params: { id: item.cloudId },
            })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={[styles.teamSwatch, { backgroundColor: item.colorHex }]}>
                  <Text variant="bodyStrong" style={{ color: palette.black }}>{item.shortName}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{item.name}</Text>
                  <Text variant="caption" tone="dim">
                    {item.syncStatus === 'SYNCED' ? 'Cloud synced' :
                      item.syncStatus === 'FAILED' ? 'Sync failed' : 'Waiting to sync'}
                  </Text>
                  <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
                    {captain ? `Captain: ${captain.name}` : 'Captain not assigned'}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {players.length ? `${players.length} player${players.length === 1 ? '' : 's'}` : 'No players added'}
                  </Text>
                  {visiblePlayers.map(player => (
                    <Pressable
                      key={player.playerId}
                      onPress={() => router.push({
                        pathname: '/wricket/player/[id]',
                        params: { id: player.playerId },
                      })}
                    >
                      <Text variant="caption" style={{ color: colors.accent }}>{player.name}</Text>
                    </Pressable>
                  ))}
                  {players.length > visiblePlayers.length && (
                    <Text variant="caption" tone="dim">+{players.length - visiblePlayers.length} more</Text>
                  )}
                </View>
                {canManage && (
                  <Pressable hitSlop={8} onPress={() => removeTeam(item)}>
                    <MaterialCommunityIcons name="delete-outline" size={22} color={colors.danger} />
                  </Pressable>
                )}
              </View>
            </Card>
            );
          }}
        />
      )}
    </View>
  );
}

function TournamentStatsView({ stats, matches }: { stats: TournamentStats; matches: Match[] }) {
  const router = useRouter();
  const topRuns = [...stats.players].filter(player => player.runs > 0)
    .sort((a, b) => b.runs - a.runs).slice(0, 5);
  const topWickets = [...stats.players].filter(player => player.wickets > 0)
    .sort((a, b) => b.wickets - a.wickets).slice(0, 5);
  const completed = matches.filter(match => match.status === 'COMPLETED').length;

  if (stats.balls === 0) {
    return (
      <View style={styles.statsEmpty}>
        <MaterialCommunityIcons name="chart-line" size={36} color={colors.accent} />
        <Text variant="h3" style={{ marginTop: spacing.md }}>No tournament stats yet</Text>
        <Text variant="body" tone="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
          Leaderboards appear after scoring begins.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.statsContent} showsVerticalScrollIndicator={false}>
      <View style={styles.statsSummary}>
        <StatTile label="MATCHES" value={String(matches.length)} detail={`${completed} completed`} />
        <StatTile label="RUNS" value={String(stats.runs)} detail={`${stats.balls} balls`} />
        <StatTile label="WICKETS" value={String(stats.wickets)} detail="Tournament" />
      </View>
      <StatsLeaderboard
        title="Top run scorers"
        rows={topRuns}
        value={player => `${player.runs} runs`}
        onPress={id => router.push({ pathname: '/wricket/player/[id]', params: { id } })}
      />
      <StatsLeaderboard
        title="Top wicket takers"
        rows={topWickets}
        value={player => `${player.wickets} wickets`}
        onPress={id => router.push({ pathname: '/wricket/player/[id]', params: { id } })}
      />
    </ScrollView>
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

function StatsLeaderboard({
  title,
  rows,
  value,
  onPress,
}: {
  title: string;
  rows: TournamentPlayerStats[];
  value: (player: TournamentPlayerStats) => string;
  onPress: (id: string) => void;
}) {
  return (
    <Card>
      <Text variant="h3">{title}</Text>
      {rows.map((player, index) => (
        <Pressable key={player.id} onPress={() => onPress(player.id)} style={styles.statRow}>
          <Text variant="caption" tone="dim" style={{ width: 24 }}>{index + 1}</Text>
          <Text variant="bodyStrong" style={{ flex: 1 }}>{player.name}</Text>
          <Text variant="bodyStrong" tone="accent">{value(player)}</Text>
        </Pressable>
      ))}
    </Card>
  );
}

async function buildTournamentStats(matches: Match[], users: User[]): Promise<TournamentStats> {
  const inningsGroups = await Promise.all(matches.map(match => listInningsForMatch(match.id)));
  const ballGroups = await Promise.all(inningsGroups.flat().map(innings => listBalls(innings.id)));
  const balls = ballGroups.flat();
  const byPlayer = new Map(users.map(user => [
    user.id,
    { id: user.id, name: user.name, runs: 0, wickets: 0 },
  ]));
  const player = (id: string) => {
    const existing = byPlayer.get(id);
    if (existing) return existing;
    const fallback = { id, name: 'Unknown player', runs: 0, wickets: 0 };
    byPlayer.set(id, fallback);
    return fallback;
  };
  for (const ball of balls) {
    player(ball.strikerId).runs += ball.runsBat;
    if (isBowlerWicket(ball)) player(ball.bowlerId).wickets += 1;
  }
  return {
    balls: balls.length,
    runs: balls.reduce((sum, ball) => sum + ball.runsBat + ball.runsExtra, 0),
    wickets: balls.filter(ball => ball.isWicket).length,
    players: Array.from(byPlayer.values()),
  };
}

function isBowlerWicket(ball: Ball): boolean {
  return Boolean(
    ball.isWicket &&
    ball.dismissal &&
    ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'].includes(ball.dismissal.kind),
  );
}

function AddTeamModal({
  visible,
  tournament,
  usedColors,
  onClose,
  onSaved,
}: {
  visible: boolean;
  tournament: Tournament;
  usedColors: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [color, setColor] = useState<string>(palette.team[0]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName('');
    setShortName('');
    setColor(palette.team[0]);
  };

  const onSave = async () => {
    if (!name.trim() || !shortName.trim()) {
      Alert.alert('Missing info', 'Name and short name are required.');
      return;
    }
    setSaving(true);
    try {
      await createOnlineTeam({
        tournament,
        name: name.trim(),
        shortName: shortName.trim().toUpperCase().slice(0, 4),
        colorHex: color,
      });
      reset();
      onSaved();
    } catch (cause) {
      Alert.alert('Could not add team', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
            <Text variant="h2">Add team</Text>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>TEAM NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Mumbai Mavericks"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />

          <Text variant="caption" tone="muted" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>SHORT NAME (4 chars)</Text>
          <TextInput
            value={shortName}
            onChangeText={t => setShortName(t.toUpperCase().slice(0, 4))}
            placeholder="MUM"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="characters"
          />

          <Text variant="caption" tone="muted" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>COLOR</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {palette.team.map(c => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[
                  styles.colorDot,
                  { backgroundColor: c },
                  color === c && styles.colorDotActive,
                  usedColors.includes(c) && !{}.hasOwnProperty.call({}, 'x') && { opacity: 0.4 },
                ]}
              />
            ))}
          </View>

          <Button title="Add team" onPress={onSave} loading={saving} fullWidth size="lg" style={{ marginTop: spacing.xl }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surface,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
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
  mapImage: { width: '100%', height: 140 },
  mapFallback: { height: 100, alignItems: 'center', justifyContent: 'center' },
  mapCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
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
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
  },
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
    width: 36,
    textAlign: 'right',
  },
  statsEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  statsContent: {
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
});
