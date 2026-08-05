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

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { AppHeader } from '@/components/ui/AppHeader';
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
import { useAuth } from '@/components/providers/AuthProvider';
import { createOnlineTeam } from '@/lib/wricket/data/cloudFirst';
import { TournamentMvpLeaderboard } from '@/components/wricket/mvp/TournamentMvpLeaderboard';
import { StandingsCalculator } from '@/lib/wricket/fixtures';
import { tournamentStatsApi } from '@/lib/supabase/tournamentStatsApi';
import {
  scorerManagementApi,
  ScorerSearchResult,
  TournamentScorer,
} from '@/lib/supabase/scorerManagementApi';
import { TournamentShareBanner } from '@/components/wricket/tournament/TournamentShareBanner';
import { tournamentManagementApi } from '@/lib/supabase/tournamentManagementApi';
import { teamManagementApi } from '@/lib/supabase/teamManagementApi';

type Tab = 'fixtures' | 'table' | 'teams' | 'stats' | 'settings';

interface TournamentPlayerStats {
  id: string;
  name: string;
  runs: number;
  wickets: number;
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const auth = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [points, setPoints] = useState<PointsRow[]>([]);
  const [tab, setTab] = useState<Tab>('fixtures');
  const [tabsAtEnd, setTabsAtEnd] = useState(false);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showShareBanner, setShowShareBanner] = useState(false);
  const [stats, setStats] = useState<TournamentStats>({
    matches: 0, completedMatches: 0, balls: 0, runs: 0, wickets: 0, players: [],
  });
  const [generatedSetup, setGeneratedSetup] = useState<GeneratedFixtureSetup>({
    stages: [], groups: [], matches: [], bracket: null,
  });
  const [organizerContact, setOrganizerContact] = useState<{ name: string; phone?: string }>({ name: 'Tournament organiser' });

  const refresh = useCallback(async () => {
    if (!id) return;
    const [t, teamList, matchList, users] = await Promise.all([
      getTournament(id),
      listTeams(id),
      listMatches(id),
      listUsers(),
    ]);
    const cloudTeamIds = teamList.flatMap(team => team.cloudId ? [team.cloudId] : []);
    const cloudLogos = cloudTeamIds.length ? await teamManagementApi.listTeamLogos(cloudTeamIds) : new Map<string, string | undefined>();
    const refreshedTeams = teamList.map(team => team.cloudId && cloudLogos.has(team.cloudId)
      ? { ...team, logoUrl: cloudLogos.get(team.cloudId) }
      : team);
    setTournament(t);
    setTeams(refreshedTeams);
    if (t?.cloudId) {
      setOrganizerContact(await tournamentManagementApi.getOrganizerContact(t.cloudId));
    } else {
      setOrganizerContact({ name: 'Tournament organiser', phone: t?.organizerPhone });
    }
    setMatches(matchList);
    if (t?.cloudId && t.organizerProfileId === auth.session?.user.id) {
      await fixturesApi.advanceTournamentIfReady(t.cloudId);
    }
    setGeneratedSetup(t?.cloudId
      ? await fixturesApi.getFixtureSetup(t.cloudId)
      : { stages: [], groups: [], matches: [], bracket: null });
    const pts = await computePointsTable(id);
    setPoints(pts);
    setStats(t?.cloudId
      ? await tournamentStatsApi.get(t.cloudId)
      : await buildTournamentStats(matchList, users));
  }, [auth.session?.user.id, id]);

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

  if (!tournament) {
    return <Screen><Text tone="muted">Loading…</Text></Screen>;
  }

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title={tournament.name}
        back
        right={tournament.organizerProfileId === auth.session?.user.id ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Tournament settings" onPress={() => setTab('settings')} style={styles.headerAction}>
            <MaterialCommunityIcons name="cog-outline" size={22} color={colors.text} />
          </Pressable>
        ) : undefined}
      />
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.overviewContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
      >
        <View style={styles.overview}>
        <View style={styles.header}>
        <View style={styles.hero}>
          {(tournament.bannerUrl || tournament.bannerLocalUri)
            ? <Image source={{ uri: tournament.bannerUrl ?? tournament.bannerLocalUri }} style={styles.heroImage} />
            : <View style={styles.heroFallback}><View style={styles.pitchStripeOne} /><View style={styles.pitchStripeTwo} /><View style={styles.pitchSeam}>{Array.from({ length: 8 }, (_, index) => <View key={index} style={styles.pitchStitch} />)}</View></View>}
          <View style={[styles.statusPill, tournament.status === 'COMPLETED' && styles.statusPillComplete]}><Text variant="overline" tone={tournament.status === 'ACTIVE' ? 'accent' : 'muted'}>● {tournament.status}</Text></View>
          <View style={styles.heroCopy}><Text variant="overline" style={{ color: colors.gold }}>{FORMAT_LABEL[tournament.format]}</Text><Text variant="h2">{tournament.name}</Text></View>
        </View>
        <View style={styles.quickActions}>
          <Pressable style={styles.quickAction} onPress={() => setShowShareBanner(true)}><MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.textMuted} /><Text variant="caption">SHARE</Text></Pressable>
          {tournament.organizerProfileId === auth.session?.user.id ? <Pressable style={styles.quickAction} onPress={() => setTab('settings')}><MaterialCommunityIcons name="pencil-outline" size={18} color={colors.textMuted} /><Text variant="caption">EDIT</Text></Pressable> : <Pressable style={styles.quickAction} onPress={() => router.push({ pathname: '/wricket/tournament/[id]/moments', params: { id: tournament.id } })}><MaterialCommunityIcons name="image-multiple-outline" size={18} color={colors.gold} /><Text variant="caption">MOMENTS</Text></Pressable>}
          {tournament.organizerProfileId === auth.session?.user.id ? <Pressable style={styles.quickAction} onPress={() => setShowAddTeam(true)}><MaterialCommunityIcons name="account-plus-outline" size={18} color={colors.accent} /><Text variant="caption" tone="accent">ADD TEAM</Text></Pressable> : null}
        </View>
        <Card style={styles.infoCard}>
          <InfoRow icon="calendar-outline" text={formatTournamentDate(tournament.startDate)} />
          <InfoRow icon="account-group-outline" text={`${teams.length} teams · ${tournament.playersPerTeam} players per team`} />
          <InfoRow
            icon="account-outline"
            text={organizerContact.name}
            detail={organizerContact.phone}
            actions={organizerContact.phone ? [
              { label: 'CALL', onPress: () => void openOrganizerLink(`tel:${organizerContact.phone}`, 'calling') },
              { label: 'WHATSAPP', onPress: () => void openOrganizerLink(`https://wa.me/${organizerContact.phone!.replace(/\D/g, '')}`, 'WhatsApp') },
            ] : undefined}
            last={!tournament.location}
          />
          {tournament.location ? <InfoRow icon="map-marker-outline" text={tournament.location} last /> : null}
        </Card>
        {tournament.location && (
          <>
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
        {tournament.cloudId && (
          <View style={styles.momentsPreview}>
            <View style={styles.momentsPreviewTop}>
              <View style={styles.momentsIcon}><MaterialCommunityIcons name="image-multiple-outline" size={20} color={colors.accent} /></View>
              <View style={{ flex: 1 }}><Text variant="bodyStrong">Match Moments</Text><Text variant="caption" tone="muted">Photos and conversations from this tournament</Text></View>
              <Pressable onPress={() => router.push({ pathname: '/wricket/tournament/[id]/moments', params: { id: tournament.id } })}><Text variant="caption" tone="accent">VIEW ALL ›</Text></Pressable>
            </View>
          </View>
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
        </View>

        <View style={styles.tabBarShell}>
          <View pointerEvents="none" style={styles.stickyGapCover} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBar}
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }) => setTabsAtEnd(
              nativeEvent.contentOffset.x + nativeEvent.layoutMeasurement.width >= nativeEvent.contentSize.width - 8,
            )}
          >
            <TabBtn label="Fixtures" active={tab === 'fixtures'} onPress={() => setTab('fixtures')} />
            <TabBtn label="Table" active={tab === 'table'} onPress={() => setTab('table')} />
            <TabBtn label="Teams" active={tab === 'teams'} onPress={() => setTab('teams')} />
            <TabBtn label="Stats" active={tab === 'stats'} onPress={() => setTab('stats')} />
            {tournament.organizerProfileId === auth.session?.user.id && (
              <TabBtn label="Settings" active={tab === 'settings'} onPress={() => setTab('settings')} />
            )}
          </ScrollView>
          {!tabsAtEnd ? <View pointerEvents="none" style={styles.tabFadeEdge}><MaterialCommunityIcons name="chevron-right" size={22} color={colors.accent} /></View> : null}
        </View>

        <View style={styles.tabContent}>
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
          {tab === 'table' && (
            <PointsTableView rows={points} teams={teams} generatedSetup={generatedSetup} />
          )}
          {tab === 'teams' && (
            <TeamsView
              teams={teams}
              standings={points}
              generatedSetup={generatedSetup}
              plannedTeamCount={tournament.plannedTeamCount}
              canManage={tournament.organizerProfileId === auth.session?.user.id}
              onAdd={() => setShowAddTeam(true)}
            />
          )}
          {tab === 'stats' && (
            <View style={styles.statsPanelContent}>
              <TournamentStatsView stats={stats} />
              <TournamentMvpLeaderboard
                tournamentId={tournament.id}
                cloudTournamentId={tournament.cloudId}
              />
            </View>
          )}
          {tab === 'settings' && (
            <TournamentSettingsView
              tournament={tournament}
              teams={teams}
              hasGenerated={generatedSetup.stages.length > 0}
              onChanged={refresh}
            />
          )}
        </View>
      </ScrollView>

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
      <TournamentShareBanner
        tournament={tournament}
        teamCount={teams.length}
        matchCount={matches.length}
        visible={showShareBanner}
        onClose={() => setShowShareBanner(false)}
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

