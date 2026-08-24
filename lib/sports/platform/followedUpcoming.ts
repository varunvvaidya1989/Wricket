import type { SportUpcomingSnapshot } from '@/lib/supabase/sportDiscoveryApi';

export interface SportFollowingResourceIds {
  cricketMatchIds: ReadonlySet<string>;
  cricketTournamentIds: ReadonlySet<string>;
  sportMatchIds: ReadonlySet<string>;
  sportCompetitionIds: ReadonlySet<string>;
}

export function selectFollowedUpcoming(
  snapshots: readonly SportUpcomingSnapshot[],
  follows: SportFollowingResourceIds,
): SportUpcomingSnapshot[] {
  return snapshots.filter(snapshot => snapshot.sportCode === 'CRICKET'
    ? follows.cricketMatchIds.has(snapshot.sourceId) || follows.cricketTournamentIds.has(snapshot.competitionId)
    : follows.sportMatchIds.has(snapshot.sourceId) || follows.sportCompetitionIds.has(snapshot.competitionId))
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));
}
