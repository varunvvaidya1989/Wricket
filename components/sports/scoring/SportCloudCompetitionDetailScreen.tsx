import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import type { Href } from 'expo-router';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import { useSportFeatureFlag } from '@/hooks/useSportFeatureFlag';
import { getNextCompetitionLifecycleActions } from '@/lib/sports/platform/competitionLifecycle';
import { getGooglePlace, searchGooglePlaces, type GooglePlaceDetails, type GooglePlaceSuggestion } from '@/lib/maps/googlePlaces';
import {
  formatZonedDateTime,
  formatZonedDateTimeLabel,
  parseZonedDateTime,
} from '@/lib/sports/platform/zonedDateTime';
import { SPORT_CONFIGS, SPORT_PRESENTATION, normalizeSportRules, type MatchOptions, type ScoringSportId } from '@/lib/sports/scoring';
import { normalizeCompetitionRpcMessage } from '@/lib/supabase/competitionRpcMessages';
import {
  sportCompetitionApi,
  type CloudCompetitionDetail,
  type CloudCompetitionLifecycle,
  type CloudCompetitionOrganizer,
  type CloudCompetitionStage,
  type CloudCompetitionVenue,
  type CloudFixture,
  type CloudFixtureMatch,
  type CloudFixtureMatchDraft,
  type CloudFixtureOfficial,
} from '@/lib/supabase/sportCompetitionApi';
import { sportRosterApi, type SportPlayerSearchResult, type SportTeamSummary } from '@/lib/supabase/sportRosterApi';
import { sportOperationsApi } from '@/lib/supabase/sportOperationsApi';
import { sportResultsApi, type CompetitionPlayerStatistic, type SportStanding } from '@/lib/supabase/sportResultsApi';
import { sportScoringApi } from '@/lib/supabase/sportScoringApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportCloudCompetitionUnavailable } from './SportCloudCompetitionUnavailable';
import { SportCompetitionOverview } from './SportCompetitionOverview';
import { SportMatchRulesEditor } from './SportMatchRulesEditor';

type Tab = 'overview' | 'entrants' | 'schedule' | 'standings' | 'points' | 'officials' | 'manage';
type ManagedResource = { type: 'STAGE' | 'VENUE' | 'DIVISION'; id: string; name: string; address?: string; capacity?: number };

