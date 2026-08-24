import type { SportPublicLiveSnapshot } from '@/lib/supabase/sportDiscoveryApi';

export function appendLiveSnapshots(
  current: readonly SportPublicLiveSnapshot[],
  incoming: readonly SportPublicLiveSnapshot[],
): SportPublicLiveSnapshot[] {
  const snapshots = new Map(current.map(snapshot => [snapshotKey(snapshot), snapshot]));
  for (const snapshot of incoming) snapshots.set(snapshotKey(snapshot), snapshot);
  return [...snapshots.values()];
}

function snapshotKey(snapshot: SportPublicLiveSnapshot): string {
  return `${snapshot.sportCode}:${snapshot.scoringMatchId}`;
}
