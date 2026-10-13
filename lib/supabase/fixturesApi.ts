import { orderedBracketMatches } from '@/lib/wricket/fixtures/bracket-projection';
import { readPages } from './readPages';
import { getSupabaseClient } from './client';
import { newUuid } from '@/lib/wricket/db/ids';
import {
  CustomFormatBuilder,
  FormatRecommender,
  StandingsCalculator,
  KnockoutBracketBuilder,
  pairingStrategies,
} from '@/lib/wricket/fixtures';
import type {
  CustomFormat,
  FixtureGroup,
  FixtureMatch,
  KnockoutBracket,
  StandingRow,
  Tiebreaker,
  PointsRule,
  FormatRecommendation,
  PairingAlgorithm,
} from '@/lib/wricket/fixtures';
import { fixtureWinner, fixtureLoser } from '@/lib/wricket/fixtures/result';
import { seedQualifiers, type KnockoutPreset } from '@/lib/wricket/fixtures/qualifier-seeding';
import { manualFixtureError } from '@/lib/wricket/fixtures/manual-fixture';

const REALTIME_COUNTER_KEY = '__wricketFixturesRealtimeCounter';
const globalWithRealtimeCounter = globalThis as typeof globalThis & {
  [REALTIME_COUNTER_KEY]?: number;
};

function nextFixturesChannelTopic(tournamentId: string): string {
  const instance = (globalWithRealtimeCounter[REALTIME_COUNTER_KEY] ?? 0) + 1;
  globalWithRealtimeCounter[REALTIME_COUNTER_KEY] = instance;
  return `fixtures:${tournamentId}:${instance}`;
}

export interface GeneratedFixtureSetup {
  stages: any[];
  groups: any[];
  matches: FixtureMatch[];
  bracket: KnockoutBracket | null;
}

export type { KnockoutPreset } from '@/lib/wricket/fixtures/qualifier-seeding';

export interface ManualFixtureInput {
  stageId: string;
  groupId?: string;
  teamAId: string;
  teamBId: string;
  round: number;
  roundName?: string;
}