export function SportCloudCompetitionDetailScreen({ sportId }: { sportId: ScoringSportId }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
  const [rulesOpen, setRulesOpen] = useState(false);
  const [editRules, setEditRules] = useState<MatchOptions>(() => normalizeSportRules(sportId, {}));
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<SportPlayerSearchResult[]>([]);
  const [organizerResults, setOrganizerResults] = useState<SportPlayerSearchResult[]>([]);
  const [organizers, setOrganizers] = useState<CloudCompetitionOrganizer[]>([]);
  const [standings, setStandings] = useState<SportStanding[]>([]);
  const [playerStats, setPlayerStats] = useState<CompetitionPlayerStatistic[]>([]);
  const [organizerQuery, setOrganizerQuery] = useState('');
  const [teams, setTeams] = useState<SportTeamSummary[]>([]);
  const [ownSportProfileId, setOwnSportProfileId] = useState<string>();
  const [resourceName, setResourceName] = useState('');
  const [resourceCapacity, setResourceCapacity] = useState('');
  const [venueSuggestions, setVenueSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const [venuePlace, setVenuePlace] = useState<GooglePlaceDetails>();
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
  const [lineupTarget, setLineupTarget] = useState<{ fixture: CloudFixture; match: CloudFixtureMatch; entryId: string }>();
  const [lineupSelection, setLineupSelection] = useState<string[]>([]);
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
  const [editOrganizerPhone, setEditOrganizerPhone] = useState('');
  const [editSocialMediaUrl, setEditSocialMediaUrl] = useState('');
  const [editPlannedEntryCount, setEditPlannedEntryCount] = useState('');

  const reload = useCallback(() => {
    if (!id || !cloudCompetitions.enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const accountId = auth.session?.user.id;
    void sportCompetitionApi.get(id).then(async (nextDetail) => {
      const [profileResult, teamsResult, standingsResult, playerStatsResult] = await Promise.allSettled([
        accountId ? sportRosterApi.getMySportProfile(accountId, presentation.catalogCode) : Promise.resolve(undefined),
        accountId ? sportRosterApi.listManageableTeams(presentation.catalogCode) : Promise.resolve([]),
        sportResultsApi.listStandings(id),
        sportResultsApi.listCompetitionPlayerStatistics(id),
      ]);
      const profile = profileResult.status === 'fulfilled' ? profileResult.value : undefined;
      const manageableTeams = teamsResult.status === 'fulfilled' ? teamsResult.value : [];
      const nextStandings = standingsResult.status === 'fulfilled' ? standingsResult.value : [];
      const nextPlayerStats = playerStatsResult.status === 'fulfilled' ? playerStatsResult.value : [];
      setDetail(nextDetail);
      setStandings(nextStandings);
      setPlayerStats(nextPlayerStats);
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
      setEditOrganizerPhone(nextDetail.competition.organizerPhone ?? '');
      setEditSocialMediaUrl(nextDetail.competition.socialMediaUrl ?? '');
      setEditPlannedEntryCount(nextDetail.competition.plannedEntryCount ? String(nextDetail.competition.plannedEntryCount) : '');
      setEditRules(normalizeSportRules(sportId, nextDetail.competition.rules));
      if (nextDetail.canManage) {
        const organizerResult = await Promise.allSettled([
          sportCompetitionApi.listOrganizers(nextDetail.competition.id),
        ]);
        setOrganizers(organizerResult[0]?.status === 'fulfilled' ? organizerResult[0].value : []);
      } else {
        setOrganizers([]);
      }
    })
      .catch((cause) => Alert.alert('Could not load competition', message(cause)))
      .finally(() => setLoading(false));
  }, [auth.session?.user.id, cloudCompetitions.enabled, id, presentation.catalogCode, sportId]);
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

  useEffect(() => {
    if (resourceOpen !== 'VENUE' || venuePlace || resourceName.trim().length < 3) { setVenueSuggestions([]); return; }
    const timer = setTimeout(() => void searchGooglePlaces(resourceName).then(setVenueSuggestions).catch(() => setVenueSuggestions([])), 350);
    return () => clearTimeout(timer);
  }, [resourceName, resourceOpen, venuePlace]);

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
        const venueId = await sportCompetitionApi.addVenue(detail.competition.id, venuePlace?.name ?? resourceName, venuePlace?.address);
        if (venuePlace) await sportCompetitionApi.setVenuePlace(venueId, venuePlace);
      } else {
        const key = resourceName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
        const capacity = resourceCapacity.trim() ? Number(resourceCapacity) : undefined;
        if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 2)) throw new Error('Capacity must be at least 2.');
        await sportCompetitionApi.addDivision(detail.competition.id, key, resourceName, detail.divisions.length, capacity);
      }
      setResourceName(''); setResourceCapacity(''); setVenuePlace(undefined); setVenueSuggestions([]); setResourceOpen(undefined);
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
        const plannedEntryCount = editPlannedEntryCount.trim() ? Number(editPlannedEntryCount) : undefined;
        if (plannedEntryCount !== undefined && (!Number.isInteger(plannedEntryCount) || plannedEntryCount < 2 || plannedEntryCount > 256)) throw new Error('Planned participant count must be between 2 and 256.');
        await sportCompetitionApi.update(detail.competition, {
          name: editName, description: editDescription, visibility: editVisibility,
          timezone: editTimezone, startsAt, endsAt, registrationOpensAt, registrationClosesAt,
        });
        await sportCompetitionApi.updateProfile(detail.competition.id, {
          organizerPhone: editOrganizerPhone, socialMediaUrl: editSocialMediaUrl, plannedEntryCount,
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

  const selectVenue = async (suggestion: GooglePlaceSuggestion) => {
    try {
      const place = await getGooglePlace(suggestion.placeId);
      setVenuePlace(place); setResourceName(place.address); setVenueSuggestions([]);
    } catch (cause) { Alert.alert('Could not select venue', message(cause)); }
  };

  const pickCompetitionMedia = async (kind: 'logo' | 'banner') => {
    const ownerId = auth.session?.user.id;
    if (!detail || !ownerId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Photos permission needed', 'Allow photo access to select competition media.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: kind === 'banner' ? [16, 9] : [1, 1], quality: 0.8 });
    const localUri = result.canceled ? undefined : result.assets[0]?.uri;
    if (!localUri) return;
    await run(() => sportCompetitionApi.uploadMedia({ competitionId: detail.competition.id, ownerId, localUri, kind }), `Could not update ${kind}`);
  };

  const saveRules = () => {
    if (!detail) return;
    void run(async () => {
      await sportCompetitionApi.updateMatchRules(detail.competition.id, editRules);
      setRulesOpen(false);
    }, 'Could not update match rules');
  };

  const openScoring = (fixture: CloudFixture, fixtureMatch?: CloudFixtureMatch) => {
    const existingId = fixtureMatch?.scoringMatchId ?? fixture.scoringMatchId;
    const canScore = Boolean(detail?.canManage || detail?.officials.some((official) => (
      official.fixtureId === fixture.id && official.accountId === auth.session?.user.id
    )));
    if (existingId) {
      router.push(`/${presentation.routeSegment}/match/${existingId}/${canScore ? 'score' : 'feed'}` as Href);
      return;
    }
    if (!canScore) return;
    void run(async () => {
      const scoringMatchId = await sportScoringApi.prepareFixture({
        fixtureId: fixture.id,
        fixtureMatchId: fixtureMatch?.id,
        rulesSnapshot: { initial_server: 0, options: normalizeSportRules(sportId, detail?.competition.rules) },
      });
      router.push(`/${presentation.routeSegment}/match/${scoringMatchId}/score` as Href);
    }, 'Could not prepare live scoring');
  };

  const openLineup = (fixture: CloudFixture, match: CloudFixtureMatch, entryId: string) => {
    const existing = detail?.lineups.find((lineup) => lineup.fixtureMatchId === match.id && lineup.entryId === entryId);
    setLineupSelection(existing?.playerProfileIds ?? []);
    setLineupTarget({ fixture, match, entryId });
  };

  const toggleLineupPlayer = (profileId: string) => {
    if (!lineupTarget) return;
    const required = lineupTarget.match.format === 'SINGLES' ? 1 : 2;
    setLineupSelection((current) => current.includes(profileId)
      ? current.filter((id) => id !== profileId)
      : current.length < required ? [...current, profileId] : [...current.slice(1), profileId]);
  };

  const saveLineup = () => {
    if (!detail || !lineupTarget) return;
    const required = lineupTarget.match.format === 'SINGLES' ? 1 : 2;
    if (lineupSelection.length !== required) return;
    const existing = detail.lineups.find((lineup) => (
      lineup.fixtureMatchId === lineupTarget.match.id && lineup.entryId === lineupTarget.entryId
    ));
    void run(async () => {
      await sportCompetitionApi.overrideTeamTieLineup({
        fixtureMatchId: lineupTarget.match.id,
        entryId: lineupTarget.entryId,
        playerProfileIds: lineupSelection,
        expectedVersion: existing?.version ?? 0,
        reason: 'Competition manager prepared the account-backed scoring lineup.',
      });
      setLineupTarget(undefined);
      setLineupSelection([]);
    }, 'Could not save lineup');
  };

  const lockTeamTie = (fixture: CloudFixture) => {
    void run(() => sportCompetitionApi.startTeamTie(fixture.id), 'Could not lock team-tie lineups');
  };

  if (cloudCompetitions.loading || !cloudCompetitions.enabled) return <SportCloudCompetitionUnavailable loading={cloudCompetitions.loading} sportId={sportId} />;
  if (loading) return <Screen padded={false}><SportStageLoader message={`Opening ${config.name} competition`} detail="Syncing entrants, fixtures, and standings" accent={presentation.accent} /></Screen>;
  if (!detail) return <Screen padded={false}><AppHeader title="Competition" back /><View style={styles.center}><Text variant="h3">Competition unavailable</Text></View></Screen>;
  const { competition } = detail;
  const approvedEntries = detail.entries.filter((entry) => entry.status === 'APPROVED');

  return <Screen scroll padded={false}>
    <AppHeader title={competition.name} eyebrow={`${config.name.toUpperCase()} · ${competition.lifecycle.replaceAll('_', ' ')}`} back />
    <View style={styles.content}>
      <View style={[styles.hero, { borderColor: presentation.accent }]}><MaterialCommunityIcons name={competition.kind === 'TOURNAMENT' ? 'trophy-outline' : 'table-large'} size={30} color={presentation.accent} /><View style={styles.flex}><Text variant="h1">{competition.name}</Text><Text variant="caption" tone="muted">{competition.kind} · {competition.visibility}</Text></View></View>
      <View style={styles.tabs}>{(['overview', 'entrants', 'schedule', 'standings', 'points', 'officials', 'manage'] as const).map((value) => <Pressable key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && { borderColor: presentation.accent }]}><Text variant="overline" style={tab === value ? { color: presentation.accent } : undefined}>{value}</Text></Pressable>)}</View>

      {tab === 'overview' ? <>
        <SportCompetitionOverview detail={detail} sportId={sportId} catalogCode={presentation.catalogCode} accent={presentation.accent} playerStats={playerStats} onEdit={detail.canManage ? () => setSettingsOpen(true) : undefined} onRules={detail.canManage ? () => { setEditRules(normalizeSportRules(sportId, competition.rules)); setRulesOpen(true); } : undefined} />
        {competition.lifecycle === 'REGISTRATION_OPEN' && competition.kind === 'LEAGUE' ? <Button title="Register myself" onPress={registerSelf} fullWidth style={{ backgroundColor: presentation.accent }} /> : null}
        {!detail.canManage && competition.lifecycle === 'REGISTRATION_OPEN' && competition.kind === 'TOURNAMENT' ? <Button title="Register one of my teams" onPress={() => setEntryOpen(true)} fullWidth style={{ backgroundColor: presentation.accent }} /> : null}
      </> : null}

      {tab === 'entrants' ? <>
        <View style={styles.heading}><Text variant="overline" tone="dim">ENTRANTS · {detail.entries.length}</Text>{detail.canManage ? <SmallAction label="ADD" onPress={() => setEntryOpen(true)} accent={presentation.accent} /> : null}</View>
        {detail.entries.map((entry) => <View key={entry.id} style={styles.card}><View style={styles.flex}><Text variant="bodyStrong">{entry.displayName}</Text><Text variant="caption" tone="muted">{entry.divisionKey} · {entry.status}</Text></View><View style={styles.actions}>{detail.canManage && entry.status === 'PENDING' ? <><Pressable onPress={() => void run(() => sportCompetitionApi.setEntryStatus(entry.id, 'REJECTED'), 'Could not reject entry')}><Text variant="overline" tone="danger">REJECT</Text></Pressable><Pressable onPress={() => void run(() => sportCompetitionApi.setEntryStatus(entry.id, 'APPROVED'), 'Could not approve entry')}><Text variant="overline" style={{ color: presentation.accent }}>APPROVE</Text></Pressable></> : null}{detail.canManage && entry.status === 'APPROVED' ? <Pressable onPress={() => void run(() => sportCompetitionApi.setEntryStatus(entry.id, 'DISQUALIFIED'), 'Could not disqualify entry')}><Text variant="overline" tone="danger">DISQUALIFY</Text></Pressable> : null}{controllableEntries.has(entry.id) && ['PENDING', 'APPROVED'].includes(entry.status) ? <Pressable onPress={() => void run(() => sportCompetitionApi.withdrawEntry(entry.id), 'Could not withdraw entry')}><Text variant="overline" tone="danger">WITHDRAW</Text></Pressable> : null}</View></View>)}
        {!detail.entries.length ? <Empty copy="No registrations yet." /> : null}
      </> : null}

      {tab === 'schedule' ? <>
        <View style={styles.scheduleHeading}>
          <View style={styles.flex}><Text variant="h3">Match schedule</Text><Text variant="caption" tone="muted">{detail.fixtures.length} fixture{detail.fixtures.length === 1 ? '' : 's'} · Open a match to score it, or manage attendance and lineups from its card.</Text></View>
          <View style={styles.actions}>
            <SmallAction label="GUIDE" onPress={() => router.push('/manual')} accent={presentation.accent} />
            {detail.canManage ? <SmallAction label="ADD FIXTURE" onPress={() => setScheduleOpen(true)} accent={presentation.accent} /> : null}
          </View>
        </View>
        {detail.fixtures.map((fixture, index) => <FixtureRow key={fixture.id} fixture={fixture} sideA={entryById.get(fixture.entrantAId)?.displayName} sideB={entryById.get(fixture.entrantBId)?.displayName} venue={fixture.venueId ? venueById.get(fixture.venueId) : undefined} timeZone={competition.timezone} canManage={detail.canManage} canScore={detail.canManage || detail.officials.some((official) => official.fixtureId === fixture.id && official.accountId === auth.session?.user.id)} isTournament={competition.kind === 'TOURNAMENT'} accent={presentation.accent} checkIns={new Map(detail.checkIns.filter((item) => item.fixtureId === fixture.id).map((item) => [item.entryId, item.status]))} controllableEntries={controllableEntries} onScoring={(fixtureMatch) => openScoring(fixture, fixtureMatch)} onLineup={(fixtureMatch, entryId) => openLineup(fixture, fixtureMatch, entryId)} onStartTie={() => lockTeamTie(fixture)} onCheckIn={(entryId, status = 'CHECKED_IN') => void run(() => sportCompetitionApi.checkIn(fixture.id, entryId, status), 'Could not update check-in')} onMoveUp={index ? () => moveFixture(index, -1) : undefined} onMoveDown={index < detail.fixtures.length - 1 ? () => moveFixture(index, 1) : undefined} onEditTie={() => openTieDraft(fixture)} onReschedule={() => openReschedule(fixture)} onCancel={() => { setCancellationReason(''); setCancellingFixture(fixture); }} />)}
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

      {tab === 'standings' ? <>
        <View style={styles.heading}><Text variant="overline" tone="dim">LIVE TABLE · RULE VERSION {detail.pointsRule.version}</Text>{detail.canManage ? <Pressable onPress={() => void run(() => sportResultsApi.rebuild(competition.id), 'Could not rebuild standings')}><Text variant="overline" style={{ color: presentation.accent }}>REBUILD</Text></Pressable> : null}</View>
        <View style={styles.standingsHeader}><Text variant="overline" tone="dim" style={styles.rankCell}>#</Text><Text variant="overline" tone="dim" style={styles.flex}>ENTRANT</Text><Text variant="overline" tone="dim" style={styles.statCell}>P</Text><Text variant="overline" tone="dim" style={styles.statCell}>W</Text><Text variant="overline" tone="dim" style={styles.statCell}>PTS</Text></View>
        {standings.map((standing) => <View key={standing.entryId} style={styles.standingRow}><Text variant="mono" style={styles.rankCell}>{standing.rank}</Text><View style={styles.flex}><Text variant="bodyStrong" numberOfLines={1}>{entryById.get(standing.entryId)?.displayName ?? 'Entrant'}</Text><Text variant="caption" tone="dim">Rubbers {standing.rubbersWon}-{standing.rubbersLost}</Text></View><Text variant="mono" style={styles.statCell}>{standing.played}</Text><Text variant="mono" style={styles.statCell}>{standing.won}</Text><Text variant="scoreMd" style={[styles.statCell, { color: presentation.accent }]}>{standing.points}</Text></View>)}
        {!standings.length ? <Empty copy="Standings appear after the first completed result." /> : null}
      </> : null}

      {tab === 'officials' ? <>
        <View style={styles.heading}><Text variant="overline" tone="dim">MATCH OFFICIALS · {detail.officials.length}</Text>{detail.canManage && detail.fixtures.length ? <SmallAction label="ASSIGN" onPress={() => { setOfficialFixtureId(detail.fixtures[0]?.id); setOfficialOpen(true); }} accent={presentation.accent} /> : null}</View>
        {detail.officials.map((official) => <View key={official.id} style={styles.card}><View style={styles.flex}><Text variant="bodyStrong">{official.displayName}</Text><Text variant="caption" tone="muted">{official.role} · {entryById.get(detail.fixtures.find((fixture) => fixture.id === official.fixtureId)?.entrantAId ?? '')?.displayName ?? 'Fixture'} assignment</Text></View>{detail.canManage ? <Pressable onPress={() => void run(() => sportCompetitionApi.revokeOfficial(official.id), 'Could not revoke official')}><Text variant="overline" tone="danger">REVOKE</Text></Pressable> : null}</View>)}
        {!detail.officials.length ? <Empty copy="No scorers or referees assigned yet." /> : null}
      </> : null}

      {tab === 'manage' ? detail.canManage ? <>
        <Text variant="overline" tone="dim">SCOPED SUPPORT OPERATIONS</Text>
        <View style={styles.lifecycle}>
          <Button title="Create recovery checkpoint" variant="secondary" onPress={() => void run(() => sportOperationsApi.supportAction(competition.id, 'CREATE_RECOVERY_CHECKPOINT', 'Competition manager created a pre-change recovery checkpoint.'), 'Could not create checkpoint')} />
          <Button title="Refresh public snapshots" variant="secondary" onPress={() => void run(() => sportOperationsApi.supportAction(competition.id, 'REFRESH_PUBLIC_SNAPSHOTS', 'Competition manager refreshed public live projections.'), 'Could not refresh public snapshots')} />
          <Button title="Release expired scoring leases" variant="secondary" onPress={() => void run(() => sportOperationsApi.supportAction(competition.id, 'RELEASE_SCORING_LEASE', 'Competition manager released stale scoring leases during recovery.'), 'Could not release scoring leases')} />
        </View>
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
    <Modal visible={Boolean(lineupTarget)} transparent animationType="fade" onRequestClose={() => setLineupTarget(undefined)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title={`${lineupTarget?.match.label ?? 'Match'} lineup`} close={() => setLineupTarget(undefined)} /><Text variant="caption" tone="muted">Select {lineupTarget?.match.format === 'SINGLES' ? 'one' : 'two'} active SportStage players from this registered squad.</Text>{entryById.get(lineupTarget?.entryId ?? '')?.squadPlayers.filter((player) => player.status === 'APPROVED' && player.eligibility.includes(lineupTarget?.match.format === 'SINGLES' ? 'SINGLES' : 'DOUBLES')).map((player) => <Pressable key={player.sportProfileId} onPress={() => toggleLineupPlayer(player.sportProfileId)} style={[styles.card, lineupSelection.includes(player.sportProfileId) && { borderColor: presentation.accent }]}><View style={styles.flex}><Text variant="bodyStrong">{player.displayName}</Text><Text variant="caption" tone="dim">{player.eligibility.join(' + ')}</Text></View>{lineupSelection.includes(player.sportProfileId) ? <MaterialCommunityIcons name="check-circle" size={20} color={presentation.accent} /> : null}</Pressable>)}<Button title="Save account-backed lineup" disabled={lineupSelection.length !== (lineupTarget?.match.format === 'SINGLES' ? 1 : 2)} loading={saving} onPress={saveLineup} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>

    <Modal visible={Boolean(resourceOpen)} transparent animationType="fade" onRequestClose={() => { setResourceOpen(undefined); setVenuePlace(undefined); setVenueSuggestions([]); }}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title={`Add ${resourceOpen?.toLowerCase() ?? 'resource'}`} close={() => { setResourceOpen(undefined); setVenuePlace(undefined); setVenueSuggestions([]); }} /><TextInput value={resourceName} onChangeText={(value) => { setResourceName(value); if (resourceOpen === 'VENUE') setVenuePlace(undefined); }} placeholder={resourceOpen === 'VENUE' ? 'Search venue on Google Maps' : 'Name'} placeholderTextColor={colors.textDim} style={styles.input} />{resourceOpen === 'VENUE' ? <>{venueSuggestions.map((suggestion) => <Pressable key={suggestion.placeId} onPress={() => void selectVenue(suggestion)} style={styles.placeSuggestion}><Text variant="caption">{suggestion.text}</Text></Pressable>)}{venuePlace ? <Text variant="caption" tone="accent">Google Maps venue selected</Text> : <Text variant="caption" tone="muted">Select a suggestion to add coordinates and a map link.</Text>}</> : null}{resourceOpen === 'DIVISION' ? <TextInput value={resourceCapacity} onChangeText={setResourceCapacity} keyboardType="number-pad" placeholder="Registration capacity (optional)" placeholderTextColor={colors.textDim} style={styles.input} /> : null}<Button title="Add" disabled={!resourceName.trim()} loading={saving} onPress={addResource} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>
    <Modal visible={Boolean(editingResource)} transparent animationType="fade" onRequestClose={() => setEditingResource(undefined)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title={`Edit ${editingResource?.type.toLowerCase() ?? 'resource'}`} close={() => setEditingResource(undefined)} /><TextInput value={editingResource?.name ?? ''} onChangeText={(name) => setEditingResource((current) => current ? { ...current, name } : current)} placeholder="Name" placeholderTextColor={colors.textDim} style={styles.input} />{editingResource?.type === 'VENUE' ? <TextInput value={editingResource.address ?? ''} onChangeText={(address) => setEditingResource((current) => current ? { ...current, address } : current)} placeholder="Address (optional)" placeholderTextColor={colors.textDim} style={styles.input} /> : null}{editingResource?.type === 'DIVISION' ? <TextInput value={editingResource.capacity === undefined ? '' : String(editingResource.capacity)} onChangeText={(value) => setEditingResource((current) => current ? { ...current, capacity: value.trim() ? Number(value) : undefined } : current)} keyboardType="number-pad" placeholder="Registration capacity (optional)" placeholderTextColor={colors.textDim} style={styles.input} /> : null}<Button title="Save" disabled={!editingResource?.name.trim()} loading={saving} onPress={saveResource} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>
    <Modal visible={pointsOpen} transparent animationType="fade" onRequestClose={() => setPointsOpen(false)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title="Points system" close={() => setPointsOpen(false)} />{(['win', 'draw', 'loss', 'walkover'] as const).map((key) => <TextInput key={key} value={pointValues[key]} onChangeText={(value) => setPointValues((current) => ({ ...current, [key]: value }))} keyboardType="number-pad" placeholder={`${key} points`} placeholderTextColor={colors.textDim} style={styles.input} />)}<Button title="Save points rules" loading={saving} onPress={savePoints} fullWidth style={{ backgroundColor: presentation.accent }} /></View></View></Modal>
    <Modal visible={officialOpen} transparent animationType="fade" onRequestClose={() => setOfficialOpen(false)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title="Assign match official" close={() => setOfficialOpen(false)} /><Text variant="overline" tone="dim">FIXTURE</Text><View style={styles.choices}>{detail.fixtures.map((fixture) => <Pressable key={fixture.id} onPress={() => setOfficialFixtureId(fixture.id)} style={[styles.choice, officialFixtureId === fixture.id && { borderColor: presentation.accent }]}><Text variant="caption">{entryById.get(fixture.entrantAId)?.displayName} vs {entryById.get(fixture.entrantBId)?.displayName}</Text></Pressable>)}</View><View style={styles.choices}>{(['SCOREKEEPER', 'REFEREE'] as const).map((role) => <Pressable key={role} onPress={() => setOfficialRole(role)} style={[styles.choice, officialRole === role && { borderColor: presentation.accent }]}><Text variant="caption">{role}</Text></Pressable>)}</View><TextInput value={officialQuery} onChangeText={setOfficialQuery} placeholder="Search SportStage accounts" placeholderTextColor={colors.textDim} style={styles.input} />{officialResults.map((player) => <Pressable key={player.accountId} onPress={() => assignOfficial(player)} style={styles.card}><Text variant="bodyStrong" style={styles.flex}>{player.displayName}</Text><Text variant="overline" style={{ color: presentation.accent }}>ASSIGN</Text></Pressable>)}</View></View></Modal>
    <Modal visible={organizerOpen} transparent animationType="fade" onRequestClose={() => setOrganizerOpen(false)}><View style={styles.overlay}><View style={styles.modal}><ModalTitle title="Invite organizer" close={() => setOrganizerOpen(false)} /><Text variant="caption" tone="muted">Only SportStage accounts active in {config.name} can be invited.</Text><TextInput value={organizerQuery} onChangeText={setOrganizerQuery} placeholder="Search players" placeholderTextColor={colors.textDim} style={styles.input} />{organizerResults.map((player) => <Pressable key={player.accountId} onPress={() => inviteOrganizer(player)} style={styles.card}><Text variant="bodyStrong" style={styles.flex}>{player.displayName}</Text><Text variant="overline" style={{ color: presentation.accent }}>INVITE</Text></Pressable>)}</View></View></Modal>
    <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}><View style={styles.overlay}><View style={styles.settingsModal}><ModalTitle title="Competition details" close={() => setSettingsOpen(false)} /><ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}><View style={styles.mediaActions}><Pressable onPress={() => void pickCompetitionMedia('logo')} style={styles.mediaAction}>{competition.logoUrl ? <Image source={{ uri: competition.logoUrl }} style={styles.mediaPreview} /> : <MaterialCommunityIcons name="image-plus" size={24} color={colors.textDim} />}<Text variant="overline">LOGO</Text></Pressable><Pressable onPress={() => void pickCompetitionMedia('banner')} style={styles.mediaAction}>{competition.bannerUrl ? <Image source={{ uri: competition.bannerUrl }} style={styles.mediaPreview} /> : <MaterialCommunityIcons name="image-plus" size={24} color={colors.textDim} />}<Text variant="overline">BANNER</Text></Pressable></View><TextInput value={editName} onChangeText={setEditName} placeholder="Name" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editDescription} onChangeText={setEditDescription} multiline placeholder="Description (optional)" placeholderTextColor={colors.textDim} style={[styles.input, styles.multiline]} /><TextInput value={editOrganizerPhone} onChangeText={setEditOrganizerPhone} keyboardType="phone-pad" placeholder="Organizer phone / WhatsApp" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editPlannedEntryCount} onChangeText={setEditPlannedEntryCount} keyboardType="number-pad" placeholder="Planned participants" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editSocialMediaUrl} onChangeText={setEditSocialMediaUrl} keyboardType="url" autoCapitalize="none" placeholder="Social media link (optional)" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editTimezone} onChangeText={setEditTimezone} placeholder="Timezone, e.g. Asia/Kolkata" placeholderTextColor={colors.textDim} style={styles.input} /><View style={styles.choices}>{(['PRIVATE', 'PUBLIC'] as const).map((value) => <Pressable key={value} onPress={() => setEditVisibility(value)} style={[styles.choice, editVisibility === value && { borderColor: presentation.accent }]}><Text variant="caption">{value}</Text></Pressable>)}</View><TextInput value={editStartsAt} onChangeText={setEditStartsAt} placeholder="Starts YYYY-MM-DD HH:mm" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editEndsAt} onChangeText={setEditEndsAt} placeholder="Ends YYYY-MM-DD HH:mm" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editRegistrationOpensAt} onChangeText={setEditRegistrationOpensAt} placeholder="Registration opens (optional)" placeholderTextColor={colors.textDim} style={styles.input} /><TextInput value={editRegistrationClosesAt} onChangeText={setEditRegistrationClosesAt} placeholder="Registration closes (optional)" placeholderTextColor={colors.textDim} style={styles.input} /><Button title="Save details" disabled={!editName.trim() || !editTimezone.trim()} loading={saving} onPress={saveSettings} fullWidth style={{ backgroundColor: presentation.accent }} /></ScrollView></View></View></Modal>
    <Modal visible={rulesOpen} transparent animationType="fade" onRequestClose={() => setRulesOpen(false)}><View style={styles.overlay}><View style={styles.rulesModal}><ModalTitle title="Match rules" close={() => setRulesOpen(false)} /><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.rulesModalContent}><Text variant="caption" tone="muted">These rules are inherited by every match created for this competition. They lock after scoring starts.</Text><SportMatchRulesEditor sportId={sportId} value={editRules} onChange={setEditRules} accent={presentation.accent} /><Button title="Save match rules" loading={saving} onPress={saveRules} fullWidth style={{ backgroundColor: presentation.accent }} /></ScrollView></View></View></Modal>
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
    ...matches, { format, label: `${format === 'SINGLES' ? 'Singles' : format === 'MIXED_DOUBLES' ? 'Mixed doubles' : 'Doubles'} ${matches.filter((item) => item.format === format).length + 1}` },
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
function FixtureRow({ fixture, sideA, sideB, venue, timeZone, canManage, canScore, isTournament, accent, checkIns, controllableEntries, onScoring, onLineup, onStartTie, onCheckIn, onMoveUp, onMoveDown, onEditTie, onReschedule, onCancel }: { fixture: CloudFixture; sideA?: string; sideB?: string; venue?: CloudCompetitionVenue; timeZone: string; canManage: boolean; canScore: boolean; isTournament: boolean; accent: string; checkIns: Map<string, 'CHECKED_IN' | 'LATE' | 'NO_SHOW'>; controllableEntries: Set<string>; onScoring: (fixtureMatch?: CloudFixtureMatch) => void; onLineup: (fixtureMatch: CloudFixtureMatch, entryId: string) => void; onStartTie: () => void; onCheckIn: (entryId: string, status?: 'CHECKED_IN' | 'LATE' | 'NO_SHOW') => void; onMoveUp?: () => void; onMoveDown?: () => void; onEditTie: () => void; onReschedule: () => void; onCancel: () => void }) {
  const [manageOpen, setManageOpen] = useState(false);
  const now = Date.now();
  const checkInOpen = canManage || Boolean(fixture.checkInOpensAt && fixture.checkInClosesAt && now >= Date.parse(fixture.checkInOpensAt) && now <= Date.parse(fixture.checkInClosesAt));
  const entrants = [fixture.entrantAId, fixture.entrantBId];
  const entrantNames = [sideA ?? 'Entrant 1', sideB ?? 'Entrant 2'];
  const checkable = checkInOpen ? entrants.filter((entryId) => controllableEntries.has(entryId) && !checkIns.has(entryId)) : [];
  const scoringState = fixture.scoringStatus?.toUpperCase();
  const isLive = scoringState === 'LIVE' || scoringState === 'IN_PROGRESS';
  const statusLabel = fixture.status === 'CANCELLED' ? 'Cancelled' : isLive ? 'Live' : scoringState === 'COMPLETED' ? 'Completed' : 'Upcoming';
  return <View style={styles.fixtureCard}>
    <View style={styles.fixtureTopRow}>
      <View style={[styles.statusPill, isLive && styles.liveStatusPill]}><View style={[styles.statusDot, { backgroundColor: isLive ? colors.live : accent }]} /><Text variant="overline" style={{ color: isLive ? colors.live : colors.textMuted }}>{statusLabel}</Text></View>
      {isTournament ? <Text variant="caption" tone="dim">{fixture.matches.length} match{fixture.matches.length === 1 ? '' : 'es'}</Text> : null}
    </View>
    <View style={styles.matchup}>
      <Text variant="h3">{entrantNames[0]}</Text>
      <View style={styles.versus}><View style={styles.versusLine} /><Text variant="overline" tone="dim">VS</Text><View style={styles.versusLine} /></View>
      <Text variant="h3">{entrantNames[1]}</Text>
    </View>
    <View style={styles.fixtureMeta}>
      <View style={styles.metaRow}><MaterialCommunityIcons name="calendar-clock-outline" size={17} color={colors.textMuted} /><Text variant="caption" tone="muted" style={styles.flex}>{formatZonedDateTimeLabel(fixture.scheduledAt, timeZone)}</Text></View>
      {venue || fixture.court ? <View style={styles.metaRow}><MaterialCommunityIcons name="map-marker-outline" size={17} color={colors.textMuted} /><Text variant="caption" tone="muted" style={styles.flex}>{[venue?.name, fixture.court].filter(Boolean).join(' · ')}</Text></View> : null}
    </View>

    {isTournament ? <View style={styles.rubberList}>{fixture.matches.map((match) => <View key={match.id} style={styles.rubberRow}><View style={styles.flex}><Text variant="bodyStrong">{match.label}</Text><Text variant="caption" tone="dim">{match.format.toLowerCase()} · {(match.scoringStatus ?? 'ready').replaceAll('_', ' ').toLowerCase()}</Text></View>{canScore || match.scoringMatchId ? <Pressable onPress={() => onScoring(match)} style={[styles.primaryAction, { backgroundColor: accent }]}><MaterialCommunityIcons name={match.scoringMatchId ? 'access-point' : 'scoreboard-outline'} size={17} color={colors.accentInk} /><Text variant="overline" style={styles.primaryActionText}>{match.scoringMatchId ? 'VIEW SCORE' : 'START SCORING'}</Text></Pressable> : null}</View>)}</View> : !isTournament && (canScore || fixture.scoringMatchId) ? <Pressable onPress={() => onScoring()} style={[styles.primaryAction, styles.fullAction, { backgroundColor: accent }]}><MaterialCommunityIcons name={fixture.scoringMatchId ? 'access-point' : 'scoreboard-outline'} size={18} color={colors.accentInk} /><Text variant="overline" style={styles.primaryActionText}>{fixture.scoringMatchId ? 'VIEW LIVE SCORE' : 'START SCORING'}</Text></Pressable> : null}

    {(fixture.checkInOpensAt && fixture.checkInClosesAt) || checkIns.size || checkable.length ? <View style={styles.attendanceSummary}>
      <View style={styles.attendanceHeader}><MaterialCommunityIcons name="account-check-outline" size={18} color={accent} /><Text variant="bodyStrong">Player check-in</Text></View>
      {fixture.checkInOpensAt && fixture.checkInClosesAt ? <Text variant="caption" tone="dim">Available {formatZonedDateTime(fixture.checkInOpensAt, timeZone)}–{formatZonedDateTime(fixture.checkInClosesAt, timeZone)}</Text> : null}
      {entrants.map((entryId, index) => <View key={entryId} style={styles.attendanceRow}><Text variant="caption" numberOfLines={1} style={styles.flex}>{entrantNames[index]}</Text><Text variant="overline" style={{ color: checkIns.get(entryId) === 'NO_SHOW' ? colors.danger : checkIns.get(entryId) ? accent : colors.textDim }}>{checkInLabel(checkIns.get(entryId))}</Text>{checkable.includes(entryId) ? <Pressable onPress={() => onCheckIn(entryId)} style={[styles.compactAction, { borderColor: accent }]}><Text variant="overline" style={{ color: accent }}>CHECK IN</Text></Pressable> : null}</View>)}
    </View> : null}

    {canManage ? <>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: manageOpen }} onPress={() => setManageOpen((open) => !open)} style={styles.manageToggle}><MaterialCommunityIcons name="tune-variant" size={18} color={colors.textMuted} /><Text variant="bodyStrong" style={styles.flex}>Manage fixture</Text><MaterialCommunityIcons name={manageOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} /></Pressable>
      {manageOpen ? <View style={styles.managePanel}>
        <Text variant="overline" tone="dim">ATTENDANCE</Text>
        {entrants.map((entryId, index) => <View key={entryId} style={styles.manageRow}><Text variant="caption" numberOfLines={1} style={styles.flex}>{entrantNames[index]}</Text><Pressable onPress={() => onCheckIn(entryId, 'CHECKED_IN')} style={styles.textAction}><Text variant="overline" style={{ color: accent }}>PRESENT</Text></Pressable><Pressable onPress={() => onCheckIn(entryId, 'LATE')} style={styles.textAction}><Text variant="overline">LATE</Text></Pressable><Pressable onPress={() => onCheckIn(entryId, 'NO_SHOW')} style={styles.textAction}><Text variant="overline" tone="danger">NO SHOW</Text></Pressable></View>)}
        {isTournament && fixture.matches.some((match) => !match.scoringMatchId) ? <><Text variant="overline" tone="dim">LINEUPS</Text>{fixture.matches.filter((match) => !match.scoringMatchId).map((match) => <View key={match.id} style={styles.lineupBlock}><Text variant="caption" numberOfLines={1}>{match.label}</Text><View style={styles.actions}><Pressable onPress={() => onLineup(match, fixture.entrantAId)} style={styles.textAction}><Text variant="overline" style={{ color: accent }} numberOfLines={1}>SET {entrantNames[0]} LINEUP</Text></Pressable><Pressable onPress={() => onLineup(match, fixture.entrantBId)} style={styles.textAction}><Text variant="overline" style={{ color: accent }} numberOfLines={1}>SET {entrantNames[1]} LINEUP</Text></Pressable></View></View>)}</> : null}
        <View style={styles.adminActions}>
          {isTournament && !fixture.matches.some((match) => match.scoringMatchId) ? <Pressable onPress={onStartTie} style={[styles.compactAction, { borderColor: accent }]}><Text variant="overline" style={{ color: accent }}>CONFIRM LINEUPS</Text></Pressable> : null}
          {isTournament && fixture.status === 'SCHEDULED' ? <Pressable onPress={onEditTie} style={styles.compactAction}><Text variant="overline">EDIT MATCHES</Text></Pressable> : null}
          {fixture.status === 'SCHEDULED' ? <Pressable onPress={onReschedule} style={styles.compactAction}><Text variant="overline">CHANGE TIME / COURT</Text></Pressable> : null}
          {onMoveUp ? <Pressable accessibilityLabel="Move fixture earlier" onPress={onMoveUp} style={styles.iconAction}><MaterialCommunityIcons name="arrow-up" size={18} color={colors.textMuted} /></Pressable> : null}
          {onMoveDown ? <Pressable accessibilityLabel="Move fixture later" onPress={onMoveDown} style={styles.iconAction}><MaterialCommunityIcons name="arrow-down" size={18} color={colors.textMuted} /></Pressable> : null}
          {fixture.status === 'SCHEDULED' ? <Pressable onPress={onCancel} style={[styles.compactAction, styles.dangerAction]}><Text variant="overline" tone="danger">CANCEL FIXTURE</Text></Pressable> : null}
        </View>
      </View> : null}
    </> : null}
  </View>;
}
function checkInLabel(status?: 'CHECKED_IN' | 'LATE' | 'NO_SHOW'): string {
  if (status === 'CHECKED_IN') return 'PRESENT';
  if (status === 'NO_SHOW') return 'NO SHOW';
  return status ?? 'NOT CHECKED IN';
}
function message(cause: unknown): string { return normalizeCompetitionRpcMessage(cause); }

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, flex: { flex: 1, minWidth: 0 },
  hero: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, tab: { width: '32%', minHeight: 42, borderBottomWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, scheduleHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.xs }, info: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, gap: 4 },
  card: { minHeight: 64, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, checkInControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  fixtureCard: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.md },
  fixtureTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  statusPill: { minHeight: 28, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, liveStatusPill: { borderWidth: 1, borderColor: colors.live }, statusDot: { width: 7, height: 7, borderRadius: 4 },
  matchup: { gap: spacing.xs }, versus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, versusLine: { flex: 1, height: 1, backgroundColor: colors.border },
  fixtureMeta: { gap: spacing.xs }, metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  primaryAction: { minHeight: 38, paddingHorizontal: spacing.md, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs }, fullAction: { alignSelf: 'stretch' }, primaryActionText: { color: colors.accentInk },
  attendanceSummary: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.bg, gap: spacing.xs }, attendanceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, attendanceRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  manageToggle: { minHeight: 44, paddingHorizontal: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, managePanel: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.bg, gap: spacing.sm }, manageRow: { minHeight: 38, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs }, lineupBlock: { paddingVertical: spacing.xs, gap: spacing.xs }, textAction: { minHeight: 32, maxWidth: '100%', justifyContent: 'center', paddingHorizontal: spacing.xs }, adminActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingTop: spacing.xs }, compactAction: { minHeight: 34, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }, iconAction: { width: 34, height: 34, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, dangerAction: { borderColor: colors.danger },
  scoreAction: { minHeight: 34, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rubberList: { gap: spacing.xs },
  rubberRow: { minHeight: 46, paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  standingsHeader: { minHeight: 34, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, standingRow: { minHeight: 62, paddingHorizontal: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, rankCell: { width: 28, textAlign: 'center' }, statCell: { width: 38, textAlign: 'center' },
  smallAction: { minHeight: 34, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 }, lifecycle: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tieDraft: { gap: spacing.sm }, tieMatchList: { maxHeight: 300 }, tieMatchListContent: { gap: spacing.sm }, tieLabel: { flex: 1, minHeight: 42 },
  empty: { padding: spacing.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, alignItems: 'center' },
  overlay: { flex: 1, padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center' }, modal: { width: '100%', maxWidth: 560, maxHeight: '88%', padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.surface, gap: spacing.sm },
  rulesModal: { width: '100%', maxWidth: 560, maxHeight: '92%', padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.surface, gap: spacing.md },
  rulesModalContent: { gap: spacing.md, paddingBottom: spacing.xs },
  settingsModal: { width: '100%', maxWidth: 560, maxHeight: '92%', padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.surface, gap: spacing.md },
  settingsContent: { gap: spacing.sm, paddingBottom: spacing.xs },
  mediaActions: { minHeight: 100, flexDirection: 'row', gap: spacing.sm },
  mediaAction: { flex: 1, overflow: 'hidden', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  mediaPreview: { width: '100%', height: 68 },
  placeSuggestion: { padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  input: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontFamily: 'Inter_500Medium' }, multiline: { minHeight: 92, paddingTop: spacing.sm, textAlignVertical: 'top' }, reasonInput: { minHeight: 96, paddingVertical: spacing.sm, textAlignVertical: 'top' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, choice: { minHeight: 38, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, justifyContent: 'center' },
});
