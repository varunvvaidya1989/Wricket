import { getSupabaseClient } from '@/lib/supabase/client';

import {
  SportFeatureFlag,
  SportPlatformFeatureKey,
  supportedFeatureKeys,
} from './featureFlagEvaluation';

export { evaluateSportFeatureFlag } from './featureFlagEvaluation';
export type { SportFeatureFlag, SportPlatformFeatureKey } from './featureFlagEvaluation';

interface SportFeatureFlagRow {
  config: unknown;
  enabled: boolean;
  feature_key: string;
  rollout_percentage: number;
  sport_id: string | null;
}

function isFeatureKey(value: string): value is SportPlatformFeatureKey {
  return supportedFeatureKeys.has(value as SportPlatformFeatureKey);
}

function asConfig(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

export async function loadSportFeatureFlags(): Promise<SportFeatureFlag[]> {
  const { data, error } = await getSupabaseClient()
    .from('sport_feature_flags')
    .select('feature_key, sport_id, enabled, rollout_percentage, config');

  if (error) throw new Error(`Could not load sport feature flags: ${error.message}`);

  return ((data ?? []) as SportFeatureFlagRow[]).flatMap(row => {
    if (!isFeatureKey(row.feature_key)) return [];
    return [{
      config: asConfig(row.config),
      enabled: row.enabled,
      featureKey: row.feature_key,
      rolloutPercentage: Math.max(0, Math.min(100, row.rollout_percentage)),
      sportId: row.sport_id,
    }];
  });
}