export const fixturesApi = {
  getFormatRecommendation(teamCount: number) {
    return new FormatRecommender().recommend(teamCount);
  },

  async generatePreset(input: {
    tournamentId: string;
    teamIds: string[];
    recommendation: FormatRecommendation;
    pairingAlgorithm: PairingAlgorithm;
    numberOfGroups: number;
    advancePerGroup: number;
    groupTeamIds?: string[][];
  }): Promise<void> {
    const key = JSON.stringify(input);
    if (pendingFixturePlans.has(key)) return commitFixturePlan(key, input.tournamentId, pendingFixturePlans.get(key)!);
    if (input.teamIds.length < 2) throw new Error('At least two cloud-synced teams are required');
    const stageId = newUuid();
    const knockoutOnly = input.recommendation.formatType === 'KNOCKOUT_ONLY';
    const config = knockoutOnly ? { knockout: { rounds: input.recommendation.knockoutRounds, seeding: 'TOP_VS_BOTTOM' } }
      : { pairingAlgorithm: input.pairingAlgorithm, advancePerGroup: input.advancePerGroup,
        knockoutPlanned: input.recommendation.formatType === 'GROUPS_THEN_KNOCKOUT',
        pointsRule: { win: 3, draw: 1, loss: 0 }, tiebreakers: ['HEAD_TO_HEAD', 'GOAL_DIFF', 'GOALS_FOR'] };
    const groups: FixturePlanPayload['groups'] = [];
    const matches: FixtureMatch[] = [];
    let bracket: KnockoutBracket | undefined;
    if (knockoutOnly) {
      bracket = new KnockoutBracketBuilder().build(stageId, input.teamIds.map(teamId => ({ teamId })),
        { rounds: input.recommendation.knockoutRounds, seeding: 'TOP_VS_BOTTOM' });
      matches.push(...bracket.rounds[0].matches);
    } else {
      const buckets = input.groupTeamIds ? validateManualGroups(input.teamIds, input.groupTeamIds, input.numberOfGroups)
        : distributeTeams(input.teamIds, input.numberOfGroups);
      for (const [index, teamIds] of buckets.entries()) {
        const group = { id: newUuid(), stage_id: stageId, name: `Group ${String.fromCharCode(65 + index)}`, team_ids: teamIds };
        groups.push(group);
        matches.push(...pairingStrategies.get(input.pairingAlgorithm).generate({ id: group.id, stageId, name: group.name, teamIds }));
      }
    }
    await commitFixturePlan(key, input.tournamentId, {
      teamIds: input.teamIds, stage: { id: stageId, stage_order: 1, type: knockoutOnly ? 'KNOCKOUT' : 'GROUP', config },
      groups, matches: matches.map(toFixtureRow), bracket,
    });
  },

  async generateKnockout(input: {
    tournamentId: string;
    preset: KnockoutPreset;
    qualifierTeamIds?: string[];
  }): Promise<void> {
    const key = JSON.stringify(input);
    if (pendingFixturePlans.has(key)) return commitFixturePlan(key, input.tournamentId, pendingFixturePlans.get(key)!);
    const setup = await this.getFixtureSetup(input.tournamentId);
    const existingKnockoutStage = setup.stages.find(stage => stage.type === 'KNOCKOUT');
    const existingKnockoutMatches = existingKnockoutStage
      ? setup.matches.filter(match => match.stageId === existingKnockoutStage.id)
      : [];
    if (setup.bracket || existingKnockoutMatches.length > 0) {
      throw new Error('Knockout fixtures have already been generated');
    }
    const groupStage = setup.stages.find(stage => stage.type === 'GROUP');
    if (!groupStage) throw new Error('Generate group fixtures first');
    const groupMatches = setup.matches.filter(match => match.stageId === groupStage.id);
    if (!groupMatches.length || groupMatches.some(match => match.status !== 'COMPLETED' && match.status !== 'WALKOVER')) {
      throw new Error('Every group match must be completed before generating knockouts');
    }
    const groups = setup.groups.filter(group => group.stage_id === groupStage.id);
    const standings = groups.map(row => ({
      group: row,
      rows: new StandingsCalculator().calculate({ id: row.id, stageId: row.stage_id, name: row.name, teamIds: row.team_ids }, groupMatches, groupStage.config?.pointsRule, groupStage.config?.tiebreakers),
    }));
    const qualifiers = seedQualifiers(standings.map(item => ({ id: item.group.id, name: item.group.name, rows: item.rows })), input.preset, input.qualifierTeamIds);
    const stage = existingKnockoutStage ?? { id: newUuid(), stage_order: 2, config: {} };
    let bracket: KnockoutBracket;
    if (input.preset === 'SIX_TEAM_CROSSOVER') {
      bracket = buildSixTeamCrossover(stage.id, qualifiers);
    } else if (input.preset === 'PLAYOFFS_4') {
      bracket = buildFourTeamPlayoffs(stage.id, qualifiers);
    } else if (input.preset === 'CUSTOM') {
      const rounds = roundsForQualifierCount(qualifiers.length);
      bracket = buildManualKnockout(stage.id, qualifiers, rounds);
    } else {
      const rounds = input.preset === 'FINAL_2' ? ['F'] : input.preset === 'SF_4' ? ['SF', 'F'] : input.preset === 'QF_8' ? ['QF', 'SF', 'F'] : roundsForQualifierCount(qualifiers.length);
      bracket = buildManualKnockout(stage.id, qualifiers, rounds);
    }
    await commitFixturePlan(key, input.tournamentId, {
      teamIds: qualifiers.map(team => team.teamId),
      stage: { id: stage.id, stage_order: stage.stage_order ?? 2, type: 'KNOCKOUT', depends_on_stage_id: groupStage.id,
        config: { ...stage.config, manual: false, preset: input.preset } },
      groups: [], matches: bracket.rounds[0].matches.map(toFixtureRow), bracket,
    });
  },

  async getFixtureSetup(tournamentId: string): Promise<GeneratedFixtureSetup> {
    const client = getSupabaseClient();
    const { data: stages, error: stageError } = await client.from('fixture_stages')
      .select('*').eq('tournament_id', tournamentId).order('stage_order');
    if (stageError) throw stageError;
    if (!stages.length) return { stages: [], groups: [], matches: [], bracket: null };
    const stageIds = stages.map(stage => stage.id);
    const [{ data: groups, error: groupError }, matches] = await Promise.all([
      client.from('fixture_groups').select('*').in('stage_id', stageIds).order('name'),
      readPages((start, end) => client.from('fixture_matches')
        .select('id, stage_id, group_id, round_id, team_a_id, team_b_id, round, leg, weight, status, score_a, score_b')
        .in('stage_id', stageIds).order('round').order('id').range(start, end)),
    ]);
    if (groupError) throw groupError;
    const canonicalByFixtureId = await getCanonicalMatches(matches.map(match => match.id));
    const knockout = stages.find(stage => stage.type === 'KNOCKOUT');
    const mappedMatches = matches.map(match => mapFixtureMatch(match, canonicalByFixtureId.get(match.id)));
    const bracket = knockout ? await this.getBracket(knockout.id) : null;
    if (bracket) {
      for (const round of bracket.rounds) {
        const current = mappedMatches.filter(match => match.roundId === round.id);
        if (current.length) round.matches = orderedBracketMatches(round.matches, current);
      }
    }
    return {
      stages,
      groups,
      matches: mappedMatches,
      bracket,
    };
  },

  /**
   * Reconciles completed canonical matches into generated fixtures and advances
   * group/knockout stages. Every step checks for an existing bracket/round,
   * making refreshes and realtime retries idempotent.
   */
  async advanceTournamentIfReady(tournamentId: string): Promise<boolean> {
    const client = getSupabaseClient();
    const setup = await this.getFixtureSetup(tournamentId);
    if (!setup.stages.length) return false;
    let changed = false;
    const groupStage = setup.stages.find(stage => stage.type === 'GROUP');
    const knockoutStage = setup.stages.find(stage => stage.type === 'KNOCKOUT');

    const refreshed = setup;
    const bracket = refreshed.bracket;
    if (!knockoutStage || !bracket || knockoutStage.config?.manual) return changed;
    // The bracket JSON is a durable template. Canonical fixture rows are the
    // authoritative status/result source and are projected into it here.
    const knockoutMatches = refreshed.matches.filter(match => match.stageId === knockoutStage.id);
    const firstRound = bracket.rounds[0];
    if (firstRound?.matches.length && !knockoutMatches.some(match => match.roundId === firstRound.id)) {
      await saveFixtureMatches(knockoutStage.id, firstRound.matches);
      await client.from('fixture_stages').update({ status: 'IN_PROGRESS' }).eq('id', knockoutStage.id);
      return true;
    }
    for (const round of bracket.rounds) {
      const saved = knockoutMatches.filter(match => match.roundId === round.id);
      if (saved.length) round.matches = orderedBracketMatches(round.matches, saved);
    }
    const populated = bracket.rounds
      .map((round, index) => ({ round, index }))
      .filter(item => item.round.name !== '3RD_PLACE' && item.round.matches.length > 0);
    const current = populated.at(-1);
    if (!current || !current.round.matches.every(match =>
      match.status === 'COMPLETED' || match.status === 'WALKOVER')) return changed;
    const next = bracket.rounds[current.index + 1];
    if (knockoutStage.config?.preset === 'SIX_TEAM_CROSSOVER' && next) {
      if (current.round.name === 'CROSSOVER') {
        const groupMatches = refreshed.matches.filter(match => match.stageId === groupStage?.id);
        const rankedWinners = current.round.matches.map(fixtureWinner)
          .sort((a, b) => teamNrr(b, groupMatches) - teamNrr(a, groupMatches));
        const directFinalistTeamId = rankedWinners[0];
        next.matches = [{
          id: `ko_${Math.random().toString(36).slice(2)}`,
          stageId: knockoutStage.id,
          roundId: next.id,
          teamA: rankedWinners[1],
          teamB: rankedWinners[2],
          round: 2,
          leg: 1,
          status: 'SCHEDULED',
        }];
        await saveAdvancedRound(knockoutStage.id, bracket, next.matches, { directFinalistTeamId });
        return true;
      }
      if (current.round.name === 'ELIMINATOR') {
        const directFinalistTeamId = knockoutStage.config.directFinalistTeamId;
        if (!directFinalistTeamId) throw new Error('Direct finalist is missing');
        next.matches = [{
          id: `ko_${Math.random().toString(36).slice(2)}`,
          stageId: knockoutStage.id,
          roundId: next.id,
          teamA: directFinalistTeamId,
          teamB: fixtureWinner(current.round.matches[0]),
          round: 3,
          leg: 1,
          status: 'SCHEDULED',
        }];
        await saveAdvancedRound(knockoutStage.id, bracket, next.matches);
        return true;
      }
    }
    if (knockoutStage.config?.preset === 'PLAYOFFS_4' && next) {
      if (current.round.name === 'PLAYOFFS_1') {
        const qualifierOne = current.round.matches[0];
        const eliminator = current.round.matches[1];
        next.matches = [{
          id: `ko_${Math.random().toString(36).slice(2)}`,
          stageId: knockoutStage.id,
          roundId: next.id,
          teamA: fixtureLoser(qualifierOne),
          teamB: fixtureWinner(eliminator),
          round: 2,
          leg: 1,
          status: 'SCHEDULED',
        }];
        await saveAdvancedRound(knockoutStage.id, bracket, next.matches, { directFinalistTeamId: fixtureWinner(qualifierOne) });
        return true;
      }
      if (current.round.name === 'QUALIFIER_2') {
        const directFinalistTeamId = knockoutStage.config.directFinalistTeamId;
        if (!directFinalistTeamId) throw new Error('Qualifier 1 winner is missing');
        next.matches = [{ id: `ko_${Math.random().toString(36).slice(2)}`, stageId: knockoutStage.id, roundId: next.id, teamA: directFinalistTeamId, teamB: fixtureWinner(current.round.matches[0]), round: 3, leg: 1, status: 'SCHEDULED' }];
        await saveAdvancedRound(knockoutStage.id, bracket, next.matches);
        return true;
      }
    }
    if (next && next.name !== '3RD_PLACE' && next.matches.length === 0) {
      const nextMatches = new KnockoutBracketBuilder().resolveNextRound(bracket, current.index);
      if (nextMatches.length) {
        await saveAdvancedRound(knockoutStage.id, bracket, nextMatches);
        return true;
      }
    }
    if (!next) {
      if (knockoutStage.status === 'COMPLETED') return changed;
      // Confirm the final has a winner before declaring the stage complete.
      current.round.matches.forEach(fixtureWinner);
      const { error } = await client.from('fixture_stages')
        .update({ status: 'COMPLETED' }).eq('id', knockoutStage.id);
      if (error) throw error;
      changed = true;
    }
    return changed;
  },

  async saveCustomFormat(format: CustomFormat, teamCount: number): Promise<CustomFormat> {
    new CustomFormatBuilder().assertValid(format, teamCount);
    const { data, error } = await getSupabaseClient().from('custom_formats').upsert({
      id: format.id,
      name: format.name,
      owner_id: format.ownerId,
      is_reusable_template: format.isReusableTemplate,
      stages: format.stages,
      updated_at: new Date().toISOString(),
    }).select('id, name, owner_id, is_reusable_template, stages').single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      ownerId: data.owner_id,
      isReusableTemplate: data.is_reusable_template,
      stages: data.stages,
    };
  },

  async listCustomFormats(): Promise<CustomFormat[]> {
    const { data, error } = await getSupabaseClient()
      .from('custom_formats')
      .select('id, name, owner_id, is_reusable_template, stages')
      .order('created_at');
    if (error) throw error;
    return data.map(item => ({
      id: item.id,
      name: item.name,
      ownerId: item.owner_id,
      isReusableTemplate: item.is_reusable_template,
      stages: item.stages,
    }));
  },

  async addStage(tournamentId: string, stage: {
    order: number;
    type: 'GROUP' | 'KNOCKOUT';
    config: object;
    dependsOnStageId?: string;
  }) {
    const { data, error } = await getSupabaseClient().from('fixture_stages').insert({
      tournament_id: tournamentId,
      stage_order: stage.order,
      type: stage.type,
      config: stage.config,
      depends_on_stage_id: stage.dependsOnStageId ?? null,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async addManualStage(tournamentId: string, type: 'GROUP' | 'KNOCKOUT') {
    const client = getSupabaseClient();
    const setup = await this.getFixtureSetup(tournamentId);
    if (setup.stages.some(stage => stage.type === type)) {
      throw new Error(`${type === 'GROUP' ? 'A group' : 'A knockout'} stage already exists`);
    }
    if (setup.stages.some(stage => !stage.config?.manual)) {
      throw new Error('Manual stages cannot be added to an automatically generated schedule');
    }
    const groupStage = setup.stages.find(stage => stage.type === 'GROUP');
    const stage = await this.addStage(tournamentId, {
      order: setup.stages.reduce((highest, item) => Math.max(highest, Number(item.stage_order ?? 0)), 0) + 1,
      type,
      dependsOnStageId: type === 'KNOCKOUT' ? groupStage?.id : undefined,
      config: type === 'GROUP'
        ? {
          manual: true,
          pairingAlgorithm: 'MANUAL',
          pointsRule: { win: 3, draw: 1, loss: 0 },
          tiebreakers: ['HEAD_TO_HEAD', 'GOAL_DIFF', 'GOALS_FOR'],
        }
        : { manual: true, seeding: 'MANUAL' },
    });
    const { error } = await client.from('fixture_stages')
      .update({ status: 'IN_PROGRESS' })
      .eq('id', stage.id);
    if (error) throw error;
    return { ...stage, status: 'IN_PROGRESS' };
  },

  async addManualGroup(input: {
    stageId: string;
    name: string;
    teamIds: string[];
  }) {
    const name = input.name.trim();
    const teamIds = [...new Set(input.teamIds)];
    if (!name) throw new Error('Enter a group name');
    if (teamIds.length < 2) throw new Error('Select at least two teams for the group');
    const client = getSupabaseClient();
    const { data: stage, error: stageError } = await client.from('fixture_stages')
      .select('id, tournament_id, type, config')
      .eq('id', input.stageId)
      .single();
    if (stageError) throw stageError;
    if (stage.type !== 'GROUP' || !stage.config?.manual) {
      throw new Error('Groups can only be added to a manual group stage');
    }
    const { data: existingGroups, error: existingGroupsError } = await client.from('fixture_groups')
      .select('team_ids')
      .eq('stage_id', input.stageId);
    if (existingGroupsError) throw existingGroupsError;
    const assignedTeamIds = new Set(existingGroups.flatMap(group => group.team_ids));
    if (teamIds.some(teamId => assignedTeamIds.has(teamId))) {
      throw new Error('A team can only belong to one group in this stage');
    }
    const { data, error } = await client.from('fixture_groups').insert({
      stage_id: input.stageId,
      name,
      team_ids: teamIds,
    }).select('id, stage_id, name, team_ids').single();
    if (error) throw error;
    return data;
  },

  async addManualFixture(input: ManualFixtureInput): Promise<FixtureMatch> {
    if (!input.teamAId || !input.teamBId || input.teamAId === input.teamBId) {
      throw new Error('Select two different teams');
    }
    if (!Number.isInteger(input.round) || input.round < 1) {
      throw new Error('Round must be a whole number greater than zero');
    }
    const client = getSupabaseClient();
    const { data: stage, error: stageError } = await client.from('fixture_stages')
      .select('id, tournament_id, type, config')
      .eq('id', input.stageId)
      .single();
    if (stageError) throw stageError;
    if (!stage.config?.manual) throw new Error('Fixtures can only be added through the manual schedule builder');
    if (stage.type === 'GROUP') {
      if (!input.groupId) throw new Error('Choose a group for this fixture');
      const { data: group, error: groupError } = await client.from('fixture_groups')
        .select('id, stage_id, team_ids')
        .eq('id', input.groupId)
        .single();
      if (groupError) throw groupError;
      if (group.stage_id !== input.stageId) throw new Error('The selected group belongs to another stage');
      if (!group.team_ids.includes(input.teamAId) || !group.team_ids.includes(input.teamBId)) {
        throw new Error('Both teams must belong to the selected group');
      }
    }
    const { data: existing, error: existingError } = await client.from('fixture_matches')
      .select('id, team_a_id, team_b_id, round_id, status')
      .eq('stage_id', input.stageId)
      .eq('round', input.round);
    if (existingError) throw existingError;
    const duplicate = existing.some(match =>
      (match.team_a_id === input.teamAId && match.team_b_id === input.teamBId) ||
      (match.team_a_id === input.teamBId && match.team_b_id === input.teamAId));
    if (duplicate) throw new Error('These teams already meet in this round');
    const { data: tournamentTeams, error: teamsError } = await client.from('teams').select('id').eq('tournament_id', stage.tournament_id);
    if (teamsError) throw teamsError;
    const conflict = manualFixtureError(input, tournamentTeams.map(team => team.id), (await this.getFixtureSetup(stage.tournament_id)).matches);
    if (conflict) throw new Error(conflict);
    const roundId = input.roundName?.trim() || `MANUAL_R${input.round}`;
    const fixture: FixtureMatch = {
      id: '',
      stageId: input.stageId,
      groupId: input.groupId,
      roundId,
      teamA: input.teamAId,
      teamB: input.teamBId,
      round: input.round,
      leg: 1,
      status: 'SCHEDULED',
    };
    await saveFixtureMatches(input.stageId, [fixture]);
    const { error: statusError } = await client.from('fixture_stages')
      .update({ status: 'IN_PROGRESS' })
      .eq('id', input.stageId);
    if (statusError) throw statusError;
    let createdQuery = client.from('fixture_matches')
      .select('id, stage_id, group_id, round_id, team_a_id, team_b_id, round, leg, weight, status, score_a, score_b')
      .eq('stage_id', input.stageId)
      .eq('round_id', roundId)
      .eq('team_a_id', input.teamAId)
      .eq('team_b_id', input.teamBId)
      .eq('round', input.round)
      .eq('leg', 1);
    createdQuery = input.groupId
      ? createdQuery.eq('group_id', input.groupId)
      : createdQuery.is('group_id', null);
    const { data: created, error: createdError } = await createdQuery.maybeSingle();
    if (createdError) throw createdError;
    if (!created) throw new Error('Fixture was created but could not be loaded');
    const canonical = await getCanonicalMatches([created.id]);
    const mapped = mapFixtureMatch(created, canonical.get(created.id));
    if (!mapped.canonicalMatchId) throw new Error('Fixture was created but its match setup is not available');
    return mapped;
  },

  async editManualFixture(fixtureId: string, input: ManualFixtureInput): Promise<void> {
    const client = getSupabaseClient();
    const { data: stage, error: stageError } = await client.from('fixture_stages').select('id,tournament_id,type,config').eq('id', input.stageId).single();
    if (stageError) throw stageError;
    if (!stage.config?.manual) throw new Error('Only manual fixtures can be edited here.');
    const setup = await this.getFixtureSetup(stage.tournament_id);
    const fixture = setup.matches.find(match => match.id === fixtureId && match.stageId === input.stageId);
    if (!fixture || fixture.status !== 'SCHEDULED') throw new Error('Only an unstarted fixture can be edited.');
    const { data: teams, error: teamsError } = await client.from('teams').select('id').eq('tournament_id', stage.tournament_id);
    if (teamsError) throw teamsError;
    const group = setup.groups.find(item => item.id === input.groupId && item.stage_id === input.stageId);
    if (stage.type === 'GROUP' && !group) throw new Error('Choose a group in this stage.');
    const error = manualFixtureError(input, stage.type === 'GROUP' ? group.team_ids : teams.map(team => team.id), setup.matches, fixtureId);
    if (error) throw new Error(error);
    const { error: editError } = await client.rpc('edit_owned_cricket_fixture', {
      p_fixture_id: fixtureId, p_manual: true,
      p_input: { group_id: input.groupId ?? null, team_a_id: input.teamAId, team_b_id: input.teamBId,
        round: input.round, round_id: input.roundName?.trim() || `MANUAL_R${input.round}` },
    });
    if (editError) throw editError;
  },

  async patchMatchResult(matchId: string, scoreA: number, scoreB: number, walkover = false) {
    const { data, error } = await getSupabaseClient().from('fixture_matches').update({
      score_a: scoreA,
      score_b: scoreB,
      status: walkover ? 'WALKOVER' : 'COMPLETED',
      updated_at: new Date().toISOString(),
    }).eq('id', matchId).select().single();
    if (error) throw error;
    return data;
  },

  async deleteMatch(matchId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('delete_owned_cricket_fixture', { p_fixture_id: matchId });
    if (error) throw error;
  },

  async updateMatch(match: FixtureMatch, input: {
    teamAId: string;
    teamBId?: string;
    scheduledAt?: string;
    venue?: string;
  }): Promise<void> {
    const { error } = await getSupabaseClient().rpc('edit_owned_cricket_fixture', {
      p_fixture_id: match.id, p_manual: false,
      p_input: { team_a_id: input.teamAId, team_b_id: input.teamBId ?? null,
        scheduled_at: input.scheduledAt ?? null, venue: input.venue?.trim() || null },
    });
    if (error) throw error;
  },

  async updateMatchById(input: {
    fixtureMatchId: string;
    canonicalMatchId: string;
    teamAId: string;
    teamBId: string;
    scheduledAt?: string;
    venue?: string;
  }): Promise<void> {
    await this.updateMatch({
      id: input.fixtureMatchId,
      canonicalMatchId: input.canonicalMatchId,
      stageId: '',
      teamA: input.teamAId,
      teamB: input.teamBId,
      round: 1,
      leg: 1,
      status: 'SCHEDULED',
    }, input);
  },

  async resetFixtures(tournamentId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('reset_owned_cricket_fixtures', { p_tournament_id: tournamentId, p_knockout_only: false });
    if (error) throw error;
  },

  async resetKnockout(tournamentId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('reset_owned_cricket_fixtures', { p_tournament_id: tournamentId, p_knockout_only: true });
    if (error) throw error;
  },

  async getStandings(
    group: FixtureGroup,
    pointsRule?: PointsRule,
    tiebreakers?: Tiebreaker[],
  ): Promise<StandingRow[]> {
    const data = await readPages((start, end) => getSupabaseClient().from('fixture_matches')
      .select('id, stage_id, group_id, round_id, team_a_id, team_b_id, round, leg, weight, status, score_a, score_b')
      .eq('group_id', group.id).order('id').range(start, end));
    const canonicalByFixtureId = await getCanonicalMatches(data.map(match => match.id));
    return new StandingsCalculator().calculate(
      group,
      data.map(match => mapFixtureMatch(match, canonicalByFixtureId.get(match.id))),
      pointsRule,
      tiebreakers,
    );
  },

  async getBracket(stageId: string): Promise<KnockoutBracket | null> {
    const { data, error } = await getSupabaseClient().from('knockout_brackets')
      .select('id, stage_id, rounds, seeding_source, bracket_size, byes')
      .eq('stage_id', stageId).maybeSingle();
    if (error) throw error;
    return data ? {
      id: data.id,
      stageId: data.stage_id,
      rounds: data.rounds,
      seedingSource: data.seeding_source,
      bracketSize: data.bracket_size,
      byes: data.byes,
    } : null;
  },

  async resolveTie(stageId: string, groupId: string, orderedTeamIds: string[], userId: string) {
    const { error } = await getSupabaseClient().from('fixture_tie_resolutions').upsert({
      stage_id: stageId,
      group_id: groupId,
      ordered_team_ids: orderedTeamIds,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    }, { onConflict: 'stage_id,group_id' });
    if (error) throw error;
  },

  subscribeToTournament(tournamentId: string, onChange: () => void) {
    const client = getSupabaseClient();
    // Supabase channel() reuses an existing channel for the same topic. The
    // tournament overview and fixtures route can be mounted together, and
    // React Strict Mode also remounts effects in development. A unique topic
    // guarantees that all handlers are registered before this instance is
    // subscribed.
    const channel = client.channel(nextFixturesChannelTopic(tournamentId))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'fixture_stages',
        filter: `tournament_id=eq.${tournamentId}`,
      }, onChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'fixture_matches',
      }, onChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matches',
        filter: `tournament_id=eq.${tournamentId}`,
      }, onChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'knockout_brackets',
      }, onChange)
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  },
};

