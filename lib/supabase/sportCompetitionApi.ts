import type { SportCompetitionLifecycle } from '@/lib/sports/platform/competitionLifecycle';

import { getSupabaseClient } from './client';
import { normalizeCompetitionRpcMessage } from './competitionRpcMessages';

export type CloudCompetitionKind = 'TOURNAMENT' | 'LEAGUE';
export type CloudCompetitionLifecycle = SportCompetitionLifecycle;
export type CloudRegistrationStatus = 'PENDING' | 'ACCEPTED' | 'APPROVED'
  | 'WITHDRAWN' | 'REJECTED' | 'DISQUALIFIED';
export type CloudStageKind = 'GROUP' | 'ROUND_ROBIN' | 'KNOCKOUT' | 'FINALS' | 'CUSTOM';

export interface CloudCompetition {
  id: string;
  sportId: string;
  kind: CloudCompetitionKind;
  name: string;
  description?: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  lifecycle: CloudCompetitionLifecycle;
  ownerAccountId: string;
  timezone: string;
  matchFormat: 'SINGLES' | 'DOUBLES';
  startsAt?: string;
  endsAt?: string;
  registrationOpensAt?: string;
  registrationClosesAt?: string;
  scheduleVersion: number;
}

export interface CloudCompetitionEntry {
  id: string;
  competitionId: string;
  entryKind: 'SQUAD' | 'PLAYER';
  divisionKey: string;
  status: CloudRegistrationStatus;
  seed?: number;
  displayName: string;
  sourceTeamId?: string;
  sportProfileId?: string;
}

export interface CloudCompetitionStage {
  id: string;
  name: string;
  kind: CloudStageKind;
  displayOrder: number;
}

export interface CloudCompetitionDivision {
  id: string;
  divisionKey: string;
  name: string;
  displayOrder: number;
  registrationCapacity?: number;
}

export interface CloudCompetitionVenue {
  id: string;
  name: string;
  address?: string;
  courtCount?: number;
  displayOrder: number;
}

export interface CloudFixture {
  id: string;
  competitionId: string;
  stageId?: string;
  divisionKey: string;
  entrantAId: string;
  entrantBId: string;
  venueId?: string;
  court?: string;
  scheduledAt?: string;
  checkInOpensAt?: string;
  checkInClosesAt?: string;
  durationMinutes?: number;
  displayOrder: number;
  status: 'SCHEDULED' | 'CANCELLED';
  cancellationReason?: string;
  rowVersion: number;
  matches: CloudFixtureMatch[];
}

export interface CloudFixtureMatch {
  id: string;
  fixtureId: string;
  displayOrder: number;
  format: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
  label: string;
}

export type CloudFixtureMatchDraft = Pick<CloudFixtureMatch, 'format' | 'label'>;

export interface CloudTeamTieTemplate {
  id: string;
  competitionId: string;
  name: string;
  rubbers: CloudFixtureMatchDraft[];
}

export interface CloudTeamTieState {
  fixtureId: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'CLINCHED' | 'COMPLETED';
  rubberCount: number;
  majorityThreshold: number;
  entrantAWins: number;
  entrantBWins: number;
  winnerEntryId?: string;
  startedAt?: string;
  clinchedAt?: string;
}

export interface CloudCompetitionPointsRule {
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  walkoverPoints: number;
  version: number;
}

export interface CloudFixtureOfficial {
  id: string;
  fixtureId: string;
  accountId: string;
  displayName: string;
  role: 'SCOREKEEPER' | 'REFEREE';
}

export interface CloudFixtureCheckIn {
  id: string;
  fixtureId: string;
  entryId: string;
  status: 'CHECKED_IN' | 'LATE' | 'NO_SHOW';
  checkedAt: string;
}

export interface CloudCompetitionInvitation {
  accessId: string;
  competitionId: string;
  competitionName: string;
  kind: CloudCompetitionKind;
}

