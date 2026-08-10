import { describe, expect, it } from 'vitest';

import {
  CustomFormatBuilder,
  FormatRecommender,
  KnockoutBracketBuilder,
  PairingStrategyRegistry,
  RoundRobinStrategy,
  StageTransitionEngine,
  StandingsCalculator,
  WeightedRoundRobinStrategy,
} from './index';
import type { CustomFormat, FixtureGroup, FixtureMatch } from './types';
import type { FixtureStage, FixtureStore } from './transition';

const group = (teams: string[]): FixtureGroup => ({
  id: 'g1', stageId: 's1', name: 'Group A', teamIds: teams,
});

describe('FormatRecommender', () => {
  const recommender = new FormatRecommender();
  it.each([
    [2, 'KNOCKOUT_ONLY'],
    [6, 'GROUPS_ONLY'],
    [16, 'GROUPS_THEN_KNOCKOUT'],
    [33, 'GROUPS_THEN_KNOCKOUT'],
  ] as const)('recommends a usable format for %i teams', (count, type) => {
    const result = recommender.recommend(count);
    expect(result.formatType).toBe(type);
    expect(result.teamsPerGroup.reduce((sum, size) => sum + size, 0)).toBe(type === 'KNOCKOUT_ONLY' ? 0 : count);
    expect(result.rationale.length).toBeGreaterThan(20);
    expect(result.alternatives.length).toBeGreaterThan(0);
  });
});

describe('pairing strategies', () => {
  it('rotates a bye without repeating an opponent for an odd group', () => {
    let id = 0;
    const matches = new RoundRobinStrategy().generate(group(['a', 'b', 'c', 'd', 'e']), { idFactory: () => String(++id) });
    expect(matches).toHaveLength(10);
    expect(new Set(matches.map(match => [match.teamA, match.teamB].sort().join('|'))).size).toBe(10);
    expect(new Set(matches.map(match => match.round)).size).toBe(5);
  });

  it('assigns weights from seed difference', () => {
    const seeded: FixtureGroup = {
      ...group(['a', 'b', 'c', 'd']),
      seedByTeamId: { a: 1, b: 2, c: 3, d: 4 },
    };
    const matches = new WeightedRoundRobinStrategy().generate(seeded);
    expect(matches.every(match => match.weight === Math.abs(seeded.seedByTeamId![match.teamA] - seeded.seedByTeamId![match.teamB!]) + 1)).toBe(true);
  });

  it('supports registry extension without changing callers', () => {
    const registry = new PairingStrategyRegistry().register('CUSTOM', new RoundRobinStrategy());
    expect(registry.get('CUSTOM')).toBeInstanceOf(RoundRobinStrategy);
  });
});

describe('StandingsCalculator', () => {
  it('resolves tied points through goal difference and records a trace', () => {
    const matches = [
      result('a', 'b', 1, 1), result('a', 'c', 3, 0), result('b', 'c', 1, 0),
    ];
    const rows = new StandingsCalculator().calculate(group(['a', 'b', 'c']), matches);
    expect(rows[0].teamId).toBe('a');
    expect(rows[0].tiebreakerTrace.some(trace => trace.startsWith('GOAL_DIFF'))).toBe(true);
  });

  it('flags an exact tie for manual resolution', () => {
    const rows = new StandingsCalculator().calculate(group(['a', 'b']), [result('a', 'b', 1, 1)]);
    expect(rows.every(row => row.unresolved)).toBe(true);
    expect(rows[0].tiebreakerTrace.at(-1)).toContain('UNRESOLVED');
  });

  it('does not count a cancelled fixture as played or award points', () => {
    const cancelled: FixtureMatch = {
      ...result('a', 'b', 0, 0),
      result: { kind: 'CANCELLED' },
    };
    const rows = new StandingsCalculator().calculate(group(['a', 'b']), [cancelled]);

    expect(rows.every(row => row.played === 0 && row.points === 0)).toBe(true);
  });
});