function distributeTeams(teamIds: string[], groupCount: number): string[][] {
  if (groupCount < 1 || groupCount > teamIds.length) throw new Error('Invalid group count');
  const groups = Array.from({ length: groupCount }, () => [] as string[]);
  teamIds.forEach((teamId, index) => groups[index % groupCount].push(teamId));
  return groups;
}

function roundsForQualifierCount(count: number): string[] {
  if (count === 2) return ['F'];
  if (count === 4) return ['SF', 'F'];
  if (count === 8) return ['QF', 'SF', 'F'];
  throw new Error('Knockout brackets support 2, 4, or 8 qualifiers');
}

function buildSixTeamCrossover(
  stageId: string,
  qualifiers: { teamId: string; sourceRef?: string }[],
): KnockoutBracket {
  if (qualifiers.length !== 6) throw new Error('Six crossover qualifiers are required');
  const roundId = `${stageId}:CROSSOVER`;
  const matches = Array.from({ length: 3 }, (_, index): FixtureMatch => ({
    id: `ko_${Math.random().toString(36).slice(2)}`,
    stageId,
    roundId,
    teamA: qualifiers[index * 2].teamId,
    teamB: qualifiers[index * 2 + 1].teamId,
    round: 1,
    leg: 1,
    status: 'SCHEDULED',
  }));
  return {
    id: `ko_${Math.random().toString(36).slice(2)}`,
    stageId,
    bracketSize: 6,
    byes: 0,
    seedingSource: 'SIX_TEAM_CROSSOVER',
    rounds: [
      { id: roundId, name: 'CROSSOVER', matches, slotMap: qualifiers.map((team, index) => ({ slot: index + 1, sourceRef: team.sourceRef ?? team.teamId })) },
      { id: `${stageId}:ELIMINATOR`, name: 'ELIMINATOR', matches: [], slotMap: [{ slot: 1, sourceRef: '2nd-best crossover winner' }, { slot: 2, sourceRef: '3rd-best crossover winner' }] },
      { id: `${stageId}:F`, name: 'F', matches: [], slotMap: [{ slot: 1, sourceRef: 'Best-NRR crossover winner' }, { slot: 2, sourceRef: 'Eliminator winner' }] },
    ],
  };
}

