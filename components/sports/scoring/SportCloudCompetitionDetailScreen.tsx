import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSportFeatureFlag } from '@/hooks/useSportFeatureFlag';
import { getNextCompetitionLifecycleActions } from '@/lib/sports/platform/competitionLifecycle';
import {
  formatZonedDateTime,
  formatZonedDateTimeLabel,
  parseZonedDateTime,
} from '@/lib/sports/platform/zonedDateTime';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import { normalizeCompetitionRpcMessage } from '@/lib/supabase/competitionRpcMessages';
import {
  sportCompetitionApi,
  type CloudCompetitionDetail,
  type CloudCompetitionLifecycle,
  type CloudCompetitionOrganizer,
  type CloudCompetitionStage,
  type CloudCompetitionVenue,
  type CloudFixture,
  type CloudFixtureMatchDraft,
  type CloudFixtureOfficial,
} from '@/lib/supabase/sportCompetitionApi';
import { sportRosterApi, type SportPlayerSearchResult, type SportTeamSummary } from '@/lib/supabase/sportRosterApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportCloudCompetitionUnavailable } from './SportCloudCompetitionUnavailable';

type Tab = 'overview' | 'entrants' | 'schedule' | 'points' | 'officials' | 'manage';
type ManagedResource = { type: 'STAGE' | 'VENUE' | 'DIVISION'; id: string; name: string; address?: string; capacity?: number };

