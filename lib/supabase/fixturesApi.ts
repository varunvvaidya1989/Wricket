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
    if (input.recommendation.formatType === 'GROUPS_THEN_KNOCKOUT') {
      await this.addStage(input.tournamentId, {
        order: 2,
        type: 'KNOCKOUT',
        dependsOnStageId: groupStage.id,
        config: {
          knockout: {
            rounds: input.recommendation.knockoutRounds,
            seeding: 'GROUP_WINNERS_PROTECTED',
            crossGroupPairingAvoidance: true,
          },
        },
      });
    }
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

    if (groupStage && knockoutStage && !setup.bracket) {
      const groupMatches = setup.matches.filter(match => match.stageId === groupStage.id);
      const complete = groupMatches.length > 0 && groupMatches.every(match =>
        match.status === 'COMPLETED' || match.status === 'WALKOVER');
      if (complete) {
        const qualifiers: { teamId: string; groupId: string; sourceRef: string }[] = [];
        let unresolved = false;
        for (const groupRow of setup.groups.filter(group => group.stage_id === groupStage.id)) {
          const group: FixtureGroup = {
            id: groupRow.id,
            stageId: groupRow.stage_id,
            name: groupRow.name,
            teamIds: groupRow.team_ids,
          };
          const standings = new StandingsCalculator().calculate(
            group,
            groupMatches,
            groupStage.config?.pointsRule,
            groupStage.config?.tiebreakers,
          );
          const count = Number(groupStage.config?.advancePerGroup ?? 1);
          const selected = standings.slice(0, count);
          if (selected.some(row => row.unresolved)) {
            unresolved = true;
            break;
          }
          qualifiers.push(...selected.map(row => ({
            teamId: row.teamId,
            groupId: group.id,
            sourceRef: `${group.name} #${row.rank}`,
          })));
        }
        if (!unresolved && qualifiers.length >= 2) {
          const bracket = new KnockoutBracketBuilder().build(
            knockoutStage.id,
            qualifiers,
            knockoutStage.config.knockout,
          );
          await saveBracketAndMatches(bracket);
          const { error: groupError } = await client.from('fixture_stages')
            .update({ status: 'COMPLETED' }).eq('id', groupStage.id);
          if (groupError) throw groupError;
          const { error: knockoutError } = await client.from('fixture_stages')
            .update({ status: 'IN_PROGRESS' }).eq('id', knockoutStage.id);
          if (knockoutError) throw knockoutError;
          changed = true;
        }
      }
    }

    const refreshed = changed ? await this.getFixtureSetup(tournamentId) : setup;
    const bracket = refreshed.bracket;
    if (!knockoutStage || !bracket) return changed;
    // The bracket JSON is a durable template. Canonical fixture rows are the
    // authoritative status/result source and are projected into it here.
    const knockoutMatches = refreshed.matches.filter(match => match.stageId === knockoutStage.id);
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
    const { error } = await getSupabaseClient().from('fixture_stages')
      .delete().eq('tournament_id', tournamentId);
    if (error) throw error;
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
  const { error: bracketError } = await client.from('knockout_brackets').insert({
    stage_id: bracket.stageId,
    rounds: bracket.rounds,
    seeding_source: bracket.seedingSource,
    bracket_size: bracket.bracketSize,
    byes: bracket.byes,
  });
  if (bracketError) throw bracketError;
  const { error: matchError } = await client.from('fixture_matches')
    .insert(bracket.rounds[0].matches.map(toFixtureRow));
  if (matchError) throw matchError;
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