function buildFourTeamPlayoffs(
  stageId: string,
  qualifiers: { teamId: string; sourceRef?: string }[],
): KnockoutBracket {
  if (qualifiers.length !== 4) throw new Error('Four playoff qualifiers are required');
  const firstRoundId = `${stageId}:PLAYOFFS_1`;
  const firstRoundMatches: FixtureMatch[] = [
    { id: `ko_${Math.random().toString(36).slice(2)}`, stageId, roundId: firstRoundId, teamA: qualifiers[0].teamId, teamB: qualifiers[1].teamId, round: 1, leg: 1, status: 'SCHEDULED' },
    { id: `ko_${Math.random().toString(36).slice(2)}`, stageId, roundId: firstRoundId, teamA: qualifiers[2].teamId, teamB: qualifiers[3].teamId, round: 1, leg: 1, status: 'SCHEDULED' },
  ];
  return {
    id: `ko_${Math.random().toString(36).slice(2)}`,
    stageId,
    bracketSize: 4,
    byes: 0,
    seedingSource: 'MANUAL',
    rounds: [
      { id: firstRoundId, name: 'PLAYOFFS_1', matches: firstRoundMatches, slotMap: [{ slot: 1, sourceRef: '1st' }, { slot: 2, sourceRef: '2nd' }, { slot: 3, sourceRef: '3rd' }, { slot: 4, sourceRef: '4th' }] },
      { id: `${stageId}:QUALIFIER_2`, name: 'QUALIFIER_2', matches: [], slotMap: [{ slot: 1, sourceRef: 'Loser of Qualifier 1' }, { slot: 2, sourceRef: 'Winner of Eliminator' }] },
      { id: `${stageId}:F`, name: 'F', matches: [], slotMap: [{ slot: 1, sourceRef: 'Winner of Qualifier 1' }, { slot: 2, sourceRef: 'Winner of Qualifier 2' }] },
    ],
  };
}