export interface CloudCompetitionOrganizer {
  accessId: string;
  accountId: string;
  displayName: string;
  status: 'PENDING' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}

export interface CloudCompetitionDetail {
  competition: CloudCompetition;
  entries: CloudCompetitionEntry[];
  stages: CloudCompetitionStage[];
  divisions: CloudCompetitionDivision[];
  venues: CloudCompetitionVenue[];
  fixtures: CloudFixture[];
  checkIns: CloudFixtureCheckIn[];
  pointsRule: CloudCompetitionPointsRule;
  officials: CloudFixtureOfficial[];
  canManage: boolean;
}

const competitionFields = 'id, sport_id, kind, name, description, visibility, lifecycle, owner_account_id, timezone, match_format, starts_at, ends_at, registration_opens_at, registration_closes_at, schedule_version';

export const sportCompetitionApi = {
  async listInvitations(sportCode: string): Promise<CloudCompetitionInvitation[]> {
    const { data, error } = await getSupabaseClient().rpc('list_my_sport_competition_invitations', {
      p_sport_code: sportCode,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      accessId: String(row.access_id), competitionId: String(row.competition_id),
      competitionName: String(row.competition_name), kind: String(row.kind) as CloudCompetitionKind,
    }));
  },

  async list(sportCode: string): Promise<CloudCompetition[]> {
    const { data, error } = await getSupabaseClient().from('sport_competitions')
      .select(`${competitionFields}, sports!inner(code)`)
      .eq('sports.code', sportCode)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapCompetition(row as Record<string, unknown>));
  },

  async get(competitionId: string): Promise<CloudCompetitionDetail> {
    const client = getSupabaseClient();
    const [competitionResult, entriesResult, stagesResult, divisionsResult, venuesResult, fixturesResult, matchesResult, checkInsResult, pointsResult, officialsResult, manageResult] = await Promise.all([
      client.from('sport_competitions').select(competitionFields).eq('id', competitionId).single(),
      client.from('sport_competition_entries').select('id, competition_id, entry_kind, division_key, status, seed, snapshot, sport_tournament_squads(source_team_id, name_snapshot), sport_league_players(sport_profile_id, display_name_snapshot)').eq('competition_id', competitionId).order('created_at'),
      client.from('sport_competition_stages').select('id, name, kind, display_order').eq('competition_id', competitionId).order('display_order'),
      client.from('sport_competition_divisions').select('id, division_key, name, display_order, registration_capacity').eq('competition_id', competitionId).order('display_order'),
      client.from('sport_competition_venues').select('id, name, address, court_count, display_order').eq('competition_id', competitionId).order('display_order'),
      client.from('sport_fixtures').select('id, competition_id, stage_id, division_key, entrant_a_id, entrant_b_id, venue_id, court, scheduled_at, check_in_opens_at, check_in_closes_at, duration_minutes, display_order, status, cancellation_reason, row_version').eq('competition_id', competitionId).order('display_order'),
      client.from('sport_fixture_matches').select('id, fixture_id, display_order, match_format, label').eq('competition_id', competitionId).order('display_order'),
      client.from('sport_fixture_check_ins').select('id, fixture_id, entry_id, status, checked_at').eq('competition_id', competitionId),
      client.from('sport_competition_points_rules').select('win_points, draw_points, loss_points, walkover_points, version').eq('competition_id', competitionId).single(),
      client.from('sport_fixture_officials').select('id, fixture_id, account_id, display_name_snapshot, role').eq('competition_id', competitionId).order('created_at'),
      client.rpc('can_manage_sport_competition', { p_competition_id: competitionId }),
    ]);
    if (competitionResult.error) throw competitionResult.error;
    for (const result of [entriesResult, stagesResult, divisionsResult, venuesResult, fixturesResult, matchesResult, checkInsResult, pointsResult, officialsResult, manageResult]) {
      if (result.error) throw result.error;
    }
    if (!pointsResult.data) throw new Error('Competition points rules were not found.');
    return {
      competition: mapCompetition(competitionResult.data),
      entries: (entriesResult.data ?? []).map((row) => mapEntry(row as Record<string, unknown>)),
      stages: (stagesResult.data ?? []).map((row) => ({
        id: String(row.id), name: String(row.name), kind: String(row.kind) as CloudStageKind,
        displayOrder: Number(row.display_order),
      })),
      divisions: (divisionsResult.data ?? []).map((row) => ({
        id: String(row.id), divisionKey: String(row.division_key), name: String(row.name),
        displayOrder: Number(row.display_order), registrationCapacity: optionalNumber(row.registration_capacity),
      })),
      venues: (venuesResult.data ?? []).map((row) => ({
        id: String(row.id), name: String(row.name), address: optionalString(row.address),
        courtCount: optionalNumber(row.court_count),
        displayOrder: Number(row.display_order),
      })),
      fixtures: (fixturesResult.data ?? []).map((row) => mapFixture(
        row as Record<string, unknown>,
        (matchesResult.data ?? []).filter((match) => match.fixture_id === row.id),
      )),
      checkIns: (checkInsResult.data ?? []).map((row) => ({
        id: String(row.id), fixtureId: String(row.fixture_id), entryId: String(row.entry_id),
        status: String(row.status) as CloudFixtureCheckIn['status'], checkedAt: String(row.checked_at),
      })),
      pointsRule: {
        winPoints: Number(pointsResult.data.win_points), drawPoints: Number(pointsResult.data.draw_points),
        lossPoints: Number(pointsResult.data.loss_points), walkoverPoints: Number(pointsResult.data.walkover_points),
        version: Number(pointsResult.data.version),
      },
      officials: (officialsResult.data ?? []).map((row) => ({
        id: String(row.id), fixtureId: String(row.fixture_id), accountId: String(row.account_id),
        displayName: String(row.display_name_snapshot), role: String(row.role) as CloudFixtureOfficial['role'],
      })),
      canManage: Boolean(manageResult.data),
    };
  },

  async create(input: {
    sportCode: string; kind: CloudCompetitionKind; name: string;
    visibility: 'PUBLIC' | 'PRIVATE'; timezone: string;
  }): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('create_sport_competition', {
      p_sport_code: input.sportCode, p_kind: input.kind, p_name: input.name.trim(),
      p_match_format: 'SINGLES',
      p_visibility: input.visibility, p_timezone: input.timezone.trim(),
    });
    if (error) throw error;
    return String(data);
  },

  async transition(competitionId: string, target: CloudCompetitionLifecycle, reason?: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('transition_sport_competition', {
      p_competition_id: competitionId, p_target: target, p_reason: reason ?? null,
    });
    if (error) throw error;
  },

  async update(competition: CloudCompetition, input: {
    name: string; description?: string; visibility: 'PUBLIC' | 'PRIVATE'; timezone: string;
    startsAt?: string; endsAt?: string; registrationOpensAt?: string; registrationClosesAt?: string;
  }): Promise<void> {
    const { error } = await getSupabaseClient().rpc('update_sport_competition', {
      p_competition_id: competition.id, p_name: input.name.trim(),
      p_description: input.description?.trim() || null, p_visibility: input.visibility,
      p_timezone: input.timezone.trim(), p_starts_at: input.startsAt ?? null,
      p_ends_at: input.endsAt ?? null, p_registration_opens_at: input.registrationOpensAt ?? null,
      p_registration_closes_at: input.registrationClosesAt ?? null,
    });
    if (error) throw error;
  },

  async listOrganizers(competitionId: string): Promise<CloudCompetitionOrganizer[]> {
    const { data, error } = await getSupabaseClient().rpc('list_sport_competition_organizers', {
      p_competition_id: competitionId,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      accessId: String(row.access_id), accountId: String(row.account_id),
      displayName: String(row.display_name), status: String(row.status) as CloudCompetitionOrganizer['status'],
    }));
  },

  async inviteOrganizer(competitionId: string, accountId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('invite_sport_competition_organizer', {
      p_competition_id: competitionId, p_account_id: accountId,
    });
    if (error) throw error;
  },

  async respondOrganizer(accessId: string, accept: boolean): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('respond_sport_competition_organizer', {
      p_access_id: accessId, p_accept: accept,
    });
    if (error) throw error;
    return String(data);
  },

  async revokeOrganizer(competitionId: string, accountId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('revoke_sport_competition_organizer', {
      p_competition_id: competitionId, p_account_id: accountId,
    });
    if (error) throw error;
  },

  async transferOwnership(competitionId: string, accountId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('transfer_sport_competition_ownership', {
      p_competition_id: competitionId, p_new_owner_account_id: accountId,
    });
    if (error) throw error;
  },

  async addStage(competitionId: string, name: string, kind: CloudStageKind, displayOrder: number): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('add_sport_competition_stage', {
      p_competition_id: competitionId, p_name: name.trim(), p_kind: kind, p_display_order: displayOrder,
    });
    if (error) throw error;
    return String(data);
  },

  async addDivision(competitionId: string, key: string, name: string, displayOrder: number, capacity?: number): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('add_sport_competition_division', {
      p_competition_id: competitionId, p_division_key: key.trim().toUpperCase(),
      p_name: name.trim(), p_display_order: displayOrder, p_capacity: capacity ?? null,
    });
    if (error) throw error;
    return String(data);
  },

  async addVenue(competitionId: string, name: string, address?: string): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('add_sport_competition_venue', {
      p_competition_id: competitionId, p_name: name.trim(), p_address: address?.trim() || null,
    });
    if (error) throw error;
    return String(data);
  },

  async registerLeaguePlayer(competitionId: string, sportProfileId: string, divisionKey = 'OPEN'): Promise<string> {
    try {
      const { data, error } = await getSupabaseClient().rpc('register_sport_league_player', {
        p_competition_id: competitionId, p_sport_profile_id: sportProfileId, p_division_key: divisionKey,
      });
      if (error) throw error;
      return String(data);
    } catch (cause) {
      throw new Error(normalizeCompetitionRpcMessage(cause));
    }
  },

  async registerTournamentSquad(competitionId: string, teamId: string, divisionKey = 'OPEN'): Promise<string> {
    try {
      const { data, error } = await getSupabaseClient().rpc('register_sport_tournament_squad', {
        p_competition_id: competitionId, p_team_id: teamId, p_division_key: divisionKey,
      });
      if (error) throw error;
      return String(data);
    } catch (cause) {
      throw new Error(normalizeCompetitionRpcMessage(cause));
    }
  },

  async setEntryStatus(entryId: string, status: 'APPROVED' | 'REJECTED' | 'DISQUALIFIED', seed?: number): Promise<void> {
    const { error } = await getSupabaseClient().rpc('set_sport_entry_status', {
      p_entry_id: entryId, p_status: status, p_seed: seed ?? null,
    });
    if (error) throw error;
  },

  async withdrawEntry(entryId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('withdraw_sport_entry', { p_entry_id: entryId });
    if (error) throw error;
  },

  async schedule(input: {
    competitionId: string; stageId?: string; divisionKey: string; entrantAId: string;
    entrantBId: string; venueId?: string; court?: string; scheduledAt?: string;
    durationMinutes?: number; displayOrder: number; expectedScheduleVersion: number; idempotencyKey: string;
    matches?: CloudFixtureMatchDraft[];
  }): Promise<{ fixtureId: string; scheduleVersion: number }> {
    const params = {
      p_competition_id: input.competitionId, p_stage_id: input.stageId ?? null,
      p_division_key: input.divisionKey, p_entrant_a_id: input.entrantAId,
      p_entrant_b_id: input.entrantBId, p_venue_id: input.venueId ?? null,
      p_court: input.court?.trim() || null, p_scheduled_at: input.scheduledAt ?? null,
      p_duration_minutes: input.durationMinutes ?? null, p_display_order: input.displayOrder,
      p_expected_schedule_version: input.expectedScheduleVersion, p_idempotency_key: input.idempotencyKey,
    };
    const { data, error } = input.matches
      ? await getSupabaseClient().rpc('schedule_sport_team_tie', { ...params, p_matches: input.matches })
      : await getSupabaseClient().rpc('schedule_sport_fixture', params);
    if (error) throw error;
    const value = data as Record<string, unknown>;
    return { fixtureId: String(value.fixture_id), scheduleVersion: Number(value.schedule_version) };
  },

  async updateTeamTieMatches(
    fixture: CloudFixture, scheduleVersion: number, matches: CloudFixtureMatchDraft[],
  ): Promise<void> {
    const { error } = await getSupabaseClient().rpc('update_sport_team_tie_matches', {
      p_fixture_id: fixture.id, p_matches: matches,
      p_expected_schedule_version: scheduleVersion, p_expected_row_version: fixture.rowVersion,
    });
    if (error) throw error;
  },

  async submitTeamTieLineup(input: {
    fixtureMatchId: string; entryId: string; playerProfileIds: string[]; expectedVersion: number;
  }): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('submit_sport_team_tie_lineup', {
      p_fixture_match_id: input.fixtureMatchId,
      p_entry_id: input.entryId,
      p_player_profile_ids: input.playerProfileIds,
      p_expected_version: input.expectedVersion,
    });
    if (error) throw new Error(normalizeCompetitionRpcMessage(error));
    return String(data);
  },

  async upsertTeamTieTemplate(input: {
    competitionId: string; templateId?: string; name: string; rubbers: CloudFixtureMatchDraft[];
  }): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('upsert_sport_team_tie_template', {
      p_competition_id: input.competitionId, p_template_id: input.templateId ?? null,
      p_name: input.name.trim(), p_rubbers: input.rubbers,
    });
    if (error) throw new Error(normalizeCompetitionRpcMessage(error));
    return String(data);
  },

  async applyTeamTieTemplate(fixture: CloudFixture, scheduleVersion: number, templateId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('apply_sport_team_tie_template', {
      p_fixture_id: fixture.id, p_template_id: templateId,
      p_expected_schedule_version: scheduleVersion, p_expected_row_version: fixture.rowVersion,
    });
    if (error) throw new Error(normalizeCompetitionRpcMessage(error));
  },

  async overrideTeamTieLineup(input: {
    fixtureMatchId: string; entryId: string; playerProfileIds: string[]; expectedVersion: number; reason: string;
  }): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('override_sport_team_tie_lineup', {
      p_fixture_match_id: input.fixtureMatchId, p_entry_id: input.entryId,
      p_player_profile_ids: input.playerProfileIds, p_expected_version: input.expectedVersion,
      p_reason: input.reason.trim(),
    });
    if (error) throw new Error(normalizeCompetitionRpcMessage(error));
    return String(data);
  },

  async reviewTeamTieLineup(lineupId: string, approve: boolean, reason?: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('review_sport_team_tie_lineup', {
      p_lineup_id: lineupId, p_approve: approve, p_reason: reason?.trim() || null,
    });
    if (error) throw new Error(normalizeCompetitionRpcMessage(error));
  },

  async startTeamTie(fixtureId: string, reason?: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('start_sport_team_tie', {
      p_fixture_id: fixtureId, p_reason: reason?.trim() || null,
    });
    if (error) throw new Error(normalizeCompetitionRpcMessage(error));
  },

  async recordTeamTieRubberOutcome(fixtureMatchId: string, winnerEntryId: string, reason: string): Promise<CloudTeamTieState> {
    const { data, error } = await getSupabaseClient().rpc('record_sport_team_tie_rubber_result', {
      p_fixture_match_id: fixtureMatchId, p_winner_entry_id: winnerEntryId, p_reason: reason.trim(),
    });
    if (error) throw new Error(normalizeCompetitionRpcMessage(error));
    return mapTeamTieState(data as Record<string, unknown>);
  },

  async getTeamTieState(fixtureId: string): Promise<CloudTeamTieState> {
    const { data, error } = await getSupabaseClient().rpc('get_sport_team_tie_state', { p_fixture_id: fixtureId });
    if (error) throw new Error(normalizeCompetitionRpcMessage(error));
    return mapTeamTieState(data as Record<string, unknown>);
  },

  async cancelFixture(fixture: CloudFixture, scheduleVersion: number, reason: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('cancel_sport_fixture', {
      p_fixture_id: fixture.id, p_reason: reason.trim(),
      p_expected_schedule_version: scheduleVersion, p_expected_row_version: fixture.rowVersion,
    });
    if (error) throw error;
  },

  async rescheduleFixture(fixture: CloudFixture, scheduleVersion: number, input: {
    venueId?: string; court?: string; scheduledAt?: string; durationMinutes?: number; displayOrder: number;
  }): Promise<void> {
    const { error } = await getSupabaseClient().rpc('reschedule_sport_fixture', {
      p_fixture_id: fixture.id, p_venue_id: input.venueId ?? null,
      p_court: input.court?.trim() || null, p_scheduled_at: input.scheduledAt ?? null,
      p_duration_minutes: input.durationMinutes ?? null, p_display_order: input.displayOrder,
      p_expected_schedule_version: scheduleVersion, p_expected_row_version: fixture.rowVersion,
    });
    if (error) throw error;
  },

  async checkIn(fixtureId: string, entryId: string, status: 'CHECKED_IN' | 'LATE' | 'NO_SHOW' = 'CHECKED_IN'): Promise<void> {
    const { error } = await getSupabaseClient().rpc('check_in_sport_fixture_entry', {
      p_fixture_id: fixtureId, p_entry_id: entryId, p_status: status,
    });
    if (error) throw error;
  },

  async reorderFixtures(competitionId: string, fixtureIds: string[], expectedScheduleVersion: number): Promise<void> {
    const { error } = await getSupabaseClient().rpc('reorder_sport_fixtures', {
      p_competition_id: competitionId, p_fixture_ids: fixtureIds,
      p_expected_schedule_version: expectedScheduleVersion,
    });
    if (error) throw error;
  },

  async updatePointsRule(competitionId: string, rule: CloudCompetitionPointsRule): Promise<void> {
    const { error } = await getSupabaseClient().rpc('update_sport_competition_points_rule', {
      p_competition_id: competitionId, p_win_points: rule.winPoints,
      p_draw_points: rule.drawPoints, p_loss_points: rule.lossPoints,
      p_walkover_points: rule.walkoverPoints, p_expected_version: rule.version,
    });
    if (error) throw error;
  },

  async assignOfficial(fixtureId: string, accountId: string, role: CloudFixtureOfficial['role']): Promise<void> {
    const { error } = await getSupabaseClient().rpc('assign_sport_fixture_official', {
      p_fixture_id: fixtureId, p_account_id: accountId, p_role: role,
    });
    if (error) throw error;
  },

  async revokeOfficial(officialId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('revoke_sport_fixture_official', { p_official_id: officialId });
    if (error) throw error;
  },

  async updateResource(type: 'STAGE' | 'VENUE' | 'DIVISION', id: string, name: string, address?: string, capacity?: number): Promise<void> {
    const { error } = await getSupabaseClient().rpc('update_sport_competition_resource', {
      p_resource_type: type, p_resource_id: id, p_name: name.trim(),
      p_address: address?.trim() || null, p_capacity: capacity ?? null,
    });
    if (error) throw error;
  },

  async deleteResource(type: 'STAGE' | 'VENUE' | 'DIVISION', id: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('delete_sport_competition_resource', {
      p_resource_type: type, p_resource_id: id,
    });
    if (error) throw error;
  },

  async reorderResources(competitionId: string, type: 'STAGE' | 'VENUE' | 'DIVISION', ids: string[]): Promise<void> {
    const { error } = await getSupabaseClient().rpc('reorder_sport_competition_resources', {
      p_competition_id: competitionId, p_resource_type: type, p_resource_ids: ids,
    });
    if (error) throw error;
  },
};

