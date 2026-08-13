export type PlayerMatchFilter = 'ALL' | 'LIVE' | 'UPCOMING' | 'COMPLETED';

export interface PlayerMatchItem {
  id: string;
  status: string;
  format: string;
  scheduledAt: string;
  tournamentName: string;
  ownTeamName: string;
  opponentName: string;
  ownScore?: string;
  opponentScore?: string;
  result?: 'W' | 'L' | 'T' | 'NR';
  runs?: number;
  balls?: number;
  wickets?: number;
}

export function playerMatchCategory(status: string): Exclude<PlayerMatchFilter, 'ALL'> {
  if (['IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION'].includes(status)) return 'LIVE';
  if (['COMPLETED', 'ABANDONED'].includes(status)) return 'COMPLETED';
  return 'UPCOMING';
}

export function comparePlayerMatches(a: PlayerMatchItem, b: PlayerMatchItem): number {
  const order = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };
  const categoryA = playerMatchCategory(a.status);
  const categoryB = playerMatchCategory(b.status);
  const categoryDifference = order[categoryA] - order[categoryB];
  if (categoryDifference) return categoryDifference;
  const dateDifference = Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt);
  return categoryA === 'COMPLETED' ? -dateDifference : dateDifference;
}