function buildManualKnockout(
  stageId: string,
  qualifiers: { teamId: string; sourceRef?: string }[],
  roundNames: string[],
): KnockoutBracket {
  const firstRoundId = `${stageId}:${roundNames[0]}`;
  const rounds = roundNames.map((name, roundIndex) => ({
    id: `${stageId}:${name}`,
    name,
    matches: roundIndex === 0
      ? Array.from({ length: qualifiers.length / 2 }, (_, index): FixtureMatch => ({
          id: `ko_${Math.random().toString(36).slice(2)}`,
          stageId,
          roundId: firstRoundId,
          teamA: qualifiers[index * 2].teamId,
          teamB: qualifiers[index * 2 + 1].teamId,
          round: 1,
          leg: 1,
          status: 'SCHEDULED',
        }))
      : [],
    slotMap: Array.from({ length: qualifiers.length / 2 ** roundIndex }, (_, slot) => ({
      slot: slot + 1,
      sourceRef: roundIndex === 0
        ? qualifiers[slot].sourceRef ?? qualifiers[slot].teamId
        : `Winner of ${roundNames[roundIndex - 1]}${slot + 1}`,
    })),
  }));
  return {
    id: `ko_${Math.random().toString(36).slice(2)}`,
    stageId,
    rounds,
    seedingSource: 'MANUAL',
    bracketSize: qualifiers.length,
    byes: 0,
  };
}