function mapCompetition(row: Record<string, unknown>): CloudCompetition {
  return {
    id: String(row.id), sportId: String(row.sport_id), kind: String(row.kind) as CloudCompetitionKind,
    name: String(row.name), description: optionalString(row.description),
    visibility: String(row.visibility) as CloudCompetition['visibility'],
    lifecycle: String(row.lifecycle) as CloudCompetitionLifecycle,
    ownerAccountId: String(row.owner_account_id), timezone: String(row.timezone),
    matchFormat: String(row.match_format) as CloudCompetition['matchFormat'],
    startsAt: optionalString(row.starts_at), endsAt: optionalString(row.ends_at),
    registrationOpensAt: optionalString(row.registration_opens_at),
    registrationClosesAt: optionalString(row.registration_closes_at),
    scheduleVersion: Number(row.schedule_version),
  };
}

function mapEntry(row: Record<string, unknown>): CloudCompetitionEntry {
  const squad = one(row.sport_tournament_squads);
  const player = one(row.sport_league_players);
  const snapshot = row.snapshot && typeof row.snapshot === 'object' ? row.snapshot as Record<string, unknown> : {};
  return {
    id: String(row.id), competitionId: String(row.competition_id),
    entryKind: String(row.entry_kind) as CloudCompetitionEntry['entryKind'],
    divisionKey: String(row.division_key), status: String(row.status) as CloudRegistrationStatus,
    seed: optionalNumber(row.seed),
    displayName: String(squad?.name_snapshot ?? player?.display_name_snapshot ?? snapshot.name ?? snapshot.display_name ?? 'Entrant'),
    sourceTeamId: squad ? String(squad.source_team_id) : undefined,
    sportProfileId: player ? String(player.sport_profile_id) : undefined,
  };
}

