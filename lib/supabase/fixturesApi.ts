import { getSupabaseClient } from './client';
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

export type KnockoutPreset = 'FINAL_2' | 'SF_4' | 'QF_8' | 'PLAYOFFS_4' | 'SIX_TEAM_CROSSOVER' | 'CUSTOM';

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
    const client = getSupabaseClient();
    if (input.teamIds.length < 2) throw new Error('At least two cloud-synced teams are required');
    const { count, error: countError } = await client.from('fixture_stages')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', input.tournamentId);
    if (countError) throw countError;
    if (count) throw new Error('Fixtures have already been generated for this tournament');

    if (input.recommendation.formatType === 'KNOCKOUT_ONLY') {
      const stage = await this.addStage(input.tournamentId, {
        order: 1,
        type: 'KNOCKOUT',
        config: {
          knockout: {
            rounds: input.recommendation.knockoutRounds,
            seeding: 'TOP_VS_BOTTOM',
          },
        },
      });
      const bracket = new KnockoutBracketBuilder().build(
        stage.id,
        input.teamIds.map(teamId => ({ teamId })),
        { rounds: input.recommendation.knockoutRounds, seeding: 'TOP_VS_BOTTOM' },
      );
      await saveBracketAndMatches(bracket);
      await client.from('fixture_stages').update({ status: 'IN_PROGRESS' }).eq('id', stage.id);
      return;
    }

    const groupStage = await this.addStage(input.tournamentId, {
      order: 1,
      type: 'GROUP',
      config: {
        pairingAlgorithm: input.pairingAlgorithm,
        advancePerGroup: input.advancePerGroup,
        knockoutPlanned: input.recommendation.formatType === 'GROUPS_THEN_KNOCKOUT',
        pointsRule: { win: 3, draw: 1, loss: 0 },
        tiebreakers: ['HEAD_TO_HEAD', 'GOAL_DIFF', 'GOALS_FOR'],
      },
    });
    const teamBuckets = input.groupTeamIds
      ? validateManualGroups(input.teamIds, input.groupTeamIds, input.numberOfGroups)
      : distributeTeams(input.teamIds, input.numberOfGroups);
    for (let index = 0; index < teamBuckets.length; index += 1) {
      const { data: savedGroup, error: groupError } = await client.from('fixture_groups').insert({
        stage_id: groupStage.id,
        name: `Group ${String.fromCharCode(65 + index)}`,
        team_ids: teamBuckets[index],
      }).select('id, stage_id, name, team_ids').single();
      if (groupError) throw groupError;
      const fixtures = pairingStrategies.get(input.pairingAlgorithm).generate({
        id: savedGroup.id,
        stageId: groupStage.id,
        name: savedGroup.name,
        teamIds: savedGroup.team_ids,
      });
      const { error: matchError } = await client.from('fixture_matches').insert(fixtures.map(toFixtureRow));
      if (matchError) throw matchError;
    }
    await client.from('fixture_stages').update({ status: 'IN_PROGRESS' }).eq('id', groupStage.id);
  },

  async generateKnockout(input: {
    tournamentId: string;
    preset: KnockoutPreset;
    qualifierTeamIds?: string[];
  }): Promise<void> {
    const client = getSupabaseClient();
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
    if (input.preset === 'PLAYOFFS_4' && (standings.length !== 1 || standings[0].rows.length < 4)) {
      throw new Error('Four-team playoffs require one group with at least four teams');
    }
    let qualifiers: { teamId: string; groupId?: string; sourceRef?: string }[];
    if (input.preset === 'SIX_TEAM_CROSSOVER') {
      if (standings.length !== 2 || standings.some(item => item.rows.length < 3)) {
        throw new Error('Six-team crossover requires exactly two groups with at least three teams each');
      }
      qualifiers = [
        { ...standingQualifier(standings[0], 0), sourceRef: 'A1' },
        { ...standingQualifier(standings[1], 2), sourceRef: 'B3' },
        { ...standingQualifier(standings[0], 1), sourceRef: 'A2' },
        { ...standingQualifier(standings[1], 1), sourceRef: 'B2' },
        { ...standingQualifier(standings[0], 2), sourceRef: 'A3' },
        { ...standingQualifier(standings[1], 0), sourceRef: 'B1' },
      ];
    } else {
      const required = input.preset === 'FINAL_2' ? 2 : input.preset === 'SF_4' || input.preset === 'PLAYOFFS_4' ? 4 : input.preset === 'QF_8' ? 8 : input.qualifierTeamIds?.length ?? 0;
      if (![2, 4, 8].includes(required)) throw new Error('Custom knockout currently supports 2, 4, or 8 teams');
      const ranked = standings.flatMap(item => item.rows.map(row => ({ row, group: item.group })))
        .sort((a, b) => a.row.rank - b.row.rank || b.row.points - a.row.points || b.row.goalDifference - a.row.goalDifference);
      const ids = input.qualifierTeamIds ?? (input.preset === 'PLAYOFFS_4'
        ? ranked.slice(0, 4).map(item => item.row.teamId)
        : (
        standings.length === 2 && standings.every(item => item.rows.length >= required / 2)
          ? crossGroupPairOrder(standings.map(item => item.rows), required / 2)
          : topVsBottomPairOrder(ranked.slice(0, required).map(item => item.row.teamId))
        ));
      if (ids.length !== required || new Set(ids).size !== required) throw new Error(`Select exactly ${required} unique qualifiers`);
      qualifiers = ids.map(teamId => ({ teamId, sourceRef: 'Owner selected qualifier' }));
    }
    const stage = existingKnockoutStage ?? await this.addStage(input.tournamentId, {
      order: 2,
      type: 'KNOCKOUT',
      dependsOnStageId: groupStage.id,
      config: { preset: input.preset },
    });
    if (existingKnockoutStage) {
      const { error } = await client.from('fixture_stages').update({
        depends_on_stage_id: groupStage.id,
        config: { ...existingKnockoutStage.config, preset: input.preset },
      }).eq('id', existingKnockoutStage.id);
      if (error) throw error;
      stage.config = { ...existingKnockoutStage.config, preset: input.preset };
    }
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
    await saveBracketAndMatches(bracket);
    await client.from('fixture_stages').update({ status: 'COMPLETED' }).eq('id', groupStage.id);
    await client.from('fixture_stages').update({ status: 'IN_PROGRESS' }).eq('id', stage.id);
  },

  async getFixtureSetup(tournamentId: string): Promise<GeneratedFixtureSetup> {
    const client = getSupabaseClient();
    const { data: stages, error: stageError } = await client.from('fixture_stages')
      .select('*').eq('tournament_id', tournamentId).order('stage_order');
    if (stageError) throw stageError;
    if (!stages.length) return { stages: [], groups: [], matches: [], bracket: null };
    const stageIds = stages.map(stage => stage.id);
    const [{ data: groups, error: groupError }, { data: matches, error: matchError }] = await Promise.all([
      client.from('fixture_groups').select('*').in('stage_id', stageIds).order('name'),
      client.from('fixture_matches')
        .select('id, stage_id, group_id, round_id, team_a_id, team_b_id, round, leg, weight, status, score_a, score_b')
        .in('stage_id', stageIds).order('round'),
    ]);
    if (groupError) throw groupError;
    if (matchError) throw matchError;
    const canonicalByFixtureId = await getCanonicalMatches(matches.map(match => match.id));
    const knockout = stages.find(stage => stage.type === 'KNOCKOUT');
    const mappedMatches = matches.map(match => mapFixtureMatch(match, canonicalByFixtureId.get(match.id)));
    const bracket = knockout ? await this.getBracket(knockout.id) : null;
    if (bracket) {
      for (const round of bracket.rounds) {
        const current = mappedMatches.filter(match => match.roundId === round.id);
        if (current.length) round.matches = current;
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
    if (!knockoutStage || !bracket) return changed;
    // The bracket JSON is a durable template. Canonical fixture rows are the
    // authoritative status/result source and are projected into it here.
    const knockoutMatches = refreshed.matches.filter(match => match.stageId === knockoutStage.id);
    const firstRound = bracket.rounds[0];
    if (firstRound?.matches.length && !knockoutMatches.some(match => match.roundId === firstRound.id)) {
      const { error } = await client.from('fixture_matches').upsert(firstRound.matches.map(toFixtureRow), {
        onConflict: 'stage_id,round_id,team_a_id,team_b_id,leg',
        ignoreDuplicates: true,
      });
      if (error) throw error;
      await client.from('fixture_stages').update({ status: 'IN_PROGRESS' }).eq('id', knockoutStage.id);
      return true;
    }
    for (const round of bracket.rounds) {
      const saved = knockoutMatches.filter(match => match.roundId === round.id);
      if (saved.length) round.matches = saved;
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
        await saveAdvancedRound(knockoutStage.id, bracket, next.matches);
        const { error } = await client.from('fixture_stages').update({
          config: { ...knockoutStage.config, directFinalistTeamId },
        }).eq('id', knockoutStage.id);
        if (error) throw error;
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
        await saveAdvancedRound(knockoutStage.id, bracket, next.matches);
        const { error } = await client.from('fixture_stages').update({
          config: { ...knockoutStage.config, directFinalistTeamId: fixtureWinner(qualifierOne) },
        }).eq('id', knockoutStage.id);
        if (error) throw error;
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
        const { error: matchError } = await client.from('fixture_matches')
          .upsert(nextMatches.map(toFixtureRow), {
            onConflict: 'stage_id,round_id,team_a_id,team_b_id,leg',
            ignoreDuplicates: true,
          });
        if (matchError) throw matchError;
        const { error: bracketError } = await client.from('knockout_brackets')
          .update({ rounds: bracket.rounds, updated_at: new Date().toISOString() })
          .eq('stage_id', knockoutStage.id);
        if (bracketError) throw bracketError;
        return true;
      }
    }
    if (!next) {
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
    const { error } = await getSupabaseClient().from('fixture_matches').delete().eq('id', matchId);
    if (error) throw error;
  },

  async updateMatch(match: FixtureMatch, input: {
    teamAId: string;
    teamBId?: string;
    scheduledAt?: string;
    venue?: string;
  }): Promise<void> {
    const client = getSupabaseClient();
    const { error: fixtureError } = await client.from('fixture_matches').update({
      team_a_id: input.teamAId,
      team_b_id: input.teamBId ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', match.id);
    if (fixtureError) throw fixtureError;
    if (match.canonicalMatchId) {
      const { error: matchError } = await client.from('matches').update({
        team_a_id: input.teamAId,
        team_b_id: input.teamBId ?? null,
        scheduled_at: input.scheduledAt ?? null,
        venue: input.venue?.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', match.canonicalMatchId);
      if (matchError) throw matchError;
    }
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
    const { data: stages, error: stageError } = await getSupabaseClient().from('fixture_stages')
      .select('id').eq('tournament_id', tournamentId);
    if (stageError) throw stageError;
    if (!stages.length) return;
    const { data: fixtureRows, error: fixtureError } = await getSupabaseClient().from('fixture_matches')
      .select('id').in('stage_id', stages.map(stage => stage.id));
    if (fixtureError) throw fixtureError;
    if (fixtureRows.length) {
      const { count, error: matchError } = await getSupabaseClient().from('matches')
        .select('*', { count: 'exact', head: true })
        .in('fixture_match_id', fixtureRows.map(fixture => fixture.id))
        .in('status', ['IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION', 'COMPLETED', 'ABANDONED']);
      if (matchError) throw matchError;
      if (count) throw new Error('Fixtures cannot be reset after a match has started or been completed.');
    }
    const { error, count: deleted } = await getSupabaseClient().from('fixture_stages')
      .delete({ count: 'exact' }).eq('tournament_id', tournamentId);
    if (error) throw error;
    if (!deleted) throw new Error('Fixture reset was not permitted. Only the tournament owner can reset fixtures.');
  },

  async resetKnockout(tournamentId: string): Promise<void> {
    const client = getSupabaseClient();
    const { data: stage, error: stageError } = await client.from('fixture_stages')
      .select('id, depends_on_stage_id')
      .eq('tournament_id', tournamentId)
      .eq('type', 'KNOCKOUT')
      .maybeSingle();
    if (stageError) throw stageError;
    if (!stage) return;
    const { data: fixtures, error: fixtureError } = await client.from('fixture_matches')
      .select('id').eq('stage_id', stage.id);
    if (fixtureError) throw fixtureError;
    if (fixtures.length) {
      const { count, error: matchError } = await client.from('matches')
        .select('*', { count: 'exact', head: true })
        .in('fixture_match_id', fixtures.map(fixture => fixture.id))
        .in('status', ['IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION', 'COMPLETED', 'ABANDONED']);
      if (matchError) throw matchError;
      if (count) throw new Error('The knockout stage cannot be reset after a knockout match has started.');
    }
    const { error: deleteError, count: deleted } = await client.from('fixture_stages')
      .delete({ count: 'exact' }).eq('id', stage.id);
    if (deleteError) throw deleteError;
    if (!deleted) throw new Error('Knockout reset was not permitted. Only the tournament owner can reset fixtures.');
    if (stage.depends_on_stage_id) {
      const { error: groupError } = await client.from('fixture_stages')
        .update({ status: 'COMPLETED' }).eq('id', stage.depends_on_stage_id);
      if (groupError) throw groupError;
    }
  },

  async getStandings(
    group: FixtureGroup,
    pointsRule?: PointsRule,
    tiebreakers?: Tiebreaker[],
  ): Promise<StandingRow[]> {
    const { data, error } = await getSupabaseClient().from('fixture_matches')
      .select('id, stage_id, group_id, round_id, team_a_id, team_b_id, round, leg, weight, status, score_a, score_b')
      .eq('group_id', group.id);
    if (error) throw error;
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

function standingQualifier(
  item: { group: any; rows: StandingRow[] },
  index: number,
): { teamId: string; groupId: string } {
  const row = item.rows[index];
  if (!row || row.unresolved) throw new Error(`Resolve the qualification tie in ${item.group.name} first`);
  return { teamId: row.teamId, groupId: item.group.id };
}

function roundsForQualifierCount(count: number): string[] {
  if (count === 2) return ['F'];
  if (count === 4) return ['SF', 'F'];
  if (count === 8) return ['QF', 'SF', 'F'];
  throw new Error('Knockout brackets support 2, 4, or 8 qualifiers');
}

function topVsBottomPairOrder(teamIds: string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < teamIds.length / 2; index += 1) {
    result.push(teamIds[index], teamIds[teamIds.length - 1 - index]);
  }
  return result;
}

function crossGroupPairOrder(groupRows: StandingRow[][], qualifiersPerGroup: number): string[] {
  const [a, b] = groupRows;
  const result: string[] = [];
  for (let index = 0; index < Math.ceil(qualifiersPerGroup / 2); index += 1) {
    result.push(a[index].teamId, b[qualifiersPerGroup - 1 - index].teamId);
    if (index !== qualifiersPerGroup - 1 - index) {
      result.push(b[index].teamId, a[qualifiersPerGroup - 1 - index].teamId);
    }
  }
  return result;
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
        : `Winner of ${roundNames[roundIndex - 1]}${Math.floor(slot / 2) + 1}`,
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

async function saveBracketAndMatches(bracket: KnockoutBracket) {
  const client = getSupabaseClient();
  const { error: bracketError } = await client.from('knockout_brackets').upsert({
    stage_id: bracket.stageId,
    rounds: bracket.rounds,
    seeding_source: bracket.seedingSource,
    bracket_size: bracket.bracketSize,
    byes: bracket.byes,
  }, { onConflict: 'stage_id', ignoreDuplicates: true });
  if (bracketError) throw bracketError;
  const { error: matchError } = await client.from('fixture_matches')
    .upsert(bracket.rounds[0].matches.map(toFixtureRow), {
      onConflict: 'stage_id,round_id,team_a_id,team_b_id,leg',
      ignoreDuplicates: true,
    });
  if (matchError) throw matchError;
}

async function saveAdvancedRound(stageId: string, bracket: KnockoutBracket, matches: FixtureMatch[]) {
  const client = getSupabaseClient();
  const { error: matchError } = await client.from('fixture_matches').insert(matches.map(toFixtureRow));
  if (matchError) throw matchError;
  const { error: bracketError } = await client.from('knockout_brackets')
    .update({ rounds: bracket.rounds, updated_at: new Date().toISOString() })
    .eq('stage_id', stageId);
  if (bracketError) throw bracketError;
}

function fixtureWinner(match: FixtureMatch): string {
  const resultWinner = match.result?.winnerTeamId ?? match.result?.winner_team_id;
  if (typeof resultWinner === 'string') return resultWinner;
  if (!match.teamB || match.status === 'WALKOVER') return match.teamA;
  if (match.scoreA == null || match.scoreB == null || match.scoreA === match.scoreB) {
    throw new Error('Every crossover match needs a winner before advancing');
  }
  return match.scoreA > match.scoreB ? match.teamA : match.teamB;
}

function fixtureLoser(match: FixtureMatch): string {
  const winner = fixtureWinner(match);
  if (!match.teamB) throw new Error('A walkover match has no playoff loser');
  return winner === match.teamA ? match.teamB : match.teamA;
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