function validateManualGroups(teamIds: string[], groups: string[][], groupCount: number): string[][] {
  if (groups.length !== groupCount) throw new Error('Assign teams to every group');
  const assigned = groups.flat();
  if (assigned.length !== teamIds.length || new Set(assigned).size !== teamIds.length) {
    throw new Error('Each team must be assigned to exactly one group');
  }
  if (assigned.some(teamId => !teamIds.includes(teamId))) {
    throw new Error('A group contains a team that is not in this tournament');
  }
  if (groups.some(group => group.length < 2)) {
    throw new Error('Each group needs at least two teams');
  }
  const sizes = groups.map(group => group.length);
  if (Math.max(...sizes) - Math.min(...sizes) > 1) {
    throw new Error('Groups must be balanced; group sizes can differ by at most one team');
  }
  return groups;
}

function toFixtureRow(match: FixtureMatch) {
  return {
    stage_id: match.stageId,
    group_id: match.groupId ?? null,
    round_id: match.roundId ?? null,
    team_a_id: match.teamA,
    team_b_id: match.teamB ?? null,
    round: match.round,
    leg: match.leg,
    weight: match.weight ?? null,
    status: match.status,
    score_a: match.scoreA ?? null,
    score_b: match.scoreB ?? null,
  };
}

interface FixturePlanPayload {
  teamIds: string[];
  stage: { id: string; stage_order: number; type: 'GROUP' | 'KNOCKOUT'; config: Record<string, unknown>; depends_on_stage_id?: string };
  groups: { id: string; stage_id: string; name: string; team_ids: string[] }[];
  matches: ReturnType<typeof toFixtureRow>[];
  bracket?: KnockoutBracket;
}
// Retain the same IDs/pairings when the server committed but its response was lost.
const pendingFixturePlans = new Map<string, FixturePlanPayload>();
async function commitFixturePlan(key: string, tournamentId: string, plan: FixturePlanPayload): Promise<void> {
  pendingFixturePlans.set(key, plan);
  const { error } = await getSupabaseClient().rpc('commit_owned_cricket_fixture_plan', { p_tournament_id: tournamentId, p_plan: plan });
  if (error) throw error;
  pendingFixturePlans.delete(key);
}

