import { useEffect, useState } from 'react';

import {
  isSportFeatureEnabled,
  type SportPlatformFeatureKey,
} from '@/lib/sports/platform/featureFlags';

interface SportFeatureFlagState {
  enabled: boolean;
  loading: boolean;
}

export function useSportFeatureFlag(
  featureKey: SportPlatformFeatureKey,
  sportCode: string,
  subjectId?: string | null,
): SportFeatureFlagState {
  const [state, setState] = useState<SportFeatureFlagState>({ enabled: false, loading: true });

  useEffect(() => {
    let active = true;
    setState({ enabled: false, loading: true });
    void isSportFeatureEnabled(featureKey, sportCode, subjectId)
      .then(enabled => { if (active) setState({ enabled, loading: false }); })
      .catch(() => { if (active) setState({ enabled: false, loading: false }); });
    return () => { active = false; };
  }, [featureKey, sportCode, subjectId]);

  return state;
}
