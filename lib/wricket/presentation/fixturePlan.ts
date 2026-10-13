import { pairingStrategies } from '@/lib/wricket/fixtures/pairing';
import { nextPowerOfTwo, roundsFor } from '@/lib/wricket/fixtures/recommender';
import type { FormatRecommendation, PairingAlgorithm, TournamentFormatType } from '@/lib/wricket/fixtures';

export const fixtureFormats: { value: TournamentFormatType; title: string; detail: string }[] = [
  { value: 'GROUPS_ONLY', title: 'Groups only', detail: 'A league schedule with group standings' },
  { value: 'GROUPS_THEN_KNOCKOUT', title: 'Groups → knockout', detail: 'Group fixtures first, then a winning bracket' },
  { value: 'KNOCKOUT_ONLY', title: 'Knockout only', detail: 'An elimination bracket with no group stage' },
];
export const fixtureAlgorithms: { value: PairingAlgorithm; title: string; detail: string }[] = [
  { value: 'ROUND_ROBIN', title: 'Round robin', detail: 'Every team meets each group opponent once.' },
  { value: 'DOUBLE_ROUND_ROBIN', title: 'Double round robin', detail: 'Every team meets each group opponent twice.' },
  { value: 'WEIGHTED_ROUND_ROBIN', title: 'Weighted round robin', detail: 'Round-robin pairings with seed-based match weights.' },
  { value: 'SWISS', title: 'Swiss', detail: 'Generate the opening round. Later rounds depend on results.' },
  { value: 'RANDOM_PAIRS', title: 'Random pairs', detail: 'One random round. Pairings are drawn when you generate.' },
];

export function fixtureFormatChoices(base: FormatRecommendation, teamCount: number): Omit<FormatRecommendation, 'alternatives'>[] {
  const candidates = [base, ...base.alternatives];
  return fixtureFormats.map(({ value }) => candidates.find(item => item.formatType === value) ?? {
    ...base, formatType: value, numberOfGroups: value === 'KNOCKOUT_ONLY' ? 0 : Math.max(1, Math.round(teamCount / 4)),
    advancePerGroup: value === 'GROUPS_THEN_KNOCKOUT' ? 2 : 0,
    knockoutRounds: value === 'KNOCKOUT_ONLY' ? roundsFor(nextPowerOfTwo(teamCount)) : [],
    byes: value === 'KNOCKOUT_ONLY' ? nextPowerOfTwo(teamCount) - teamCount : 0,
    pairingAlgorithm: 'ROUND_ROBIN', rationale: fixtureFormats.find(item => item.value === value)!.detail,
  });
}

export function fixturePlan(input: { teamIds: string[]; format: TournamentFormatType; algorithm: PairingAlgorithm; groups: string; advance: string; assignments: Record<string, number> }) {
  const { teamIds, format, algorithm, assignments } = input;
  const groupCount = Number(input.groups);
  const advance = format === 'GROUPS_THEN_KNOCKOUT' ? Number(input.advance) : 0;
  const groupCountValid = Number.isInteger(groupCount) && groupCount >= 1 && groupCount <= Math.floor(teamIds.length / 2);
  const groups = format !== 'KNOCKOUT_ONLY' && groupCountValid ? Array.from({ length: groupCount }, (_, index) => ({
    name: `Group ${String.fromCharCode(65 + index)}`, index,
    capacity: Math.floor(teamIds.length / groupCount) + (index < teamIds.length % groupCount ? 1 : 0),
    teamIds: teamIds.filter(id => assignments[id] === index),
  })) : [];
  const unassigned = teamIds.filter(id => !groups.some(group => group.teamIds.includes(id)));
  const configurationError = teamIds.length < 2 ? 'Add at least two teams before building fixtures.'
    : new Set(teamIds).size !== teamIds.length ? 'Each tournament team must appear once.'
    : format === 'KNOCKOUT_ONLY' ? undefined
    : !groupCountValid ? `Choose 1 to ${Math.max(1, Math.floor(teamIds.length / 2))} groups, with at least two teams each.`
    : format === 'GROUPS_THEN_KNOCKOUT' && (!Number.isInteger(advance) || advance < 1 || advance > Math.min(...groups.map(group => group.capacity)) || advance * groupCount < 2)
      ? 'Choose a whole number of qualifiers per group, with at least two qualifiers overall and no more than the smallest group.' : undefined;
  const error = configurationError ?? (format !== 'KNOCKOUT_ONLY' && unassigned.length ? `Place all teams before continuing (${unassigned.length} unassigned).`
    : groups.some(group => group.teamIds.length !== group.capacity) ? 'Balance the groups to the displayed capacities.' : undefined);
  let sequence = 0;
  const previews = error ? [] : groups.map(group => ({ ...group, matches: pairingStrategies.get(algorithm).generate({
    id: String(group.index), stageId: 'preview', name: group.name, teamIds: group.teamIds,
  }, { idFactory: () => `preview-${++sequence}`, random: () => 0.5 }) }));
  return { groups, unassigned, configurationError, error, previews, matchCount: previews.reduce((sum, group) => sum + group.matches.length, 0),
    rounds: roundsFor(nextPowerOfTwo(Math.max(2, teamIds.length))), byes: nextPowerOfTwo(Math.max(2, teamIds.length)) - teamIds.length };
}