async function saveAdvancedRound(stageId: string, bracket: KnockoutBracket, matches: FixtureMatch[], config: Record<string, unknown> = {}) {
  const { error } = await getSupabaseClient().rpc('commit_owned_cricket_bracket', {
    p_stage_id: stageId, p_bracket: bracket, p_matches: matches.map(toFixtureRow), p_config: config,
  });
  if (error) throw error;
}

async function saveFixtureMatches(stageId: string, matches: FixtureMatch[]): Promise<void> {
  const { error } = await getSupabaseClient().rpc('upsert_owned_fixture_matches', {
    p_stage_id: stageId,
    p_matches: matches.map(toFixtureRow),
  });
  if (error) throw error;
}

function teamNrr(teamId: string, matches: FixtureMatch[]): number {
  let runsFor = 0; let ballsFor = 0; let runsAgainst = 0; let ballsAgainst = 0;
  for (const match of matches) {
    const opponentId = match.teamA === teamId ? match.teamB : match.teamB === teamId ? match.teamA : undefined;
    if (!opponentId || ['NO_RESULT', 'WALKOVER', 'CANCELLED'].includes(String(match.result?.kind ?? ''))) continue;
    const own = match.teamInningsStats?.[teamId];
    const opponent = match.teamInningsStats?.[opponentId];
    if (!own || !opponent) continue;
    runsFor += own.runs; ballsFor += own.legalBalls;
    runsAgainst += opponent.runs; ballsAgainst += opponent.legalBalls;
  }
  return (ballsFor ? runsFor / (ballsFor / 6) : 0) - (ballsAgainst ? runsAgainst / (ballsAgainst / 6) : 0);
}

function mapFixtureMatch(
  row: any,
  canonical?: {
    id: string;
    status: string;
    scheduledAt?: string;
    venue?: string;
    result?: Record<string, unknown>;
    liveScore?: { runs: number; wickets: number; legalBalls: number; battingTeamId?: string; target?: number };
    scoreA?: number;
    scoreB?: number;
    teamInningsStats?: Record<string, { runs: number; wickets: number; legalBalls: number }>;
  },
): FixtureMatch {
  return {
    id: row.id,
    canonicalMatchId: canonical?.id,
    stageId: row.stage_id,
    groupId: row.group_id ?? undefined,
    roundId: row.round_id ?? undefined,
    teamA: row.team_a_id,
    teamB: row.team_b_id ?? undefined,
    round: row.round,
    leg: row.leg,
    weight: row.weight ?? undefined,
    status: canonical ? mapCanonicalStatus(canonical.status) : row.status,
    scoreA: canonical?.scoreA ?? row.score_a ?? undefined,
    scoreB: canonical?.scoreB ?? row.score_b ?? undefined,
    scheduledAt: canonical?.scheduledAt,
    venue: canonical?.venue,
    result: canonical?.result,
    liveScore: canonical?.liveScore,
    teamInningsStats: canonical?.teamInningsStats,
  };
}

