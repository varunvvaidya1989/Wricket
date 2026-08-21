import type { SportSummary } from '@/lib/supabase/globalProfileApi';
import type { SportPublicLiveSnapshot } from '@/lib/supabase/sportDiscoveryApi';

export const SPORT_LAUNCH_DESCRIPTIONS = Object.freeze({
  CRICKET: 'Wricket \u00B7 tournaments, live scoring and scorecards',
  BADMINTON: 'Singles and doubles, rally scoring to 21',
  TENNIS: 'Sets, games, and points \u2014 solo or with a partner',
  PADEL: 'Doubles court sport with optional golden point',
  TABLE_TENNIS: 'Fast games to 11, serve rotates every two points',
  PICKLEBALL: 'Games to 11 or 15, server-number scoring',
} as const);

export function sportLaunchDescription(code: string): string | undefined {
  return SPORT_LAUNCH_DESCRIPTIONS[code as keyof typeof SPORT_LAUNCH_DESCRIPTIONS];
}

export function countLiveSnapshots(
  snapshots: readonly SportPublicLiveSnapshot[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const snapshot of snapshots) {
    if (snapshot.status !== 'LIVE') continue;
    counts.set(snapshot.sportCode, (counts.get(snapshot.sportCode) ?? 0) + 1);
  }
  return counts;
}

export function orderSportSummaries(
  sports: readonly SportSummary[],
  profileMatchCounts: ReadonlyMap<string, number>,
): { sports: SportSummary[]; primarySportId?: string } {
  if (!sports.length) return { sports: [] };

  // Match history decides prominence; the member's chosen primary sport breaks ties.
  const primary = sports.reduce((best, candidate) => {
    const bestMatches = matchCount(best, profileMatchCounts);
    const candidateMatches = matchCount(candidate, profileMatchCounts);
    if (candidateMatches > bestMatches) return candidate;
    if (candidateMatches === bestMatches && candidate.sport.isPrimary && !best.sport.isPrimary) {
      return candidate;
    }
    return best;
  });

  return {
    primarySportId: primary.sport.id,
    sports: [primary, ...sports.filter((summary) => summary.sport.id !== primary.sport.id)],
  };
}

function matchCount(summary: SportSummary, profileMatchCounts: ReadonlyMap<string, number>) {
  return Math.max(summary.matches ?? 0, profileMatchCounts.get(summary.sport.code) ?? 0);
}
