import type { FixtureMatch, KORound } from './types';

export interface ManualBracketProjection {
  stageId: string;
  rounds: KORound[];
  seedingSource: 'MANUAL';
  bracketSize: number;
  byes: number;
}

export function projectManualBracket(
  stageId: string,
  matches: readonly FixtureMatch[],
): ManualBracketProjection | null {
  if (matches.length === 0) return null;
  const roundsById = new Map<string, KORound & { order: number }>();
  for (const match of matches) {
    const roundId = match.roundId ?? `MANUAL_R${match.round}`;
    const existing = roundsById.get(roundId) ?? {
      id: roundId,
      name: roundId,
      order: match.round,
      matches: [],
      slotMap: [],
    };
    existing.matches.push({ ...match, roundId });
    roundsById.set(roundId, existing);
  }
  const teamIds = new Set(matches.flatMap(match => match.teamB
    ? [match.teamA, match.teamB]
    : [match.teamA]));
  const bracketSize = 2 ** Math.ceil(Math.log2(Math.max(2, teamIds.size)));
  const rounds = [...roundsById.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...round }) => round);
  return {
    stageId,
    rounds,
    seedingSource: 'MANUAL',
    bracketSize,
    byes: Math.max(0, bracketSize - teamIds.size),
  };
}