describe('CustomFormatBuilder', () => {
  it('rejects bad ordering and qualifier/bracket mismatch', () => {
    const format: CustomFormat = {
      id: 'f', name: 'Broken', ownerId: 'u', isReusableTemplate: true,
      stages: [
        { type: 'GROUP', order: 2, groupCount: 2, groupSizes: [3, 3], pairingAlgorithm: 'ROUND_ROBIN', advancePerGroup: 2 },
        { type: 'KNOCKOUT', order: 2, dependsOnStageOrder: 2, knockoutRounds: ['F'], seeding: 'TOP_VS_BOTTOM' },
      ],
    };
    const result = new CustomFormatBuilder().validate(format, 6);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/ordering|dependency|requires/);
  });
});

describe('KnockoutBracketBuilder', () => {
  it('infers bracket size and assigns byes for non-power-of-two qualifiers', () => {
    const bracket = new KnockoutBracketBuilder().build(
      'ko',
      ['a', 'b', 'c', 'd', 'e', 'f'].map(teamId => ({ teamId })),
      { rounds: ['QF', 'SF', 'F'], seeding: 'TOP_VS_BOTTOM' },
    );
    expect(bracket.bracketSize).toBe(8);
    expect(bracket.byes).toBe(2);
    expect(bracket.rounds[0].matches.filter(match => !match.teamB)).toHaveLength(2);
  });

  it('explains a missing organiser-selected round', () => {
    expect(() => new KnockoutBracketBuilder().build(
      'ko',
      Array.from({ length: 8 }, (_, index) => ({ teamId: String(index) })),
      { rounds: ['SF', 'F'], seeding: 'TOP_VS_BOTTOM' },
    )).toThrow('Quarterfinals');
  });
});

describe('StageTransitionEngine', () => {
  it('creates knockout Round 1 when the final group match completes', async () => {
    const groupStage: FixtureStage = {
      id: 'groups', tournamentId: 't1', order: 1, type: 'GROUP', status: 'IN_PROGRESS',
      config: { advancePerGroup: 1 },
    };
    const knockoutStage: FixtureStage = {
      id: 'knockout', tournamentId: 't1', order: 2, type: 'KNOCKOUT', status: 'PENDING',
      dependsOnStageId: 'groups',
      config: { knockout: { rounds: ['F'], seeding: 'TOP_VS_BOTTOM' } },
    };
    const groups = [
      { id: 'a', stageId: 'groups', name: 'Group A', teamIds: ['a1', 'a2'] },
      { id: 'b', stageId: 'groups', name: 'Group B', teamIds: ['b1', 'b2'] },
    ];
    const matches = [
      { ...result('a1', 'a2', 2, 0), id: 'm1', stageId: 'groups', groupId: 'a' },
      { ...result('b1', 'b2', 1, 0), id: 'm2', stageId: 'groups', groupId: 'b' },
    ];
    const created: FixtureMatch[] = [];
    let bracketSaved = false;
    const store: FixtureStore = {
      async getStage(id) { return id === 'groups' ? groupStage : knockoutStage; },
      async getNextStage() { return knockoutStage; },
      async listGroups() { return groups; },
      async listStageMatches(stageId) { return stageId === 'groups' ? matches : created; },
      async saveMatches(next) { created.push(...next); },
      async setStageStatus(id, status) { (id === 'groups' ? groupStage : knockoutStage).status = status; },
      async saveBracket() { bracketSaved = true; },
      async getBracket() { return undefined; },
      async saveUnresolvedTie() {},
      async listManualTieResolutions() { return {}; },
      async completeTournament() {},
    };

    await new StageTransitionEngine(store).onMatchFinished({ type: 'MATCH_COMPLETED', matchId: 'm2', stageId: 'groups' });

    expect(groupStage.status).toBe('COMPLETED');
    expect(knockoutStage.status).toBe('IN_PROGRESS');
    expect(bracketSaved).toBe(true);
    expect(created).toHaveLength(1);
    expect(new Set([created[0].teamA, created[0].teamB])).toEqual(new Set(['a1', 'b1']));
  });
});

function result(teamA: string, teamB: string, scoreA: number, scoreB: number): FixtureMatch {
  return {
    id: `${teamA}-${teamB}`, stageId: 's1', groupId: 'g1', teamA, teamB,
    round: 1, leg: 1, status: 'COMPLETED', scoreA, scoreB,
  };
}
