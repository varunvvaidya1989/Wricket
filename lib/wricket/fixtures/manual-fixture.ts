import type { FixtureMatch } from './types';

export interface ManualPairing {
  stageId: string; groupId?: string; teamAId: string; teamBId: string; round: number; roundName?: string;
}

export function manualFixtureError(input: ManualPairing, eligibleTeamIds: readonly string[], matches: readonly FixtureMatch[], editingId?: string): string | undefined {
  const editing = editingId ? matches.find(match => match.id === editingId) : undefined;
  if (editingId && (!editing || editing.status !== 'SCHEDULED')) return 'Only an unstarted fixture can be edited.';
  if (!input.teamAId || !input.teamBId) return 'Choose both teams.';
  if (input.teamAId === input.teamBId) return 'Select two different teams.';
  if (![input.teamAId, input.teamBId].every(id => eligibleTeamIds.includes(id))) return 'Both teams must belong to this tournament and the selected group.';
  if (!Number.isSafeInteger(input.round) || input.round < 1) return 'Round must be a whole number greater than zero.';
  const sameRound = matches.filter(match => match.id !== editingId && match.stageId === input.stageId && match.round === input.round);
  if (sameRound.some(match => [match.teamA, match.teamB].some(id => id === input.teamAId || id === input.teamBId))) return 'A selected team already has a fixture in this round.';
  if (input.roundName && matches.some(match => match.id !== editingId && match.stageId === input.stageId &&
    ((match.round === input.round && match.roundId !== input.roundName) || (match.roundId === input.roundName && match.round !== input.round)))) return 'Use one round order for each knockout round name.';
  return undefined;
}
