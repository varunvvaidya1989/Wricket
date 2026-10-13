import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import { sportScoringApi, type SportCloudMatchFeed } from '@/lib/supabase/sportScoringApi';

export function useSportMatches(sportId: ScoringSportId) {
  const auth = useAuth();
  const accountId = auth.session?.user.id;
  const sport = auth.profile?.connectedSports.find(item => item.code === SPORT_PRESENTATION[sportId].catalogCode && item.accessStatus === 'ACTIVE');
  const owner = `${accountId ?? ''}:${sport?.id ?? ''}`;
  const generation = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ owner: string; matches: SportCloudMatchFeed[]; loading: boolean; error?: string }>();
  useFocusEffect(useCallback(() => {
    let active = true;
    const reload = () => {
      const request = ++generation.current;
      setResult(current => ({ owner, matches: current?.owner === owner ? current.matches : [], loading: true }));
      if (!accountId || !sport?.id) { setResult({ owner, matches: [], loading: false }); return; }
      void sportScoringApi.listMine({ accountId, sportId: sport.id }).then(matches => {
        if (active && request === generation.current) setResult({ owner, matches, loading: false });
      }).catch(() => {
        if (active && request === generation.current) setResult(current => ({ owner, matches: current?.owner === owner ? current.matches : [], loading: false, error: 'Your matches couldn’t be loaded. Please try again.' }));
      });
    };
    reload();
    const unsubscribe = sport?.id ? sportScoringApi.subscribeSportLive(sport.id, reload) : undefined;
    return () => { active = false; generation.current++; unsubscribe?.(); };
    // A retry starts a fresh focused request and subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, owner, sport?.id, attempt]));
  return {
    matches: result?.owner === owner ? result.matches : [],
    loading: result?.owner !== owner || result.loading,
    error: result?.owner === owner ? result.error : undefined,
    retry: () => setAttempt(value => value + 1),
  };
}
