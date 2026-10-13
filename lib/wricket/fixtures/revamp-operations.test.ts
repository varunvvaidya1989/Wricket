import { describe, expect, it } from 'vitest';
import { manualFixtureError } from './manual-fixture';
import { reorderQualifier, seedQualifiers, type RankedGroup } from './qualifier-seeding';
import { fixtureWinner, fixtureLoser } from './result';
import { KnockoutBracketBuilder } from './bracket';
import type { FixtureMatch, StandingRow } from './types';

const fixture = (partial: Partial<FixtureMatch> = {}): FixtureMatch => ({ id: 'm', stageId: 's', teamA: 'a', teamB: 'b', round: 1, leg: 1, status: 'SCHEDULED', ...partial });
const group = (id: string, count: number): RankedGroup => ({ id, name: `Group ${id}`, rows: Array.from({ length: count }, (_, index): StandingRow => ({ teamId: `${id}${index + 1}`, rank: index + 1, points: count - index, goalDifference: count - index, played: 3, won: 1, drawn: 0, noResult: 0, lost: 0, goalsFor: 10, goalsAgainst: 0, unresolved: false, tiebreakerTrace: [] })) });

describe('manual schedule safeguards', () => {
  const input = { stageId: 's', teamAId: 'a', teamBId: 'b', round: 1 };
  it('rejects self-pairing, ineligible teams and invalid round order', () => {
    expect(manualFixtureError({ ...input, teamBId: 'a' }, ['a', 'b'], [])).toMatch(/different/);
    expect(manualFixtureError(input, ['a'], [])).toMatch(/belong/);
    expect(manualFixtureError({ ...input, round: 1.5 }, ['a', 'b'], [])).toMatch(/whole/);
  });
  it('blocks a team appearing twice in one round but permits a later-round rematch', () => {
    expect(manualFixtureError(input, ['a', 'b', 'c'], [fixture({ teamB: 'c' })])).toMatch(/already/);
    expect(manualFixtureError({ ...input, round: 2 }, ['a', 'b'], [fixture()])).toBeUndefined();
  });
  it('locks started fixtures and excludes the edited row from its conflict check', () => {
    expect(manualFixtureError(input, ['a', 'b'], [fixture({ status: 'LIVE' })], 'm')).toMatch(/unstarted/);
    expect(manualFixtureError(input, ['a', 'b'], [fixture()], 'm')).toBeUndefined();
  });
  it('keeps knockout round names aligned with round order', () => {
    expect(manualFixtureError({ ...input, teamAId: 'c', teamBId: 'd', roundName: 'F' }, ['c', 'd'], [fixture({ roundId: 'SF' })])).toMatch(/round order/);
  });
});

describe('qualifier order and preview', () => {
  const groups = [group('A', 4), group('B', 4)];
  it.each([['FINAL_2', ['A1', 'B1']], ['SF_4', ['A1', 'B2', 'B1', 'A2']], ['QF_8', ['A1', 'B4', 'B1', 'A4', 'A2', 'B3', 'B2', 'A3']], ['SIX_TEAM_CROSSOVER', ['A1', 'B3', 'A2', 'B2', 'A3', 'B1']]] as const)('preserves %s pairings', (preset, ids) => {
    expect(seedQualifiers(groups, preset).map(team => team.teamId)).toEqual(ids);
  });
  it('preserves playoff rank order and rejects inapplicable presets', () => {
    expect(seedQualifiers([groups[0]], 'PLAYOFFS_4').map(team => team.teamId)).toEqual(['A1', 'A2', 'A3', 'A4']);
    expect(() => seedQualifiers(groups, 'PLAYOFFS_4')).toThrow(/one group/);
    expect(() => seedQualifiers([group('A', 2)], 'QF_8')).toThrow(/exactly/);
  });
  it('blocks automatic unresolved qualification and accepts explicit custom decisions', () => {
    const tied = structuredClone(groups); tied[0].rows[0].unresolved = true;
    expect(() => seedQualifiers(tied, 'SF_4')).toThrow(/tie/);
    expect(seedQualifiers(tied, 'CUSTOM', ['A1', 'B1'])).toHaveLength(2);
    expect(() => seedQualifiers(tied, 'CUSTOM', ['A1', 'outside'])).toThrow(/belong/);
    expect(() => seedQualifiers(tied, 'CUSTOM', ['A1', 'A1'])).toThrow(/unique/);
  });
  it('reorders custom pairings without mutating the input', () => {
    const ids = ['A1', 'B1', 'A2', 'B2'];
    const next = reorderQualifier(ids, 1, 1);
    expect(seedQualifiers(groups, 'CUSTOM', next).map(team => team.teamId)).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(ids).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(reorderQualifier(ids, 0, -1)).toEqual(ids);
  });
});

describe('recorded winner progression', () => {
  it('prefers the official winner over regulation totals and finds the losing team', () => {
    const match = fixture({ status: 'COMPLETED', scoreA: 120, scoreB: 100, result: { kind: 'WIN', winnerTeamId: 'b' } });
    expect(fixtureWinner(match)).toBe('b'); expect(fixtureLoser(match)).toBe('a');
  });
  it.each(['NO_RESULT', 'CANCELLED', 'ABANDONED', 'TIE', 'DRAW'])('does not advance %s from unequal totals', kind => {
    expect(() => fixtureWinner(fixture({ status: 'COMPLETED', scoreA: 100, scoreB: 50, result: { kind } }))).toThrow(/Resolve/);
  });
  it('does not accept a live match, foreign winner or result missing its winner', () => {
    expect(() => fixtureWinner(fixture({ scoreA: 100, scoreB: 1 }))).toThrow(/complete/);
    expect(() => fixtureWinner(fixture({ status: 'COMPLETED', result: { winnerTeamId: 'outside' } }))).toThrow(/participant/);
    expect(() => fixtureWinner(fixture({ status: 'COMPLETED', scoreA: 100, scoreB: 1, result: { kind: 'WIN' } }))).toThrow(/no winner/);
  });
  it('advances recorded winners once and provides distinct feeder labels', () => {
    const builder = new KnockoutBracketBuilder();
    const bracket = builder.build('s', ['a', 'b', 'c', 'd'].map(teamId => ({ teamId })), { rounds: ['SF', 'F'], seeding: 'TOP_VS_BOTTOM', idFactory: () => 'generated' });
    expect(bracket.rounds[1].slotMap.map(slot => slot.sourceRef)).toEqual(['Winner of SF1', 'Winner of SF2']);
    bracket.rounds[0].matches.forEach(match => { match.status = 'COMPLETED'; match.result = { kind: 'WIN', winnerTeamId: match.teamB }; });
    const final = builder.resolveNextRound(bracket, 0);
    expect([final[0].teamA, final[0].teamB]).toEqual(bracket.rounds[0].matches.map(match => match.teamB));
    expect(builder.resolveNextRound(bracket, 0)).toEqual([]);
  });
});
