import { describe, expect, it } from 'vitest';
import { FormatRecommender } from '@/lib/wricket/fixtures/recommender';
import { fixtureFormatChoices, fixturePlan } from './fixturePlan';

const teamIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const input = { teamIds, format: 'GROUPS_THEN_KNOCKOUT' as const, algorithm: 'ROUND_ROBIN' as const, groups: '2', advance: '2', assignments: { a: 0, b: 0, c: 0, d: 0, e: 1, f: 1, g: 1, h: 1 } };
describe('fixture plan review', () => {
  it('offers all formats even when knockout is not recommended', () => {
    const choices = fixtureFormatChoices(new FormatRecommender().recommend(8), 8);
    expect(choices.map(item => item.formatType)).toEqual(['GROUPS_ONLY', 'GROUPS_THEN_KNOCKOUT', 'KNOCKOUT_ONLY']);
    expect(choices[2].knockoutRounds).toEqual(['QF', 'SF', 'F']);
  });
  it('previews twelve distinct in-group pairings without changing assignments', () => {
    const before = structuredClone(input);
    const plan = fixturePlan(input);
    expect(plan.error).toBeUndefined();
    expect(plan.matchCount).toBe(12);
    for (const group of plan.previews) {
      expect(new Set(group.matches.map(match => [match.teamA, match.teamB].sort().join('|'))).size).toBe(6);
      expect(group.matches.every(match => group.teamIds.includes(match.teamA) && group.teamIds.includes(match.teamB!))).toBe(true);
    }
    expect(input).toEqual(before);
  });
  it.each([['DOUBLE_ROUND_ROBIN', 24], ['WEIGHTED_ROUND_ROBIN', 12], ['SWISS', 4], ['RANDOM_PAIRS', 4]] as const)('reflects actual %s opening generation', (algorithm, count) => {
    expect(fixturePlan({ ...input, algorithm }).matchCount).toBe(count);
  });
  it.each(['', '0', '-1', '2.5', '1000000000'])('rejects invalid group count %s without allocating groups', groups => {
    const plan = fixturePlan({ ...input, groups });
    expect(plan.configurationError).toBeTruthy();
    expect(plan.groups).toEqual([]);
  });
  it.each(['', '0', '1.5', '5'])('rejects invalid qualifiers %s', advance => {
    expect(fixturePlan({ ...input, advance }).configurationError).toBeTruthy();
  });
  it('blocks incomplete, out-of-range and over-capacity assignments', () => {
    expect(fixturePlan({ ...input, assignments: { ...input.assignments, h: 2 } }).unassigned).toEqual(['h']);
    expect(fixturePlan({ ...input, assignments: { ...input.assignments, h: 0 } }).error).toMatch(/Balance/);
  });
  it('ignores stale group settings for knockout-only and qualifiers for groups-only', () => {
    expect(fixturePlan({ ...input, format: 'KNOCKOUT_ONLY', groups: '', advance: '', assignments: {} }).error).toBeUndefined();
    expect(fixturePlan({ ...input, format: 'GROUPS_ONLY', advance: 'invalid' }).error).toBeUndefined();
  });
  it('supports balanced odd groups and gives a seven-team knockout one bye', () => {
    const assignments = { ...input.assignments }; delete (assignments as Partial<typeof assignments>).h;
    expect(fixturePlan({ ...input, teamIds: teamIds.slice(0, 7), assignments }).matchCount).toBe(9);
    expect(fixturePlan({ ...input, format: 'KNOCKOUT_ONLY', teamIds: teamIds.slice(0, 7) }).byes).toBe(1);
  });
});
