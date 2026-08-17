export type SportPlatformFeatureKey =
  | 'cloud_competitions'
  | 'follows_and_insights'
  | 'offline_scoring'
  | 'public_live';

export interface SportFeatureFlag {
  config: Record<string, unknown>;
  enabled: boolean;
  featureKey: SportPlatformFeatureKey;
  rolloutPercentage: number;
  sportId: string | null;
}

export const supportedFeatureKeys = new Set<SportPlatformFeatureKey>([
  'cloud_competitions',
  'follows_and_insights',
  'offline_scoring',
  'public_live',
]);

function rolloutBucket(subjectId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < subjectId.length; index += 1) {
    hash ^= subjectId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function evaluateSportFeatureFlag(
  flags: SportFeatureFlag[],
  featureKey: SportPlatformFeatureKey,
  options: { sportId?: string | null; subjectId?: string | null } = {},
): boolean {
  const sportFlag = options.sportId
    ? flags.find(flag => flag.featureKey === featureKey && flag.sportId === options.sportId)
    : undefined;
  const flag = sportFlag ?? flags.find(item => item.featureKey === featureKey && item.sportId === null);

  if (!flag?.enabled || flag.rolloutPercentage <= 0) return false;
  if (flag.rolloutPercentage >= 100) return true;
  if (!options.subjectId) return false;
  return rolloutBucket(options.subjectId) < flag.rolloutPercentage;
}
