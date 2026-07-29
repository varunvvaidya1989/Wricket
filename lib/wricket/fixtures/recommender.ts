import type { FormatRecommendation, KORoundName } from './types';

export interface RecommendationConstraints {
  preferSwiss?: boolean;
  maxGroupSize?: number;
}

export class FormatRecommender {
  recommend(teamCount: number, constraints: RecommendationConstraints = {}): FormatRecommendation {
    if (!Number.isInteger(teamCount) || teamCount < 2) throw new Error('Team count must be at least 2');
    if (teamCount <= 4) return withAlternatives(knockout(teamCount), [groupOnly(teamCount)]);
    if (teamCount <= 8) {
      const group = groupOnly(teamCount);
      return withAlternatives(group, [hybrid(teamCount, 2)]);
    }
    if (teamCount <= 32) {
      const candidates = [3, 4, 5]
        .filter(size => !constraints.maxGroupSize || size <= constraints.maxGroupSize)
        .map(size => candidate(teamCount, size))
        .sort((a, b) => a.score - b.score);
      const best = candidates[0] ?? candidate(teamCount, 4);
      return withAlternatives(hybrid(teamCount, best.groups), candidates.slice(1, 3).map(item => hybrid(teamCount, item.groups)));
    }
    const qualifiers = previousPowerOfTwo(teamCount);
    const base: Omit<FormatRecommendation, 'alternatives'> = constraints.preferSwiss !== false
      ? {
        formatType: 'GROUPS_THEN_KNOCKOUT', numberOfGroups: 1, teamsPerGroup: [teamCount],
        advancePerGroup: qualifiers, knockoutRounds: roundsFor(qualifiers), byes: 0,
        pairingAlgorithm: 'SWISS',
        rationale: `A Swiss stage limits fixtures for ${teamCount} teams, then the top ${qualifiers} enter a balanced knockout.`,
      }
      : {
        ...knockout(teamCount),
        rationale: `${teamCount - qualifiers} preliminary ties trim the field to a power-of-two knockout.`,
      };
    return withAlternatives(base, [constraints.preferSwiss === false ? { ...base, pairingAlgorithm: 'SWISS' } : knockout(teamCount)]);
  }
}

function groupOnly(count: number): Omit<FormatRecommendation, 'alternatives'> {
  return {
    formatType: 'GROUPS_ONLY', numberOfGroups: 1, teamsPerGroup: [count], advancePerGroup: 0,
    knockoutRounds: [], byes: 0, pairingAlgorithm: 'ROUND_ROBIN',
    rationale: `${count} teams fit a single round-robin where every team plays each opponent.`,
  };
}

function knockout(count: number): Omit<FormatRecommendation, 'alternatives'> {
  const size = nextPowerOfTwo(count);
  return {
    formatType: 'KNOCKOUT_ONLY', numberOfGroups: 0, teamsPerGroup: [], advancePerGroup: 0,
    knockoutRounds: roundsFor(size), byes: size - count, pairingAlgorithm: 'RANDOM_PAIRS',
    rationale: `${count} teams are best served by a compact knockout${size > count ? ` with ${size - count} bye(s)` : ''}.`,
  };
}

function hybrid(count: number, groups: number): Omit<FormatRecommendation, 'alternatives'> {
  const sizes = split(count, groups);
  const advance = sizes.every(size => size >= 4) ? 2 : 1;
  const qualifierCount = nextPowerOfTwo(groups * advance);
  return {
    formatType: 'GROUPS_THEN_KNOCKOUT', numberOfGroups: groups, teamsPerGroup: sizes,
    advancePerGroup: advance, knockoutRounds: roundsFor(qualifierCount),
    byes: qualifierCount - groups * advance, pairingAlgorithm: 'ROUND_ROBIN',
    rationale: `${groups} balanced groups (${sizes.join('/')}) advance ${advance} each into a ${qualifierCount}-slot knockout.`,
  };
}

function candidate(count: number, targetSize: number) {
  const groups = Math.max(2, Math.round(count / targetSize));
  const sizes = split(count, groups);
  const advance = sizes.every(size => size >= 4) ? 2 : 1;
  const qualifiers = groups * advance;
  return { groups, score: (Math.max(...sizes) - Math.min(...sizes)) * 10 + nextPowerOfTwo(qualifiers) - qualifiers };
}

function split(count: number, groups: number): number[] {
  return Array.from({ length: groups }, (_, index) => Math.floor(count / groups) + (index < count % groups ? 1 : 0));
}
export const nextPowerOfTwo = (value: number) => 2 ** Math.ceil(Math.log2(value));
const previousPowerOfTwo = (value: number) => 2 ** Math.floor(Math.log2(value));
export function roundsFor(size: number): KORoundName[] {
  const names: Record<number, KORoundName> = { 2: 'F', 4: 'SF', 8: 'QF', 16: 'R16', 32: 'R32', 64: 'R64', 128: 'R128' };
  const result: KORoundName[] = [];
  for (let current = size; current >= 2; current /= 2) result.push(names[current] ?? `R${current}`);
  return result;
}
function withAlternatives(base: Omit<FormatRecommendation, 'alternatives'>, alternatives: Omit<FormatRecommendation, 'alternatives'>[]): FormatRecommendation {
  return { ...base, alternatives: alternatives.slice(0, 2) };
}
