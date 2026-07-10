import {
  getTournament,
  listInningsForMatch,
  listMatches,
} from '../db/repo';
import { computePointsTableFromData, PointsRow } from '../domain/points';
import { Innings } from '../domain/types';

export type { PointsRow } from '../domain/points';

export async function computePointsTable(tournamentId: string): Promise<PointsRow[]> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return [];

  const matches = await listMatches(tournamentId);
  const inningsByMatch = new Map<string, Innings[]>();
  for (const match of matches) {
    inningsByMatch.set(match.id, await listInningsForMatch(match.id));
  }

  return computePointsTableFromData(tournament, matches, inningsByMatch);
}