function InfoRow({ icon, text, detail, action, actions, last }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
  detail?: string;
  action?: { label: string; onPress: () => void };
  actions?: { label: string; onPress: () => void }[];
  last?: boolean;
}) {
  return <View style={[styles.infoRow, last && styles.infoRowLast]}>
    <MaterialCommunityIcons name={icon} size={19} color={colors.textMuted} />
    <View style={{ flex: 1 }}><Text variant="body">{text}</Text>{detail ? <Text variant="caption" tone="muted">{detail}</Text> : null}</View>
    {(actions ?? (action ? [action] : [])).map(item => <Pressable key={item.label} onPress={item.onPress} style={styles.infoAction}><Text variant="caption" tone="accent">{item.label}</Text></Pressable>)}
  </View>;
}

async function openOrganizerLink(url: string, channel: string): Promise<void> {
  try { await Linking.openURL(url); }
  catch { Alert.alert(`Could not open ${channel}`, 'This action is unavailable on your device.'); }
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
                        {item.groupId ? groupMap.get(item.groupId) ?? 'GROUP' : stageMap.get(item.stageId) ?? 'TOURNAMENT'} · {fixtureRoundLabel(item.round, stageMap.get(item.stageId))}
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
                            scheduledAt: item.scheduledAt,
                            venue: tournament.location,
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
                  ? '/wricket/match/[id]/live'
                  : isLive && !canManage
                    ? '/wricket/match/[id]/live'
                    : '/wricket/match/[id]/score',
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
              {isLive && (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text variant="caption" style={{ color: colors.danger }}>LIVE</Text>
                </View>
              )}
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
            <Text variant="caption" tone="muted" style={styles.numCol}>PTS</Text>
            <Text variant="caption" tone="muted" style={[styles.numCol, { width: 52 }]}>NRR</Text>
          </View>
          {standings.map(standing => {
            const team = cloudTeamMap.get(standing.teamId);
            return (
              <View key={standing.teamId} style={styles.tableRow}>
                <Text variant="bodyStrong" style={{ width: 24 }}>{standing.rank}</Text>
                <Text variant="bodyStrong" style={{ flex: 1 }}>{team?.shortName ?? '—'}</Text>
                <Text variant="body" style={styles.numCol}>{standing.played}</Text>
                <Text variant="body" style={styles.numCol}>{standing.won}</Text>
                <Text variant="body" style={styles.numCol}>{standing.lost}</Text>
                <Text variant="bodyStrong" tone="accent" style={styles.numCol}>{standing.points}</Text>
                <Text variant="body" style={[styles.numCol, { width: 52 }]}>
                  {groupNetRunRate(standing.teamId, generatedSetup.matches.filter(match => match.groupId === group.id))}
                </Text>
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
                return <View key={match.id} style={[styles.bracketMatch, isFinal && styles.bracketFinal]}>
                  <BracketScoreRow team={teamA?.shortName ?? 'TBD'} stat={teamAStats} fallback={fixture?.scoreA ?? match.scoreA} winner={winnerId === match.teamA} />
                  <View style={styles.bracketTeamDivider} />
                  <BracketScoreRow team={match.teamB ? teamB?.shortName ?? 'TBD' : 'BYE'} stat={teamBStats} fallback={fixture?.scoreB ?? match.scoreB} winner={Boolean(match.teamB && winnerId === match.teamB)} />
                  {resultText ? <Text variant="caption" tone="muted" style={styles.bracketResult}>{resultText}</Text> : null}
                </View>;
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
          {rows.map((row, index) => (
            <View key={row.teamId} style={styles.tableRow}>
              <Text variant="bodyStrong" style={{ width: 24 }}>{index + 1}</Text>
              <Text variant="bodyStrong" style={{ flex: 1 }}>{teamMap.get(row.teamId)?.shortName ?? '—'}</Text>
              <Text variant="caption" tone="muted">{row.played} played · {row.points} pts</Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function knockoutRoundLabel(name: string): string {
  return ({ QF: 'Quarter-finals', SF: 'Semi-finals', F: 'Final', '3RD_PLACE': 'Third place' } as Record<string, string>)[name] ?? name;
}

function fixtureRoundLabel(round: number, stageType?: string): string {
  if (stageType === 'KNOCKOUT') return round === 1 ? 'SF' : round === 2 ? 'FINAL' : `R${round}`;
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
  onChanged,
}: {
  tournament: Tournament;
  teams: Team[];
  hasGenerated: boolean;
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
    teams: String(tournament.plannedTeamCount), players: String(tournament.playersPerTeam),
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
      router.replace('/wricket');
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
    const teamsCount = Number(details.teams); const playersCount = Number(details.players);
    if (details.name.trim().length < 2) return Alert.alert('Name required', 'Enter a tournament name.');
    if (!Number.isInteger(teamsCount) || teamsCount < teams.length || teamsCount > 64) return Alert.alert('Invalid team count', `Choose ${teams.length} to 64 teams.`);
    if (!Number.isInteger(playersCount) || playersCount < 2 || playersCount > 25) return Alert.alert('Invalid squad size', 'Choose 2 to 25 players.');
    setSavingDetails(true);
    try {
      await tournamentManagementApi.updateDetails({ cloudTournamentId: tournament.cloudId, localTournamentId: tournament.id,
        name: details.name, startDate: details.startDate, location: details.location || undefined,
        plannedTeamCount: teamsCount, playersPerTeam: playersCount, organizerPhone: details.phone || undefined,
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
          <SettingsInput label="ORGANISER PHONE" value={details.phone} keyboardType="phone-pad" onChangeText={phone => setDetails(value => ({ ...value, phone }))} />
          <SettingsInput label="DESCRIPTION" value={details.description} multiline onChangeText={description => setDetails(value => ({ ...value, description }))} />
          <SettingsInput label="SOCIAL LINK" value={details.social} autoCapitalize="none" onChangeText={social => setDetails(value => ({ ...value, social }))} />
          <SettingsInput label="REWARDS / PRIZES" value={details.rewards} multiline onChangeText={rewards => setDetails(value => ({ ...value, rewards }))} />
          <Button title="Save tournament details" loading={savingDetails} onPress={() => void saveDetails()} fullWidth />
        </View> : null}
      </Card>
      {tournament.cloudId ? <ScorerSettingsCard tournamentId={tournament.cloudId} /> : (
        <Card><Text variant="h3">Manage scorers</Text><Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>Sync this tournament to the cloud before assigning scorers.</Text></Card>
      )}
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
      Alert.alert('Could not assign scorer', cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setBusyAccountId(undefined); }
  };

  const confirmRemove = (scorer: TournamentScorer) => {
    Alert.alert('Remove tournament scorer?', `${scorer.displayName} will no longer be able to score this tournament.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          setBusyAccountId(scorer.accountId);
          scorerManagementApi.remove(tournamentId, scorer.scorerId)
            .then(loadAssigned)
            .catch(cause => Alert.alert('Could not remove scorer', cause instanceof Error ? cause.message : 'Please try again.'))
            .finally(() => setBusyAccountId(undefined));
        },
      },
    ]);
  };

  return <Card>
    <View style={styles.scorerHeading}>
      <View style={styles.scorerIcon}><MaterialCommunityIcons name="scoreboard-outline" size={20} color={colors.accent} /></View>
      <View style={{ flex: 1 }}><Text variant="h3">Manage scorers</Text><Text variant="caption" tone="muted">Search and assign Wricket members who can score matches.</Text></View>
    </View>

    <TextInput
      value={query}
      onChangeText={setQuery}
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
    {actionLabel ? <Pressable disabled={disabled} onPress={onAction} style={[styles.scorerAction, disabled && styles.scorerActionDisabled]}><Text variant="overline" tone={actionLabel === 'REMOVE' ? 'danger' : 'accent'}>{actionLabel}</Text></Pressable> : null}
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
  if (kind === 'TIE') return 'Match tied';

  const winnerId = typeof result.winnerTeamId === 'string'
    ? result.winnerTeamId
    : typeof result.winner_team_id === 'string'
      ? result.winner_team_id
      : undefined;
  const winner = teams.find(team => team.id === winnerId)?.name
    ?? (winnerId ? 'Winning team' : undefined);
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

function TeamsView({
  teams,
  standings,
  generatedSetup,
  plannedTeamCount,
  canManage,
  onAdd,
}: {
  teams: Team[];
  standings: PointsRow[];
  generatedSetup: GeneratedFixtureSetup;
  plannedTeamCount: number;
  canManage: boolean;
  onAdd: () => void;
}) {
  const router = useRouter();
  const bracketRounds = generatedSetup.bracket?.rounds ?? [];
  const finalBracketMatch = bracketRounds[bracketRounds.length - 1]?.matches[0];
  const finalFixture = finalBracketMatch ? generatedSetup.matches.find(match => match.id === finalBracketMatch.id) : undefined;
  const championId = finalFixture?.result && (finalFixture.result.winnerTeamId ?? finalFixture.result.winner_team_id);
  const runnerUpId = finalBracketMatch && championId
    ? (championId === finalBracketMatch.teamA ? finalBracketMatch.teamB : finalBracketMatch.teamA)
    : undefined;

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
          scrollEnabled={false}
          data={teams}
          keyExtractor={t => t.id}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => {
            const localRecord = standings.find(row => row.teamId === item.id || row.teamId === item.cloudId);
            const cloudRecord = item.cloudId ? fixtureWinLoss(item.cloudId, generatedSetup.matches) : undefined;
            const record = cloudRecord?.played ? cloudRecord : localRecord;
            const special = item.cloudId === championId ? 'CHAMPION' : item.cloudId === runnerUpId ? 'RUNNER-UP' : undefined;
            return (
            <Card onPress={() => item.cloudId && router.push({
              pathname: '/wricket/team/[id]',
              params: { id: item.cloudId },
            })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={[styles.teamListSwatch, { backgroundColor: item.colorHex }]}>{item.logoUrl ? <Image source={{ uri: item.logoUrl }} style={styles.teamLogo} /> : <Text variant="bodyStrong" style={{ color: palette.black }}>{item.shortName}</Text>}</View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{item.name}</Text>
                  <View style={styles.teamRecordRow}>{special ? <Text variant="caption" style={{ color: colors.gold }}>{special}</Text> : null}<Text variant="caption" tone={record?.won ? 'accent' : 'muted'}>{record ? `${record.won}W – ${record.lost}L` : '0W – 0L'}</Text></View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textDim} />
              </View>
            </Card>
            );
          }}
        />
      )}
    </View>
  );
}

function fixtureWinLoss(teamId: string, matches: GeneratedFixtureSetup['matches']): { played: number; won: number; lost: number } {
  return matches.reduce((record, match) => {
    if ((match.status !== 'COMPLETED' && match.status !== 'WALKOVER') || (match.teamA !== teamId && match.teamB !== teamId)) {
      return record;
    }
    const winnerId = match.result && (match.result.winnerTeamId ?? match.result.winner_team_id);
    if (typeof winnerId !== 'string') return { ...record, played: record.played + 1 };
    return winnerId === teamId
      ? { ...record, played: record.played + 1, won: record.won + 1 }
      : { ...record, played: record.played + 1, lost: record.lost + 1 };
  }, { played: 0, won: 0, lost: 0 });
}

function TournamentStatsView({ stats }: { stats: TournamentStats }) {
  const router = useRouter();
  const topRuns = [...stats.players].filter(player => player.runs > 0)
    .sort((a, b) => b.runs - a.runs).slice(0, 5);
  const topWickets = [...stats.players].filter(player => player.wickets > 0)
    .sort((a, b) => b.wickets - a.wickets).slice(0, 5);
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
    <View style={styles.statsContent}>
      <View style={styles.statsSummary}>
        <StatTile label="MATCHES" value={String(stats.matches)} detail={`${stats.completedMatches} completed`} />
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
    matches: matches.length,
    completedMatches: matches.filter(match => match.status === 'COMPLETED').length,
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
  const auth = useAuth();
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [color, setColor] = useState<string>(palette.team[0]);
  const [saving, setSaving] = useState(false);
  const [logoUri, setLogoUri] = useState<string>();

  const reset = () => {
    setName('');
    setShortName('');
    setColor(palette.team[0]);
    setLogoUri(undefined);
  };

  const pickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo permission needed', 'Allow photo access to choose a team logo.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setLogoUri(result.assets[0].uri);
  };

  const onSave = async () => {
    if (!name.trim() || !shortName.trim()) {
      Alert.alert('Missing info', 'Name and short name are required.');
      return;
    }
    if (!auth.session || tournament.organizerProfileId !== auth.session.user.id) {
      Alert.alert('Owner access required', 'Only the tournament owner can add teams.');
      return;
    }
    setSaving(true);
    try {
      await createOnlineTeam({
        tournament,
        name: name.trim(),
        shortName: shortName.trim().toUpperCase().slice(0, 4),
        colorHex: color,
        logoLocalUri: logoUri,
        userId: auth.session.user.id,
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

          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>TEAM LOGO (OPTIONAL)</Text>
          <Pressable onPress={() => void pickLogo()} style={[styles.teamLogoPicker, { backgroundColor: color }]}>
            {logoUri ? <Image source={{ uri: logoUri }} style={styles.teamLogoPreview} /> : <><MaterialCommunityIcons name="image-plus" size={26} color={palette.black} /><Text variant="caption" style={{ color: palette.black }}>CHOOSE LOGO</Text></>}
          </Pressable>

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
  headerAction: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  quickActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  quickAction: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
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
  hero: { height: 150, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface, position: 'relative' },
  heroImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined, opacity: 0.58 },
  heroFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  pitchStripeOne: { position: 'absolute', top: 0, bottom: 0, left: '18%', width: '18%', backgroundColor: 'rgba(95, 227, 138, 0.035)' },
  pitchStripeTwo: { position: 'absolute', top: 0, bottom: 0, right: '18%', width: '18%', backgroundColor: 'rgba(95, 227, 138, 0.035)' },
  pitchSeam: { height: 112, width: 18, borderLeftWidth: 2, borderRightWidth: 2, borderColor: 'rgba(232, 196, 104, 0.36)', alignItems: 'center', justifyContent: 'space-around' },
  pitchStitch: { width: 9, height: 2, transform: [{ rotate: '-25deg' }], backgroundColor: 'rgba(232, 196, 104, 0.6)' },
  heroCopy: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md },
  infoCard: { padding: 0, marginTop: spacing.md, overflow: 'hidden' },
  infoRow: { minHeight: 48, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoRowLast: { borderBottomWidth: 0 },
  infoAction: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.accentMuted },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.xs },
  statusPill: { position: 'absolute', top: spacing.sm, right: spacing.sm, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: colors.accentMuted },
  statusPillComplete: { backgroundColor: colors.surfaceElevated },
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
    elevation: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
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
    width: 36,
    textAlign: 'right',
  },
  publicTables: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  bracketRail: { alignItems: 'center', paddingBottom: spacing.md },
  bracketColumn: { width: 210, gap: spacing.sm },
  bracketMatches: { flex: 1, justifyContent: 'space-around', gap: spacing.lg, minHeight: 170 },
  bracketMatch: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
  },
  bracketScoreRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  bracketTeamDivider: { height: 1, backgroundColor: colors.border },
  bracketResult: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, textAlign: 'center' },
  bracketFinal: { borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.goldMuted },
  bracketConnector: { width: 28, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  bracketConnectorFork: { position: 'absolute', height: '58%', width: 14, left: 0, borderTopWidth: 2, borderBottomWidth: 2, borderRightWidth: 2, borderColor: colors.borderStrong },
  bracketConnectorLine: { width: 28, height: 2, backgroundColor: colors.borderStrong },
  championColumn: { width: 108, minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
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
  scorerAction: { minWidth: 64, minHeight: 34, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
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