async function getCanonicalMatches(
  fixtureIds: string[],
): Promise<Map<string, {
  id: string;
  status: string;
  scheduledAt?: string;
  venue?: string;
  result?: Record<string, unknown>;
  liveScore?: { runs: number; wickets: number; legalBalls: number; battingTeamId?: string; target?: number };
  scoreA?: number;
  scoreB?: number;
  teamInningsStats?: Record<string, { runs: number; wickets: number; legalBalls: number }>;
}>> {
  if (fixtureIds.length === 0) return new Map();
  if (fixtureIds.length > 100) {
    const chunks = [];
    for (let start = 0; start < fixtureIds.length; start += 100) {
      chunks.push(...await getCanonicalMatches(fixtureIds.slice(start, start + 100)));
    }
    return new Map(chunks);
  }
  const client = getSupabaseClient();
  const { data, error } = await client.from('matches')
    .select('id, fixture_match_id, status, scheduled_at, venue, result, team_a_id, team_b_id')
    .in('fixture_match_id', fixtureIds);
  if (error) throw error;
  if (data.length === 0) return new Map();
  const [{ data: snapshots, error: snapshotError }, { data: innings, error: inningsError }] =
    await Promise.all([
      client.from('match_snapshots').select('match_id, scoreboard')
        .in('match_id', data.map(match => match.id)),
      client.from('match_innings').select('match_id, sequence, batting_team_id, target, status, total_runs, total_wickets, total_balls')
        .in('match_id', data.map(match => match.id)),
    ]);
  if (snapshotError) throw snapshotError;
  if (inningsError) throw inningsError;
  const scoreByMatchId = new Map((snapshots ?? []).map(snapshot => {
    const score = snapshot.scoreboard ?? {};
    return [snapshot.match_id, {
      runs: Number(score.total_runs ?? 0),
      wickets: Number(score.total_wickets ?? 0),
      legalBalls: Number(score.legal_balls ?? 0),
    }];
  }));
  const currentInningsByMatch = new Map<string, { battingTeamId: string; target?: number }>();
  for (const item of innings ?? []) {
    if (item.status === 'IN_PROGRESS') currentInningsByMatch.set(item.match_id, {
      battingTeamId: item.batting_team_id,
      target: item.target ?? undefined,
    });
  }
  const totalsByMatchAndTeam = new Map<string, number>();
  const wicketsByMatchAndTeam = new Map<string, number>();
  const ballsByMatchAndTeam = new Map<string, number>();
  for (const item of innings ?? []) {
    const key = `${item.match_id}:${item.batting_team_id}`;
    totalsByMatchAndTeam.set(key, (totalsByMatchAndTeam.get(key) ?? 0) + Number(item.total_runs ?? 0));
    wicketsByMatchAndTeam.set(key, (wicketsByMatchAndTeam.get(key) ?? 0) + Number(item.total_wickets ?? 0));
    ballsByMatchAndTeam.set(key, (ballsByMatchAndTeam.get(key) ?? 0) + Number(item.total_balls ?? 0));
  }
  return new Map(data.map(match => {
    const teamARuns = totalsByMatchAndTeam.get(`${match.id}:${match.team_a_id}`) ?? 0;
    const teamBRuns = totalsByMatchAndTeam.get(`${match.id}:${match.team_b_id}`) ?? 0;
    // A super-over result can have level regulation totals. Fixture standings
    // still need a deterministic winner, so use a minimal synthetic edge.
    const winner = match.result?.winnerTeamId;
    const scoreA = teamARuns === teamBRuns && winner
      ? teamARuns + Number(winner === match.team_a_id)
      : teamARuns;
    const scoreB = teamARuns === teamBRuns && winner
      ? teamBRuns + Number(winner === match.team_b_id)
      : teamBRuns;
    return [match.fixture_match_id, {
      id: match.id,
      status: match.status,
      scheduledAt: match.scheduled_at ?? undefined,
      venue: match.venue ?? undefined,
      result: match.result ?? undefined,
      liveScore: scoreByMatchId.has(match.id) ? {
        ...scoreByMatchId.get(match.id)!,
        ...currentInningsByMatch.get(match.id),
      } : undefined,
      scoreA: match.status === 'COMPLETED' ? scoreA : undefined,
      scoreB: match.status === 'COMPLETED' ? scoreB : undefined,
      teamInningsStats: match.status === 'COMPLETED' ? {
        [match.team_a_id]: {
          runs: teamARuns,
          wickets: wicketsByMatchAndTeam.get(`${match.id}:${match.team_a_id}`) ?? 0,
          legalBalls: ballsByMatchAndTeam.get(`${match.id}:${match.team_a_id}`) ?? 0,
        },
        [match.team_b_id]: {
          runs: teamBRuns,
          wickets: wicketsByMatchAndTeam.get(`${match.id}:${match.team_b_id}`) ?? 0,
          legalBalls: ballsByMatchAndTeam.get(`${match.id}:${match.team_b_id}`) ?? 0,
        },
      } : undefined,
    }] as const;
  }));
}

function mapCanonicalStatus(status: string): FixtureMatch['status'] {
  if (['IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION'].includes(status)) return 'LIVE';
  if (['COMPLETED', 'ABANDONED'].includes(status)) return 'COMPLETED';
  return 'SCHEDULED';
}
