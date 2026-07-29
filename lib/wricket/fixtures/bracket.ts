import { nextPowerOfTwo, roundsFor } from './recommender';
import type { FixtureMatch, KnockoutBracket, KnockoutConfig, KORound, KORoundName } from './types';

export interface QualifiedTeam {
  teamId: string;
  sourceRef?: string;
  groupId?: string;
}

export class KnockoutBracketBuilder {
  build(stageId: string, qualifiedTeams: QualifiedTeam[], config: KnockoutConfig): KnockoutBracket {
    if (qualifiedTeams.length < 2) throw new Error('At least 2 qualified teams are required');
    const bracketSize = nextPowerOfTwo(qualifiedTeams.length);
    const required = roundsFor(bracketSize);
    const selected = config.rounds.filter(round => round !== '3RD_PLACE');
    if (selected.length !== required.length || selected.some((round, index) => normalise(round) !== required[index])) {
      throw new Error(`${qualifiedTeams.length} teams need ${required.map(roundLabel).join(', ')}.`);
    }
    const id = config.idFactory ?? (() => `ko_${Math.random().toString(36).slice(2)}`);
    const seeded = this.seed(qualifiedTeams, config);
    const byes = bracketSize - seeded.length;
    const slots: Array<QualifiedTeam | undefined> = Array(bracketSize);
    for (let index = 0; index < seeded.length; index += 1) {
      const slot = seedSlot(index, bracketSize);
      slots[slot] = seeded[index];
    }
    const rounds: KORound[] = [];
    const firstMatches: FixtureMatch[] = [];
    const firstSlotMap = slots.map((team, slot) => ({ slot: slot + 1, sourceRef: team?.sourceRef ?? team?.teamId ?? 'BYE' }));
    for (let index = 0; index < bracketSize; index += 2) {
      const a = slots[index];
      const b = slots[index + 1];
      const present = a ?? b;
      if (!present) continue;
      firstMatches.push({
        id: id(), stageId, roundId: `${stageId}:${required[0]}`,
        teamA: present.teamId, teamB: a && b ? b.teamId : undefined,
        round: 1, leg: 1, status: a && b ? 'SCHEDULED' : 'WALKOVER',
        scoreA: a && b ? undefined : 1, scoreB: a && b ? undefined : 0,
      });
    }
    rounds.push({ id: `${stageId}:${required[0]}`, name: required[0], matches: firstMatches, slotMap: firstSlotMap });
    for (let roundIndex = 1; roundIndex < required.length; roundIndex += 1) {
      const matchCount = bracketSize / 2 ** (roundIndex + 1);
      rounds.push({
        id: `${stageId}:${required[roundIndex]}`,
        name: required[roundIndex],
        matches: [],
        slotMap: Array.from({ length: matchCount * 2 }, (_, slot) => ({
          slot: slot + 1,
          sourceRef: `Winner of ${required[roundIndex - 1]}${Math.floor(slot / 2) + 1}`,
        })),
      });
    }
    if (config.includeThirdPlacePlayoff && required.includes('SF')) {
      rounds.push({
        id: `${stageId}:3RD_PLACE`, name: '3RD_PLACE', matches: [],
        slotMap: [{ slot: 1, sourceRef: 'Loser of SF1' }, { slot: 2, sourceRef: 'Loser of SF2' }],
      });
    }
    return { id: id(), stageId, rounds, seedingSource: config.seeding, bracketSize, byes };
  }

  resolveNextRound(bracket: KnockoutBracket, completedRoundIndex: number, idFactory = () => `ko_${Math.random().toString(36).slice(2)}`) {
    const current = bracket.rounds[completedRoundIndex];
    const next = bracket.rounds[completedRoundIndex + 1];
    if (!next || next.name === '3RD_PLACE') return [];
    if (!current.matches.every(match => match.status === 'COMPLETED' || match.status === 'WALKOVER')) {
      throw new Error(`${current.name} is not complete`);
    }
    const winners = current.matches.map(winnerOf);
    next.matches = Array.from({ length: Math.floor(winners.length / 2) }, (_, index) => ({
      id: idFactory(), stageId: bracket.stageId, roundId: next.id,
      teamA: winners[index * 2], teamB: winners[index * 2 + 1],
      round: completedRoundIndex + 2, leg: 1, status: 'SCHEDULED' as const,
    }));
    return next.matches;
  }

  private seed(teams: QualifiedTeam[], config: KnockoutConfig): QualifiedTeam[] {
    if (config.seeding === 'MANUAL') {
      if (!config.manualOrder || config.manualOrder.length !== teams.length) throw new Error('Manual seeding requires every qualified team');
      const byId = new Map(teams.map(team => [team.teamId, team]));
      return config.manualOrder.map(id => {
        const team = byId.get(id);
        if (!team) throw new Error(`Unknown manual seed: ${id}`);
        return team;
      });
    }
    if (config.seeding === 'RANDOM') {
      const random = config.random ?? Math.random;
      return [...teams].sort(() => random() - 0.5);
    }
    return [...teams];
  }
}

function winnerOf(match: FixtureMatch): string {
  if (!match.teamB) return match.teamA;
  if (match.scoreA == null || match.scoreB == null || match.scoreA === match.scoreB) throw new Error(`Match ${match.id} has no winner`);
  return match.scoreA > match.scoreB ? match.teamA : match.teamB;
}
function normalise(name: KORoundName): KORoundName {
  return ({ QUARTER_FINAL: 'QF', SEMI_FINAL: 'SF', FINAL: 'F' } as Record<string, KORoundName>)[name] ?? name;
}
function roundLabel(name: KORoundName) {
  return ({ QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final', R16: 'Round of 16' } as Record<string, string>)[name] ?? name;
}
function seedSlot(index: number, size: number): number {
  if (index === 0) return 0;
  if (index === 1) return size - 1;
  const candidate = index % 2 ? size - 1 - Math.floor(index / 2) : Math.floor(index / 2);
  return candidate;
}