export function SportCloudCompetitionDetailScreen({ sportId }: { sportId: ScoringSportId }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const cloudCompetitions = useSportFeatureFlag(
    'cloud_competitions',
    presentation.catalogCode,
    auth.session?.user.id,
  );
  const [detail, setDetail] = useState<CloudCompetitionDetail>();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [resourceOpen, setResourceOpen] = useState<'STAGE' | 'VENUE' | 'DIVISION'>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<SportPlayerSearchResult[]>([]);
  const [organizerResults, setOrganizerResults] = useState<SportPlayerSearchResult[]>([]);
  const [organizers, setOrganizers] = useState<CloudCompetitionOrganizer[]>([]);
  const [organizerQuery, setOrganizerQuery] = useState('');
  const [teams, setTeams] = useState<SportTeamSummary[]>([]);
  const [ownSportProfileId, setOwnSportProfileId] = useState<string>();
  const [resourceName, setResourceName] = useState('');
  const [resourceCapacity, setResourceCapacity] = useState('');
  const [editingResource, setEditingResource] = useState<ManagedResource>();
  const [pointsOpen, setPointsOpen] = useState(false);
  const [pointValues, setPointValues] = useState({ win: '2', draw: '1', loss: '0', walkover: '2' });
  const [officialOpen, setOfficialOpen] = useState(false);
  const [officialQuery, setOfficialQuery] = useState('');
  const [officialResults, setOfficialResults] = useState<SportPlayerSearchResult[]>([]);
  const [officialFixtureId, setOfficialFixtureId] = useState<string>();
  const [officialRole, setOfficialRole] = useState<CloudFixtureOfficial['role']>('SCOREKEEPER');
  const [sideAId, setSideAId] = useState<string>();
  const [sideBId, setSideBId] = useState<string>();
  const [divisionKey, setDivisionKey] = useState('OPEN');
  const [stageId, setStageId] = useState<string>();
  const [venueId, setVenueId] = useState<string>();
  const [court, setCourt] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [editingFixture, setEditingFixture] = useState<CloudFixture>();
  const [newTieMatches, setNewTieMatches] = useState<CloudFixtureMatchDraft[]>([
    { format: 'SINGLES', label: 'Singles 1' },
  ]);
  const [draftingTie, setDraftingTie] = useState<CloudFixture>();
  const [tieMatches, setTieMatches] = useState<CloudFixtureMatchDraft[]>([]);
  const [cancellingFixture, setCancellingFixture] = useState<CloudFixture>();
  const [cancellingCompetition, setCancellingCompetition] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTimezone, setEditTimezone] = useState('UTC');
  const [editVisibility, setEditVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editRegistrationOpensAt, setEditRegistrationOpensAt] = useState('');
  const [editRegistrationClosesAt, setEditRegistrationClosesAt] = useState('');

  const reload = useCallback(() => {
    if (!id || !cloudCompetitions.enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const accountId = auth.session?.user.id;
    void Promise.all([
      sportCompetitionApi.get(id),
      accountId ? sportRosterApi.getMySportProfile(accountId, presentation.catalogCode) : undefined,
      accountId ? sportRosterApi.listManageableTeams(presentation.catalogCode) : [],
    ]).then(async ([nextDetail, profile, manageableTeams]) => {
      setDetail(nextDetail);
      setOwnSportProfileId(profile?.id);
      setTeams(manageableTeams);
      setEditName(nextDetail.competition.name);
      setEditDescription(nextDetail.competition.description ?? '');
      setEditTimezone(nextDetail.competition.timezone);
      setEditVisibility(nextDetail.competition.visibility);
      setEditStartsAt(formatZonedDateTime(nextDetail.competition.startsAt, nextDetail.competition.timezone));
      setEditEndsAt(formatZonedDateTime(nextDetail.competition.endsAt, nextDetail.competition.timezone));
      setEditRegistrationOpensAt(formatZonedDateTime(nextDetail.competition.registrationOpensAt, nextDetail.competition.timezone));
      setEditRegistrationClosesAt(formatZonedDateTime(nextDetail.competition.registrationClosesAt, nextDetail.competition.timezone));
      setOrganizers(nextDetail.canManage ? await sportCompetitionApi.listOrganizers(nextDetail.competition.id) : []);
    })
      .catch((cause) => Alert.alert('Could not load competition', message(cause)))
      .finally(() => setLoading(false));
  }, [auth.session?.user.id, cloudCompetitions.enabled, id, presentation.catalogCode]);
  useFocusEffect(reload);

  useEffect(() => {
    if (!entryOpen || !detail) return;
    if (detail.competition.kind === 'TOURNAMENT') {
      void sportRosterApi.listManageableTeams(presentation.catalogCode).then(setTeams)
        .catch((cause) => Alert.alert('Could not load teams', message(cause)));
      return;
    }
    if (query.trim().length < 2) { setPlayers([]); return; }
    const timer = setTimeout(() => {
      void sportRosterApi.searchPlayers(presentation.catalogCode, query).then(setPlayers)
        .catch((cause) => Alert.alert('Could not search players', message(cause)));
    }, 250);
    return () => clearTimeout(timer);
  }, [detail, entryOpen, presentation.catalogCode, query]);

  useEffect(() => {
    if (!organizerOpen || organizerQuery.trim().length < 2) { setOrganizerResults([]); return; }
    const timer = setTimeout(() => {
      void sportRosterApi.searchPlayers(presentation.catalogCode, organizerQuery).then(setOrganizerResults)
        .catch((cause) => Alert.alert('Could not search organizers', message(cause)));
    }, 250);
    return () => clearTimeout(timer);
  }, [organizerOpen, organizerQuery, presentation.catalogCode]);

  useEffect(() => {
    if (!officialOpen || officialQuery.trim().length < 2) { setOfficialResults([]); return; }
    const timer = setTimeout(() => {
      void sportRosterApi.searchPlayers(presentation.catalogCode, officialQuery).then(setOfficialResults)
        .catch((cause) => Alert.alert('Could not search officials', message(cause)));
    }, 250);
    return () => clearTimeout(timer);
  }, [officialOpen, officialQuery, presentation.catalogCode]);

  const entryById = useMemo(() => new Map(detail?.entries.map((entry) => [entry.id, entry]) ?? []), [detail]);
  const venueById = useMemo(() => new Map(detail?.venues.map((venue) => [venue.id, venue]) ?? []), [detail]);
  const controllableEntries = useMemo(() => new Set(detail?.entries.filter((entry) => (
    detail.canManage || entry.sportProfileId === ownSportProfileId
      || Boolean(entry.sourceTeamId && teams.some((team) => team.id === entry.sourceTeamId))
  )).map((entry) => entry.id) ?? []), [detail, ownSportProfileId, teams]);

  const run = async (action: () => Promise<unknown>, title: string) => {
    if (saving) return;
    setSaving(true);
    try { await action(); reload(); }
    catch (cause) { Alert.alert(title, message(cause)); }
    finally { setSaving(false); }
  };

  const transition = (target: CloudCompetitionLifecycle) => {
    if (!detail) return;
    if (target === 'CANCELLED') {
      setCancellationReason('');
      setCancellingCompetition(true);
      return;
    }
    void run(() => sportCompetitionApi.transition(detail.competition.id, target), 'Could not change competition status');
  };

  const confirmCancellation = () => {
    if (!detail || !cancellationReason.trim()) return;
    void run(async () => {
      if (cancellingFixture) {
        await sportCompetitionApi.cancelFixture(
          cancellingFixture, detail.competition.scheduleVersion, cancellationReason,
        );
      } else if (cancellingCompetition) {
        await sportCompetitionApi.transition(detail.competition.id, 'CANCELLED', cancellationReason);
      }
      setCancellingFixture(undefined);
      setCancellingCompetition(false);
      setCancellationReason('');
    }, cancellingFixture ? 'Could not cancel fixture' : 'Could not cancel competition');
  };

  const registerPlayer = (player: SportPlayerSearchResult) => {
    if (!detail) return;
    void run(async () => {
      await sportCompetitionApi.registerLeaguePlayer(detail.competition.id, player.sportProfileId, divisionKey);
      setEntryOpen(false); setQuery('');
    }, 'Could not register player');
  };

  const registerTeam = (team: SportTeamSummary) => {
    if (!detail) return;
    void run(async () => {
      const canSubmitSquad = await sportRosterApi.canManageTeam(team.id);
      if (!canSubmitSquad) {
        throw new Error('Only the team owner, manager, or captain can register this squad. Pick a team you manage or captain.');
      }
      await sportCompetitionApi.registerTournamentSquad(detail.competition.id, team.id, divisionKey);
      setEntryOpen(false);
    }, 'Could not register squad');
  };

  const registerSelf = () => {
    const accountId = auth.session?.user.id;
    if (!detail || !accountId) return;
    void run(async () => {
      const profile = await sportRosterApi.getMySportProfile(accountId, presentation.catalogCode);
      if (!profile) throw new Error(`Connect ${config.name} to your SportStage account first.`);
      await sportCompetitionApi.registerLeaguePlayer(detail.competition.id, profile.id, divisionKey);
    }, 'Could not register');
  };

  const addResource = () => {
    if (!detail || !resourceOpen || !resourceName.trim()) return;
    void run(async () => {
      if (resourceOpen === 'STAGE') {
        await sportCompetitionApi.addStage(detail.competition.id, resourceName, 'CUSTOM', detail.stages.length);
      } else if (resourceOpen === 'VENUE') {
        await sportCompetitionApi.addVenue(detail.competition.id, resourceName);
      } else {
        const key = resourceName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
        const capacity = resourceCapacity.trim() ? Number(resourceCapacity) : undefined;
        if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 2)) throw new Error('Capacity must be at least 2.');
        await sportCompetitionApi.addDivision(detail.competition.id, key, resourceName, detail.divisions.length, capacity);
      }
      setResourceName(''); setResourceCapacity(''); setResourceOpen(undefined);
    }, `Could not add ${resourceOpen.toLowerCase()}`);
  };

  const moveFixture = (index: number, direction: -1 | 1) => {
    if (!detail) return;
    const target = index + direction;
    if (target < 0 || target >= detail.fixtures.length) return;
    const ordered = detail.fixtures.map((fixture) => fixture.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    void run(() => sportCompetitionApi.reorderFixtures(
      detail.competition.id, ordered, detail.competition.scheduleVersion,
    ), 'Could not reorder fixtures');
  };

  const moveResource = (type: 'STAGE' | 'VENUE' | 'DIVISION', index: number, direction: -1 | 1) => {
    if (!detail) return;
    const resources = type === 'STAGE' ? detail.stages : type === 'VENUE' ? detail.venues : detail.divisions;
    const target = index + direction;
    if (target < 0 || target >= resources.length) return;
    const ordered = resources.map((resource) => resource.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    void run(() => sportCompetitionApi.reorderResources(detail.competition.id, type, ordered), `Could not reorder ${type.toLowerCase()}s`);
  };

  const openPoints = () => {
    if (!detail) return;
    setPointValues({
      win: String(detail.pointsRule.winPoints), draw: String(detail.pointsRule.drawPoints),
      loss: String(detail.pointsRule.lossPoints), walkover: String(detail.pointsRule.walkoverPoints),
    });
    setPointsOpen(true);
  };

  const savePoints = () => {
    if (!detail) return;
    const values = [pointValues.win, pointValues.draw, pointValues.loss, pointValues.walkover].map(Number);
    if (values.some((value) => !Number.isInteger(value) || value < 0)) {
      Alert.alert('Invalid points', 'Every points value must be a non-negative whole number.'); return;
    }
    void run(async () => {
      await sportCompetitionApi.updatePointsRule(detail.competition.id, {
        winPoints: values[0], drawPoints: values[1], lossPoints: values[2],
        walkoverPoints: values[3], version: detail.pointsRule.version,
      });
      setPointsOpen(false);
    }, 'Could not update points rules');
  };

  const assignOfficial = (player: SportPlayerSearchResult) => {
    if (!officialFixtureId) return;
    void run(async () => {
      await sportCompetitionApi.assignOfficial(officialFixtureId, player.accountId, officialRole);
      setOfficialOpen(false); setOfficialQuery('');
    }, 'Could not assign official');
  };

  const saveResource = () => {
    if (!editingResource?.name.trim()) return;
    void run(async () => {
      await sportCompetitionApi.updateResource(
        editingResource.type, editingResource.id, editingResource.name,
        editingResource.address, editingResource.capacity,
      );
      setEditingResource(undefined);
    }, 'Could not update resource');
  };

  const deleteResource = (resource: ManagedResource) => Alert.alert(
    `Delete ${resource.type.toLowerCase()}?`, resource.name,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void run(
      () => sportCompetitionApi.deleteResource(resource.type, resource.id), 'Could not delete resource',
    ) }],
  );

  const saveSettings = () => {
    if (!detail || !editName.trim() || !editTimezone.trim()) return;
    try {
      const startsAt = parseZonedDateTime(editStartsAt, editTimezone);
      const endsAt = parseZonedDateTime(editEndsAt, editTimezone);
      const registrationOpensAt = parseZonedDateTime(editRegistrationOpensAt, editTimezone);
      const registrationClosesAt = parseZonedDateTime(editRegistrationClosesAt, editTimezone);
      void run(async () => {
        await sportCompetitionApi.update(detail.competition, {
          name: editName, description: editDescription, visibility: editVisibility,
          timezone: editTimezone, startsAt, endsAt, registrationOpensAt, registrationClosesAt,
        });
        setSettingsOpen(false);
      }, 'Could not update competition');
    } catch (cause) { Alert.alert('Invalid date', message(cause)); }
  };

  const inviteOrganizer = (player: SportPlayerSearchResult) => {
    if (!detail) return;
    void run(async () => {
      await sportCompetitionApi.inviteOrganizer(detail.competition.id, player.accountId);
      setOrganizerOpen(false); setOrganizerQuery('');
    }, 'Could not invite organizer');
  };

  const transferOwnership = (organizer: CloudCompetitionOrganizer) => {
    if (!detail) return;
    Alert.alert('Transfer competition ownership?', `${organizer.displayName} will become the owner. This action changes your access immediately.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Transfer', style: 'destructive', onPress: () => void run(
        () => sportCompetitionApi.transferOwnership(detail.competition.id, organizer.accountId),
        'Could not transfer ownership',
      ) },
    ]);
  };

  const schedule = () => {
    if (!detail || !sideAId || !sideBId || sideAId === sideBId) return;
    let parsed: string | undefined;
    try {
      parsed = parseZonedDateTime(scheduledAt, detail.competition.timezone);
    } catch (cause) {
      Alert.alert('Invalid competition time', message(cause));
      return;
    }
    void run(async () => {
      if (editingFixture) {
        await sportCompetitionApi.rescheduleFixture(editingFixture, detail.competition.scheduleVersion, {
          venueId, court, scheduledAt: parsed, displayOrder: editingFixture.displayOrder,
        });
      } else {
        await sportCompetitionApi.schedule({
          competitionId: detail.competition.id, stageId, divisionKey,
          entrantAId: sideAId, entrantBId: sideBId, venueId, court,
          scheduledAt: parsed, displayOrder: detail.fixtures.length,
          expectedScheduleVersion: detail.competition.scheduleVersion,
          idempotencyKey: `fixture-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          matches: detail.competition.kind === 'TOURNAMENT' ? newTieMatches : undefined,
        });
      }
      setScheduleOpen(false); setEditingFixture(undefined); setSideAId(undefined); setSideBId(undefined);
    }, 'Could not schedule fixture');
  };

  const openReschedule = (fixture: CloudFixture) => {
    if (!detail) return;
    setEditingFixture(fixture); setSideAId(fixture.entrantAId); setSideBId(fixture.entrantBId);
    setDivisionKey(fixture.divisionKey);
    setStageId(fixture.stageId); setVenueId(fixture.venueId); setCourt(fixture.court ?? '');
    setScheduledAt(formatZonedDateTime(fixture.scheduledAt, detail.competition.timezone)); setScheduleOpen(true);
  };

  const openTieDraft = (fixture: CloudFixture) => {
    setDraftingTie(fixture);
    setTieMatches(fixture.matches.map(({ format, label }) => ({ format, label })));
  };

  const saveTieDraft = () => {
    if (!detail || !draftingTie || !tieMatches.length) return;
    void run(async () => {
      await sportCompetitionApi.updateTeamTieMatches(
        draftingTie, detail.competition.scheduleVersion, tieMatches,
      );
      setDraftingTie(undefined);
    }, 'Could not update team-tie matches');
  };

  if (cloudCompetitions.loading || !cloudCompetitions.enabled) return <SportCloudCompetitionUnavailable loading={cloudCompetitions.loading} sportId={sportId} />;
  if (loading) return <Screen><View style={styles.center}><ActivityIndicator color={presentation.accent} /><Text tone="muted">Loading cloud competition…</Text></View></Screen>;
  if (!detail) return <Screen padded={false}><AppHeader title="Competition" back /><View style={styles.center}><Text variant="h3">Competition unavailable</Text></View></Screen>;
  const { competition } = detail;
  const approvedEntries = detail.entries.filter((entry) => entry.status === 'APPROVED');

  return <Screen scroll padded={false}>
    <AppHeader title={competition.name} eyebrow={`${config.name.toUpperCase()} · ${competition.lifecycle.replaceAll('_', ' ')}`} back />
    <View style={styles.content}>
      <View style={[styles.hero, { borderColor: presentation.accent }]}><MaterialCommunityIcons name={competition.kind === 'TOURNAMENT' ? 'trophy-outline' : 'table-large'} size={30} color={presentation.accent} /><View style={styles.flex}><Text variant="h1">{competition.name}</Text><Text variant="caption" tone="muted">{competition.kind} · {competition.visibility}</Text></View></View>
      <View style={styles.tabs}>{(['overview', 'entrants', 'schedule', 'points', 'officials', 'manage'] as const).map((value) => <Pressable key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && { borderColor: presentation.accent }]}><Text variant="overline" style={tab === value ? { color: presentation.accent } : undefined}>{value}</Text></Pressable>)}</View>

      {tab === 'overview' ? <>
        <Info label="STATUS" value={competition.lifecycle.replaceAll('_', ' ')} />
        <Info label="TIMEZONE" value={competition.timezone} />
        <Info label="REGISTRATION" value={competition.lifecycle === 'REGISTRATION_OPEN' ? 'OPEN' : 'CLOSED'} />
        <Info label="SCHEDULE VERSION" value={String(competition.scheduleVersion)} />
        {detail.canManage ? <Button title="Edit competition details" onPress={() => setSettingsOpen(true)} fullWidth /> : null}
        {competition.lifecycle === 'REGISTRATION_OPEN' && competition.kind === 'LEAGUE' ? <Button title="Register myself" onPress={registerSelf} fullWidth style={{ backgroundColor: presentation.accent }} /> : null}
        {!detail.canManage && competition.lifecycle === 'REGISTRATION_OPEN' && competition.kind === 'TOURNAMENT' ? <Button title="Register one of my teams" onPress={() => setEntryOpen(true)} fullWidth style={{ backgroundColor: presentation.accent }} /> : null}
      </> : null}

      {tab === 'entrants' ? <>
        <View style={styles.heading}><Text variant="overline" tone="dim">ENTRANTS · {detail.entries.length}</Text>{detail.canManage ? <SmallAction label="ADD" onPress={() => setEntryOpen(true)} accent={presentation.accent} /> : null}</View>
        {detail.entries.map((entry) => <View key={entry.id} style={styles.card}><View style={styles.flex}><Text variant="bodyStrong">{entry.displayName}</Text><Text variant="caption" tone="muted">{entry.divisionKey} · {entry.status}</Text></View><View style={styles.actions}>{detail.canManage && entry.status === 'PENDING' ? <><Pressable onPress={() => void run(() => sportCompetitionApi.setEntryStatus(entry.id, 'REJECTED'), 'Could not reject entry')}><Text variant="overline" tone="danger">REJECT</Text></Pressable><Pressable onPress={() => void run(() => sportCompetitionApi.setEntryStatus(entry.id, 'APPROVED'), 'Could not approve entry')}><Text variant="overline" style={{ color: presentation.accent }}>APPROVE</Text></Pressable></> : null}{detail.canManage && entry.status === 'APPROVED' ? <Pressable onPress={() => void run(() => sportCompetitionApi.setEntryStatus(entry.id, 'DISQUALIFIED'), 'Could not disqualify entry')}><Text variant="overline" tone="danger">DISQUALIFY</Text></Pressable> : null}{controllableEntries.has(entry.id) && ['PENDING', 'APPROVED'].includes(entry.status) ? <Pressable onPress={() => void run(() => sportCompetitionApi.withdrawEntry(entry.id), 'Could not withdraw entry')}><Text variant="overline" tone="danger">WITHDRAW</Text></Pressable> : null}</View></View>)}
        {!detail.entries.length ? <Empty copy="No registrations yet." /> : null}
      </> : null}

      {tab === 'schedule' ? <>
        <View style={styles.heading}><Text variant="overline" tone="dim">MANUAL FIXTURES · {detail.fixtures.length}</Text>{detail.canManage ? <SmallAction label="SCHEDULE" onPress={() => setScheduleOpen(true)} accent={presentation.accent} /> : null}</View>
        {detail.fixtures.map((fixture, index) => <FixtureRow key={fixture.id} fixture={fixture} sideA={entryById.get(fixture.entrantAId)?.displayName} sideB={entryById.get(fixture.entrantBId)?.displayName} venue={fixture.venueId ? venueById.get(fixture.venueId) : undefined} timeZone={competition.timezone} canManage={detail.canManage} isTournament={competition.kind === 'TOURNAMENT'} accent={presentation.accent} checkIns={new Map(detail.checkIns.filter((item) => item.fixtureId === fixture.id).map((item) => [item.entryId, item.status]))} controllableEntries={controllableEntries} onCheckIn={(entryId, status = 'CHECKED_IN') => void run(() => sportCompetitionApi.checkIn(fixture.id, entryId, status), 'Could not update check-in')} onMoveUp={index ? () => moveFixture(index, -1) : undefined} onMoveDown={index < detail.fixtures.length - 1 ? () => moveFixture(index, 1) : undefined} onEditTie={() => openTieDraft(fixture)} onReschedule={() => openReschedule(fixture)} onCancel={() => { setCancellationReason(''); setCancellingFixture(fixture); }} />)}
        {!detail.fixtures.length ? <Empty copy="No fixtures. Owners schedule every matchup manually." /> : null}
      </> : null}

      {tab === 'points' ? <>
        <View style={styles.heading}><Text variant="overline" tone="dim">POINTS SYSTEM · VERSION {detail.pointsRule.version}</Text>{detail.canManage ? <SmallAction label="EDIT" onPress={openPoints} accent={presentation.accent} /> : null}</View>
        <Info label="WIN" value={String(detail.pointsRule.winPoints)} />
        <Info label="DRAW" value={String(detail.pointsRule.drawPoints)} />
        <Info label="LOSS" value={String(detail.pointsRule.lossPoints)} />
        <Info label="WALKOVER" value={String(detail.pointsRule.walkoverPoints)} />
        <Text variant="caption" tone="muted">Published points rules are locked and never silently rewrite standings.</Text>
      </> : null}

      {tab === 'officials' ? <>
        <View style={styles.heading}><Text variant="overline" tone="dim">MATCH OFFICIALS · {detail.officials.length}</Text>{detail.canManage && detail.fixtures.length ? <SmallAction label="ASSIGN" onPress={() => { setOfficialFixtureId(detail.fixtures[0]?.id); setOfficialOpen(true); }} accent={presentation.accent} /> : null}</View>
        {detail.officials.map((official) => <View key={official.id} style={styles.card}><View style={styles.flex}><Text variant="bodyStrong">{official.displayName}</Text><Text variant="caption" tone="muted">{official.role} · {entryById.get(detail.fixtures.find((fixture) => fixture.id === official.fixtureId)?.entrantAId ?? '')?.displayName ?? 'Fixture'} assignment</Text></View>{detail.canManage ? <Pressable onPress={() => void run(() => sportCompetitionApi.revokeOfficial(official.id), 'Could not revoke official')}><Text variant="overline" tone="danger">REVOKE</Text></Pressable> : null}</View>)}
        {!detail.officials.length ? <Empty copy="No scorers or referees assigned yet." /> : null}
      </> : null}

      {tab === 'manage' ? detail.canManage ? <>
        <View style={styles.heading}><Text variant="overline" tone="dim">STAGES</Text><SmallAction label="ADD" onPress={() => setResourceOpen('STAGE')} accent={presentation.accent} /></View>
        {detail.stages.map((stage, index) => <ResourceRow key={stage.id} name={stage.name} detail={stage.kind} onMoveUp={index ? () => moveResource('STAGE', index, -1) : undefined} onMoveDown={index < detail.stages.length - 1 ? () => moveResource('STAGE', index, 1) : undefined} onEdit={() => setEditingResource({ type: 'STAGE', id: stage.id, name: stage.name })} onDelete={() => deleteResource({ type: 'STAGE', id: stage.id, name: stage.name })} />)}
        <View style={styles.heading}><Text variant="overline" tone="dim">VENUES</Text><SmallAction label="ADD" onPress={() => setResourceOpen('VENUE')} accent={presentation.accent} /></View>
        {detail.venues.map((venue, index) => <ResourceRow key={venue.id} name={venue.name} detail={venue.address ?? 'Venue'} onMoveUp={index ? () => moveResource('VENUE', index, -1) : undefined} onMoveDown={index < detail.venues.length - 1 ? () => moveResource('VENUE', index, 1) : undefined} onEdit={() => setEditingResource({ type: 'VENUE', id: venue.id, name: venue.name, address: venue.address })} onDelete={() => deleteResource({ type: 'VENUE', id: venue.id, name: venue.name })} />)}
        <View style={styles.heading}><Text variant="overline" tone="dim">DIVISIONS</Text><SmallAction label="ADD" onPress={() => setResourceOpen('DIVISION')} accent={presentation.accent} /></View>
        {detail.divisions.map((division, index) => { const occupied = detail.entries.filter((entry) => entry.divisionKey === division.divisionKey && !['WITHDRAWN', 'REJECTED', 'DISQUALIFIED'].includes(entry.status)).length; return <ResourceRow key={division.id} name={division.name} detail={`${division.divisionKey} · ${occupied}/${division.registrationCapacity ?? '∞'} registered`} onMoveUp={index ? () => moveResource('DIVISION', index, -1) : undefined} onMoveDown={index < detail.divisions.length - 1 ? () => moveResource('DIVISION', index, 1) : undefined} onEdit={() => setEditingResource({ type: 'DIVISION', id: division.id, name: division.name, capacity: division.registrationCapacity })} onDelete={() => deleteResource({ type: 'DIVISION', id: division.id, name: division.name })} />; })}
        <View style={styles.heading}><Text variant="overline" tone="dim">ORGANIZERS</Text><SmallAction label="INVITE" onPress={() => setOrganizerOpen(true)} accent={presentation.accent} /></View>
        {organizers.map((organizer) => <View key={organizer.accessId} style={styles.card}><View style={styles.flex}><Text variant="bodyStrong">{organizer.displayName}</Text><Text variant="caption" tone="muted">{organizer.status}</Text></View>{competition.ownerAccountId === auth.session?.user.id && organizer.status === 'ACTIVE' ? <Pressable onPress={() => transferOwnership(organizer)}><Text variant="overline" style={{ color: presentation.accent }}>TRANSFER OWNER</Text></Pressable> : null}{competition.ownerAccountId === auth.session?.user.id ? <Pressable onPress={() => void run(() => sportCompetitionApi.revokeOrganizer(competition.id, organizer.accountId), 'Could not revoke organizer')}><Text variant="overline" tone="danger">REVOKE</Text></Pressable> : null}</View>)}
        <Text variant="overline" tone="dim">LIFECYCLE ACTIONS</Text>
        <View style={styles.lifecycle}>{getNextCompetitionLifecycleActions(competition.lifecycle).map((target) => <Button key={target} title={target.replaceAll('_', ' ')} onPress={() => transition(target)} style={{ backgroundColor: target === 'CANCELLED' ? colors.danger : presentation.accent }} />)}</View>
      </> : <Empty copy="Only the owner or an accepted organizer can manage this competition." /> : null}
    </View>

    <Modal visible={entryOpen} transparent animationType="fade" onRequestClose={() => setEntryOpen(false)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title={competition.kind === 'LEAGUE' ? 'Register player' : 'Register team'} close={() => setEntryOpen(false)} /><Text variant="overline" tone="dim">DIVISION</Text><DivisionChoices divisions={detail.divisions} selected={divisionKey} onSelect={setDivisionKey} accent={presentation.accent} />{competition.kind === 'LEAGUE' ? <><TextInput value={query} onChangeText={setQuery} placeholder="Search SportStage players" placeholderTextColor={colors.textDim} style={styles.input} />{players.map((player) => <Pressable key={player.sportProfileId} onPress={() => registerPlayer(player)} style={styles.card}><Text variant="bodyStrong" style={styles.flex}>{player.displayName}</Text><Text variant="overline" style={{ color: presentation.accent }}>REGISTER</Text></Pressable>)}</> : teams.map((team) => <Pressable key={team.id} onPress={() => registerTeam(team)} style={styles.card}><Text variant="bodyStrong" style={styles.flex}>{team.name}</Text><Text variant="overline" style={{ color: presentation.accent }}>REGISTER</Text></Pressable>)}</View></View></Modal>

    <Modal visible={scheduleOpen} transparent animationType="fade" onRequestClose={() => { setScheduleOpen(false); setEditingFixture(undefined); }}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title={editingFixture ? 'Reschedule fixture' : competition.kind === 'TOURNAMENT' ? 'Draft team tie' : 'Schedule fixture'} close={() => { setScheduleOpen(false); setEditingFixture(undefined); }} /><Text variant="caption" tone="muted">{editingFixture ? `Update venue, court, or time in ${competition.timezone}.` : `Select two approved entrants. Times use ${competition.timezone}; SportStage will not generate a draw.`}</Text>{!editingFixture ? <><Text variant="overline" tone="dim">DIVISION</Text><DivisionChoices divisions={detail.divisions} selected={divisionKey} onSelect={(value) => { setDivisionKey(value); setSideAId(undefined); setSideBId(undefined); }} accent={presentation.accent} /><Text variant="overline" tone="dim">SIDE A</Text><ChoiceList entries={approvedEntries.filter((entry) => entry.divisionKey === divisionKey)} selected={sideAId} onSelect={setSideAId} accent={presentation.accent} /><Text variant="overline" tone="dim">SIDE B</Text><ChoiceList entries={approvedEntries.filter((entry) => entry.divisionKey === divisionKey && entry.id !== sideAId)} selected={sideBId} onSelect={setSideBId} accent={presentation.accent} />{competition.kind === 'TOURNAMENT' ? <TieMatchEditor matches={newTieMatches} onChange={setNewTieMatches} accent={presentation.accent} /> : null}</> : null}<SelectResources stages={detail.stages} venues={detail.venues} stageId={stageId} venueId={venueId} onStage={setStageId} onVenue={setVenueId} accent={presentation.accent} /><TextInput value={scheduledAt} onChangeText={setScheduledAt} placeholder={`2026-08-20 18:30 ${competition.timezone} (optional)`} placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={court} onChangeText={setCourt} placeholder="Court (optional)" placeholderTextColor={colors.textDim} style={styles.input} /><Button title={editingFixture ? 'Save schedule change' : competition.kind === 'TOURNAMENT' ? 'Create team tie' : 'Schedule fixture'} disabled={!sideAId || !sideBId || (competition.kind === 'TOURNAMENT' && !newTieMatches.length)} loading={saving} onPress={schedule} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>
    <Modal visible={Boolean(draftingTie)} transparent animationType="fade" onRequestClose={() => setDraftingTie(undefined)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title="Team-tie match draft" close={() => setDraftingTie(undefined)} /><Text variant="caption" tone="muted">Choose any ordered combination of singles and doubles matches. Lineups will be submitted separately.</Text><TieMatchEditor matches={tieMatches} onChange={setTieMatches} accent={presentation.accent} /><Button title="Save match draft" disabled={!tieMatches.length} loading={saving} onPress={saveTieDraft} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>

    <Modal visible={Boolean(resourceOpen)} transparent animationType="fade" onRequestClose={() => setResourceOpen(undefined)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title={`Add ${resourceOpen?.toLowerCase() ?? 'resource'}`} close={() => setResourceOpen(undefined)} /><TextInput value={resourceName} onChangeText={setResourceName} placeholder="Name" placeholderTextColor={colors.textDim} style={styles.input} />{resourceOpen === 'DIVISION' ? <TextInput value={resourceCapacity} onChangeText={setResourceCapacity} keyboardType="number-pad" placeholder="Registration capacity (optional)" placeholderTextColor={colors.textDim} style={styles.input} /> : null}<Button title="Add" disabled={!resourceName.trim()} loading={saving} onPress={addResource} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>
    <Modal visible={Boolean(editingResource)} transparent animationType="fade" onRequestClose={() => setEditingResource(undefined)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title={`Edit ${editingResource?.type.toLowerCase() ?? 'resource'}`} close={() => setEditingResource(undefined)} /><TextInput value={editingResource?.name ?? ''} onChangeText={(name) => setEditingResource((current) => current ? { ...current, name } : current)} placeholder="Name" placeholderTextColor={colors.textDim} style={styles.input} />{editingResource?.type === 'VENUE' ? <TextInput value={editingResource.address ?? ''} onChangeText={(address) => setEditingResource((current) => current ? { ...current, address } : current)} placeholder="Address (optional)" placeholderTextColor={colors.textDim} style={styles.input} /> : null}{editingResource?.type === 'DIVISION' ? <TextInput value={editingResource.capacity === undefined ? '' : String(editingResource.capacity)} onChangeText={(value) => setEditingResource((current) => current ? { ...current, capacity: value.trim() ? Number(value) : undefined } : current)} keyboardType="number-pad" placeholder="Registration capacity (optional)" placeholderTextColor={colors.textDim} style={styles.input} /> : null}<Button title="Save" disabled={!editingResource?.name.trim()} loading={saving} onPress={saveResource} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>
    <Modal visible={pointsOpen} transparent animationType="fade" onRequestClose={() => setPointsOpen(false)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title="Points system" close={() => setPointsOpen(false)} />{(['win', 'draw', 'loss', 'walkover'] as const).map((key) => <TextInput key={key} value={pointValues[key]} onChangeText={(value) => setPointValues((current) => ({ ...current, [key]: value }))} keyboardType="number-pad" placeholder={`${key} points`} placeholderTextColor={colors.textDim} style={styles.input} />)}<Button title="Save points rules" loading={saving} onPress={savePoints} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>
    <Modal visible={officialOpen} transparent animationType="fade" onRequestClose={() => setOfficialOpen(false)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title="Assign match official" close={() => setOfficialOpen(false)} /><Text variant="overline" tone="dim">FIXTURE</Text><View style={styles.choices}>{detail.fixtures.map((fixture) => <Pressable key={fixture.id} onPress={() => setOfficialFixtureId(fixture.id)} style={[styles.choice, officialFixtureId === fixture.id && { borderColor: presentation.accent }]}><Text variant="caption">{entryById.get(fixture.entrantAId)?.displayName} vs {entryById.get(fixture.entrantBId)?.displayName}</Text></Pressable>)}</View><View style={styles.choices}>{(['SCOREKEEPER', 'REFEREE'] as const).map((role) => <Pressable key={role} onPress={() => setOfficialRole(role)} style={[styles.choice, officialRole === role && { borderColor: presentation.accent }]}><Text variant="caption">{role}</Text></Pressable>)}</View><TextInput value={officialQuery} onChangeText={setOfficialQuery} placeholder="Search SportStage accounts" placeholderTextColor={colors.textDim} style={styles.input} />{officialResults.map((player) => <Pressable key={player.accountId} onPress={() => assignOfficial(player)} style={styles.card}><Text variant="bodyStrong" style={styles.flex}>{player.displayName}</Text><Text variant="overline" style={{ color: presentation.accent }}>ASSIGN</Text></Pressable>)}</View></View></Modal>
    <Modal visible={organizerOpen} transparent animationType="fade" onRequestClose={() => setOrganizerOpen(false)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title="Invite organizer" close={() => setOrganizerOpen(false)} /><Text variant="caption" tone="muted">Only SportStage accounts active in {config.name} can be invited.</Text><TextInput value={organizerQuery} onChangeText={setOrganizerQuery} placeholder="Search players" placeholderTextColor={colors.textDim} style={styles.input} />{organizerResults.map((player) => <Pressable key={player.accountId} onPress={() => inviteOrganizer(player)} style={styles.card}><Text variant="bodyStrong" style={styles.flex}>{player.displayName}</Text><Text variant="overline" style={{ color: presentation.accent }}>INVITE</Text></Pressable>)}</View></View></Modal>
    <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title="Competition details" close={() => setSettingsOpen(false)} /><TextInput value={editName} onChangeText={setEditName} placeholder="Name" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editDescription} onChangeText={setEditDescription} placeholder="Description (optional)" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editTimezone} onChangeText={setEditTimezone} placeholder="Timezone, e.g. Asia/Kolkata" placeholderTextColor={colors.textDim} style={styles.input} /><View style={styles.choices}>{(['PRIVATE', 'PUBLIC'] as const).map((value) => <Pressable key={value} onPress={() => setEditVisibility(value)} style={[styles.choice, editVisibility === value && { borderColor: presentation.accent }]}><Text variant="caption">{value}</Text></Pressable>)}</View><TextInput value={editStartsAt} onChangeText={setEditStartsAt} placeholder="Starts YYYY-MM-DD HH:mm" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editEndsAt} onChangeText={setEditEndsAt} placeholder="Ends YYYY-MM-DD HH:mm" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editRegistrationOpensAt} onChangeText={setEditRegistrationOpensAt} placeholder="Registration opens (optional)" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editRegistrationClosesAt} onChangeText={setEditRegistrationClosesAt} placeholder="Registration closes (optional)" placeholderTextColor={colors.textDim} style={styles.input} /><Button title="Save details" disabled={!editName.trim() || !editTimezone.trim()} loading={saving} onPress={saveSettings} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>
    <Modal visible={cancellingCompetition || Boolean(cancellingFixture)} transparent animationType="fade" onRequestClose={() => { setCancellingCompetition(false); setCancellingFixture(undefined); }}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title={cancellingFixture ? 'Cancel fixture' : 'Cancel competition'} close={() => { setCancellingCompetition(false); setCancellingFixture(undefined); }} /><Text variant="caption" tone="muted">Give participants a clear reason. This is retained in the schedule and audit history.</Text><TextInput value={cancellationReason} onChangeText={setCancellationReason} placeholder="Cancellation reason" placeholderTextColor={colors.textDim} multiline style={[styles.input, styles.reasonInput]} /><Button title="Confirm cancellation" disabled={!cancellationReason.trim()} loading={saving} onPress={confirmCancellation} fullWidth style={{ backgroundColor: colors.danger }} /></View></View></Modal>
  </Screen>;
}

function Info({ label, value }: { label: string; value: string }) { return <View style={styles.info}><Text variant="overline" tone="dim">{label}</Text><Text variant="bodyStrong">{value}</Text></View>; }
function Empty({ copy }: { copy: string }) { return <View style={styles.empty}><Text variant="caption" tone="muted">{copy}</Text></View>; }
function SmallAction({ label, onPress, accent }: { label: string; onPress: () => void; accent: string }) { return <Pressable onPress={onPress} style={[styles.smallAction, { borderColor: accent }]}><MaterialCommunityIcons name="plus" size={16} color={accent} /><Text variant="overline" style={{ color: accent }}>{label}</Text></Pressable>; }
function ResourceRow({ name, detail, onMoveUp, onMoveDown, onEdit, onDelete }: { name: string; detail: string; onMoveUp?: () => void; onMoveDown?: () => void; onEdit: () => void; onDelete: () => void }) { return <View style={styles.card}><View style={styles.flex}><Text variant="bodyStrong">{name}</Text><Text variant="caption" tone="muted">{detail}</Text></View>{onMoveUp ? <Pressable onPress={onMoveUp}><MaterialCommunityIcons name="arrow-up" size={18} color={colors.textMuted} /></Pressable> : null}{onMoveDown ? <Pressable onPress={onMoveDown}><MaterialCommunityIcons name="arrow-down" size={18} color={colors.textMuted} /></Pressable> : null}<Pressable onPress={onEdit}><Text variant="overline">EDIT</Text></Pressable><Pressable onPress={onDelete}><Text variant="overline" tone="danger">DELETE</Text></Pressable></View>; }
function ModalTitle({ title, close }: { title: string; close: () => void }) { return <View style={styles.heading}><Text variant="h2">{title}</Text><Pressable onPress={close}><MaterialCommunityIcons name="close" size={24} color={colors.textMuted} /></Pressable></View>; }
function ChoiceList({ entries, selected, onSelect, accent }: { entries: CloudCompetitionDetail['entries']; selected?: string; onSelect: (id: string) => void; accent: string }) { return <View style={styles.choices}>{entries.map((entry) => <Pressable key={entry.id} onPress={() => onSelect(entry.id)} style={[styles.choice, selected === entry.id && { borderColor: accent }]}><Text variant="caption" style={selected === entry.id ? { color: accent } : undefined}>{entry.displayName}</Text></Pressable>)}</View>; }
function DivisionChoices({ divisions, selected, onSelect, accent }: { divisions: CloudCompetitionDetail['divisions']; selected: string; onSelect: (key: string) => void; accent: string }) { return <View style={styles.choices}>{divisions.map((division) => <Pressable key={division.id} onPress={() => onSelect(division.divisionKey)} style={[styles.choice, selected === division.divisionKey && { borderColor: accent }]}><Text variant="caption" style={selected === division.divisionKey ? { color: accent } : undefined}>{division.name}</Text></Pressable>)}</View>; }
function SelectResources({ stages, venues, stageId, venueId, onStage, onVenue, accent }: { stages: CloudCompetitionStage[]; venues: CloudCompetitionVenue[]; stageId?: string; venueId?: string; onStage: (id: string) => void; onVenue: (id: string) => void; accent: string }) { return <><Text variant="overline" tone="dim">STAGE</Text><View style={styles.choices}>{stages.map((item) => <Pressable key={item.id} onPress={() => onStage(item.id)} style={[styles.choice, stageId === item.id && { borderColor: accent }]}><Text variant="caption">{item.name}</Text></Pressable>)}</View><Text variant="overline" tone="dim">VENUE</Text><View style={styles.choices}>{venues.map((item) => <Pressable key={item.id} onPress={() => onVenue(item.id)} style={[styles.choice, venueId === item.id && { borderColor: accent }]}><Text variant="caption">{item.name}</Text></Pressable>)}</View></>; }
function TieMatchEditor({ matches, onChange, accent }: { matches: CloudFixtureMatchDraft[]; onChange: (matches: CloudFixtureMatchDraft[]) => void; accent: string }) {
  const add = (format: CloudFixtureMatchDraft['format']) => onChange([
    ...matches, { format, label: `${format === 'SINGLES' ? 'Singles' : 'Doubles'} ${matches.filter((item) => item.format === format).length + 1}` },
  ]);
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= matches.length) return;
    const next = [...matches];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return <View style={styles.tieDraft}><View style={styles.heading}><Text variant="overline" tone="dim">MATCH DRAFT · {matches.length}</Text><View style={styles.actions}><SmallAction label="SINGLES" onPress={() => add('SINGLES')} accent={accent} /><SmallAction label="DOUBLES" onPress={() => add('DOUBLES')} accent={accent} /></View></View><ScrollView style={styles.tieMatchList} contentContainerStyle={styles.tieMatchListContent} nestedScrollEnabled>{matches.map((match, index) => <View key={`${index}-${match.format}`} style={styles.card}><Text variant="overline" style={{ color: accent }}>{index + 1}</Text><TextInput value={match.label} onChangeText={(label) => onChange(matches.map((item, itemIndex) => itemIndex === index ? { ...item, label } : item))} maxLength={80} placeholder={`Match ${index + 1}`} placeholderTextColor={colors.textDim} style={[styles.input, styles.tieLabel]} /><Pressable onPress={() => onChange(matches.map((item, itemIndex) => itemIndex === index ? { ...item, format: item.format === 'SINGLES' ? 'DOUBLES' : 'SINGLES' } : item))}><Text variant="overline">{match.format}</Text></Pressable>{index ? <Pressable onPress={() => move(index, -1)}><MaterialCommunityIcons name="arrow-up" size={18} color={colors.textMuted} /></Pressable> : null}{index < matches.length - 1 ? <Pressable onPress={() => move(index, 1)}><MaterialCommunityIcons name="arrow-down" size={18} color={colors.textMuted} /></Pressable> : null}<Pressable disabled={matches.length === 1} onPress={() => onChange(matches.filter((_, itemIndex) => itemIndex !== index))}><MaterialCommunityIcons name="delete-outline" size={19} color={matches.length === 1 ? colors.textDim : colors.danger} /></Pressable></View>)}</ScrollView></View>;
}
function FixtureRow({ fixture, sideA, sideB, venue, timeZone, canManage, isTournament, accent, checkIns, controllableEntries, onCheckIn, onMoveUp, onMoveDown, onEditTie, onReschedule, onCancel }: { fixture: CloudFixture; sideA?: string; sideB?: string; venue?: CloudCompetitionVenue; timeZone: string; canManage: boolean; isTournament: boolean; accent: string; checkIns: Map<string, 'CHECKED_IN' | 'LATE' | 'NO_SHOW'>; controllableEntries: Set<string>; onCheckIn: (entryId: string, status?: 'CHECKED_IN' | 'LATE' | 'NO_SHOW') => void; onMoveUp?: () => void; onMoveDown?: () => void; onEditTie: () => void; onReschedule: () => void; onCancel: () => void }) { const now = Date.now(); const checkInOpen = canManage || Boolean(fixture.checkInOpensAt && fixture.checkInClosesAt && now >= Date.parse(fixture.checkInOpensAt) && now <= Date.parse(fixture.checkInClosesAt)); const entrants = [fixture.entrantAId, fixture.entrantBId]; const checkable = checkInOpen ? entrants.filter((entryId) => controllableEntries.has(entryId) && !checkIns.has(entryId)) : []; return <View style={styles.card}><View style={styles.flex}><Text variant="bodyStrong">{sideA ?? 'Entrant'} vs {sideB ?? 'Entrant'}</Text><Text variant="caption" tone="muted">{fixture.status} · {formatZonedDateTimeLabel(fixture.scheduledAt, timeZone)}{venue ? ` · ${venue.name}` : ''}{fixture.court ? ` · ${fixture.court}` : ''}</Text>{isTournament ? <Text variant="caption" style={{ color: accent }}>{fixture.matches.map((match) => `${match.label}: ${match.format}`).join(' · ')}</Text> : null}{fixture.checkInOpensAt && fixture.checkInClosesAt ? <Text variant="caption" tone="dim">Check-in {formatZonedDateTime(fixture.checkInOpensAt, timeZone)}–{formatZonedDateTime(fixture.checkInClosesAt, timeZone)}</Text> : null}{checkIns.size ? <Text variant="caption" style={{ color: accent }}>{entrants.map((entryId) => checkIns.get(entryId) ?? 'PENDING').join(' · ')}</Text> : null}</View><View style={styles.actions}>{checkable.map((entryId) => <Pressable key={entryId} onPress={() => onCheckIn(entryId)}><Text variant="overline" style={{ color: accent }}>CHECK IN</Text></Pressable>)}{canManage ? entrants.map((entryId, index) => <View key={entryId} style={styles.checkInControls}><Text variant="caption" tone="dim">{index ? 'B' : 'A'}</Text><Pressable onPress={() => onCheckIn(entryId, 'LATE')}><Text variant="overline">LATE</Text></Pressable><Pressable onPress={() => onCheckIn(entryId, 'NO_SHOW')}><Text variant="overline" tone="danger">NO SHOW</Text></Pressable></View>) : null}{canManage && onMoveUp ? <Pressable onPress={onMoveUp}><MaterialCommunityIcons name="arrow-up" size={18} color={accent} /></Pressable> : null}{canManage && onMoveDown ? <Pressable onPress={onMoveDown}><MaterialCommunityIcons name="arrow-down" size={18} color={accent} /></Pressable> : null}{canManage && fixture.status === 'SCHEDULED' ? <>{isTournament ? <Pressable onPress={onEditTie}><Text variant="overline" style={{ color: accent }}>MATCHES</Text></Pressable> : null}<Pressable onPress={onReschedule}><Text variant="overline" style={{ color: accent }}>EDIT</Text></Pressable><Pressable onPress={onCancel}><Text variant="overline" tone="danger">CANCEL</Text></Pressable></> : <Text variant="overline" style={{ color: accent }}>{fixture.status}</Text>}</View></View>; }
function message(cause: unknown): string { return normalizeCompetitionRpcMessage(cause); }

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, flex: { flex: 1, minWidth: 0 },
  hero: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, tab: { width: '32%', minHeight: 42, borderBottomWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, info: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, gap: 4 },
  card: { minHeight: 64, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, checkInControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  smallAction: { minHeight: 34, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 }, lifecycle: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tieDraft: { gap: spacing.sm }, tieMatchList: { maxHeight: 300 }, tieMatchListContent: { gap: spacing.sm }, tieLabel: { flex: 1, minHeight: 42 },
  empty: { padding: spacing.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, alignItems: 'center' },
  overlay: { flex: 1, padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center' }, modal: { width: '100%', maxWidth: 560, maxHeight: '88%', padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.surface, gap: spacing.sm },
  input: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontFamily: 'Inter_500Medium' }, reasonInput: { minHeight: 96, paddingVertical: spacing.sm, textAlignVertical: 'top' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, choice: { minHeight: 38, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, justifyContent: 'center' },
});
