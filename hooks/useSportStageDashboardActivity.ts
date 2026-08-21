import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { countLiveSnapshots } from '@/lib/sports/platform/sportDashboard';
import { sportDiscoveryApi } from '@/lib/supabase/sportDiscoveryApi';
import { sportOperationsApi } from '@/lib/supabase/sportOperationsApi';
import { sportResultsApi } from '@/lib/supabase/sportResultsApi';

interface DashboardActivity {
  liveCounts: ReadonlyMap<string, number>;
  profileMatchCounts: ReadonlyMap<string, number>;
  unreadCount: number;
}

const EMPTY_ACTIVITY: DashboardActivity = {
  liveCounts: new Map(),
  profileMatchCounts: new Map(),
  unreadCount: 0,
};

export function useSportStageDashboardActivity(enabled: boolean) {
  const clientKey = useRef(`sportstage-dashboard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [activity, setActivity] = useState<DashboardActivity>(EMPTY_ACTIVITY);

  const load = useCallback(async (): Promise<DashboardActivity> => {
    if (!enabled) return EMPTY_ACTIVITY;

    const [liveResult, notificationResult, statsResult] = await Promise.allSettled([
      sportDiscoveryApi.discover(clientKey.current, undefined, 50),
      sportOperationsApi.notifications(),
      sportResultsApi.listMine(),
    ]);

    return {
      liveCounts: liveResult.status === 'fulfilled'
        ? countLiveSnapshots(liveResult.value)
        : new Map(),
      profileMatchCounts: statsResult.status === 'fulfilled'
        ? new Map(statsResult.value.map((stat) => [stat.sportCode, stat.matchesPlayed]))
        : new Map(),
      unreadCount: notificationResult.status === 'fulfilled'
        ? notificationResult.value.filter((notification) => !notification.readAt).length
        : 0,
    };
  }, [enabled]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void load().then((nextActivity) => {
      if (active) setActivity(nextActivity);
    });
    return () => { active = false; };
  }, [load]));

  return activity;
}
