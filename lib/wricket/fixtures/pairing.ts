import type {
  FixtureGroup,
  FixtureMatch,
  PairingConfig,
  PairingStrategy,
  PairingAlgorithm,
} from './types';

const fallbackId = () => `fixture_${Math.random().toString(36).slice(2)}`;

function circlePairs(group: FixtureGroup, config: PairingConfig = {}): FixtureMatch[] {
  const id = config.idFactory ?? fallbackId;
  const teams: Array<string | null> = [...group.teamIds];
  if (teams.length % 2) teams.push(null);
  const fixed = teams[0];
  const rotating = teams.slice(1);
  const matches: FixtureMatch[] = [];
  for (let round = 0; round < teams.length - 1; round += 1) {
    const row = [fixed, ...rotating];
    for (let i = 0; i < row.length / 2; i += 1) {
      const a = row[i];
      const b = row[row.length - 1 - i];
      if (a && b) {
        const reverse = round % 2 === 1;
        matches.push({
          id: id(),
          stageId: group.stageId,
          groupId: group.id,
          teamA: reverse ? b : a,
          teamB: reverse ? a : b,
          round: round + 1,
          leg: 1,
          status: 'SCHEDULED',
        });
      }
    }
    rotating.unshift(rotating.pop()!);
  }
  return matches;
}

export class RoundRobinStrategy implements PairingStrategy {
  generate(group: FixtureGroup, config: PairingConfig = {}) {
    return circlePairs(group, config);
  }
}

export class DoubleRoundRobinStrategy implements PairingStrategy {
  generate(group: FixtureGroup, config: PairingConfig = {}) {
    const first = circlePairs(group, config);
    const id = config.idFactory ?? fallbackId;
    const roundsPerLeg = group.teamIds.length % 2 ? group.teamIds.length : group.teamIds.length - 1;
    return [
      ...first,
      ...first.map(match => ({
        ...match,
        id: id(),
        teamA: match.teamB!,
        teamB: match.teamA,
        round: match.round + roundsPerLeg,
        leg: 2,
      })),
    ];
  }
}

export class WeightedRoundRobinStrategy implements PairingStrategy {
  generate(group: FixtureGroup, config: PairingConfig = {}) {
    const seeds = group.seedByTeamId ?? Object.fromEntries(group.teamIds.map((team, index) => [team, index + 1]));
    return circlePairs(group, config).map(match => ({
      ...match,
      weight: Math.abs(seeds[match.teamA] - seeds[match.teamB!]) + 1,
    }));
  }
}

export class SwissStrategy implements PairingStrategy {
  generate(group: FixtureGroup, config: PairingConfig = {}) {
    return this.nextRound(group, config.priorMatches ?? [], config);
  }

  nextRound(group: FixtureGroup, priorMatches: FixtureMatch[], config: PairingConfig = {}) {
    const id = config.idFactory ?? fallbackId;
    const points = config.swissPoints ?? {};
    const played = new Set(priorMatches.flatMap(match => match.teamB
      ? [`${match.teamA}|${match.teamB}`, `${match.teamB}|${match.teamA}`]
      : []));
    const remaining = [...group.teamIds].sort((a, b) => (points[b] ?? 0) - (points[a] ?? 0));
    const nextRound = Math.max(0, ...priorMatches.map(match => match.round)) + 1;
    const matches: FixtureMatch[] = [];
    while (remaining.length > 1) {
      const teamA = remaining.shift()!;
      let opponentIndex = remaining.findIndex(teamB => !played.has(`${teamA}|${teamB}`));
      if (opponentIndex < 0) opponentIndex = 0;
      const teamB = remaining.splice(opponentIndex, 1)[0];
      matches.push({ id: id(), stageId: group.stageId, groupId: group.id, teamA, teamB, round: nextRound, leg: 1, status: 'SCHEDULED' });
    }
    return matches;
  }
}

export class RandomPairsStrategy implements PairingStrategy {
  generate(group: FixtureGroup, config: PairingConfig = {}) {
    const id = config.idFactory ?? fallbackId;
    const random = config.random ?? Math.random;
    const shuffled = [...group.teamIds].sort(() => random() - 0.5);
    const limit = Math.min(config.maxPairs ?? Math.floor(shuffled.length / 2), Math.floor(shuffled.length / 2));
    return Array.from({ length: limit }, (_, index) => ({
      id: id(),
      stageId: group.stageId,
      groupId: group.id,
      teamA: shuffled[index * 2],
      teamB: shuffled[index * 2 + 1],
      round: 1,
      leg: 1,
      status: 'SCHEDULED' as const,
    }));
  }
}

export class PairingStrategyRegistry {
  private strategies = new Map<PairingAlgorithm | string, PairingStrategy>();

  register(name: PairingAlgorithm | string, strategy: PairingStrategy): this {
    this.strategies.set(name, strategy);
    return this;
  }

  get(name: PairingAlgorithm | string): PairingStrategy {
    const strategy = this.strategies.get(name);
    if (!strategy) throw new Error(`Unknown pairing strategy: ${name}`);
    return strategy;
  }

  has(name: PairingAlgorithm | string): boolean {
    return this.strategies.has(name);
  }
}

export const pairingStrategies = new PairingStrategyRegistry()
  .register('ROUND_ROBIN', new RoundRobinStrategy())
  .register('DOUBLE_ROUND_ROBIN', new DoubleRoundRobinStrategy())
  .register('WEIGHTED_ROUND_ROBIN', new WeightedRoundRobinStrategy())
  .register('SWISS', new SwissStrategy())
  .register('RANDOM_PAIRS', new RandomPairsStrategy());