function mapFixture(row: Record<string, unknown>, matches: Record<string, unknown>[]): CloudFixture {
  return {
    id: String(row.id), competitionId: String(row.competition_id), stageId: optionalString(row.stage_id),
    divisionKey: String(row.division_key), entrantAId: String(row.entrant_a_id),
    entrantBId: String(row.entrant_b_id), venueId: optionalString(row.venue_id),
    court: optionalString(row.court), scheduledAt: optionalString(row.scheduled_at),
    checkInOpensAt: optionalString(row.check_in_opens_at), checkInClosesAt: optionalString(row.check_in_closes_at),
    durationMinutes: optionalNumber(row.duration_minutes), displayOrder: Number(row.display_order),
    status: String(row.status) as CloudFixture['status'],
    cancellationReason: optionalString(row.cancellation_reason), rowVersion: Number(row.row_version),
    matches: matches.map((match) => ({
      id: String(match.id), fixtureId: String(match.fixture_id),
      displayOrder: Number(match.display_order),
      format: String(match.match_format) as CloudFixtureMatch['format'], label: String(match.label),
    })),
  };
}

function mapTeamTieState(row: Record<string, unknown>): CloudTeamTieState {
  return {
    fixtureId: String(row.fixture_id), status: String(row.status) as CloudTeamTieState['status'],
    rubberCount: Number(row.rubber_count), majorityThreshold: Number(row.majority_threshold),
    entrantAWins: Number(row.entrant_a_wins), entrantBWins: Number(row.entrant_b_wins),
    winnerEntryId: optionalString(row.winner_entry_id), startedAt: optionalString(row.started_at),
    clinchedAt: optionalString(row.clinched_at),
  };
}

function one(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}
function optionalString(value: unknown): string | undefined { return typeof value === 'string' && value ? value : undefined; }
function optionalNumber(value: unknown): number | undefined { return typeof value === 'number' ? value : undefined; }
