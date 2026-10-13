import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { sportDiscoveryApi, type SportLivePage, type SportUpcomingSnapshot } from '@/lib/supabase/sportDiscoveryApi';

export function useStageDiscovery() {
  const [page, setPage] = useState<SportLivePage>({ items: [], hasMore: false });
  const [upcoming, setUpcoming] = useState<SportUpcomingSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    generation.current += 1;
    setLoading(true);
    setError(undefined);
    void Promise.allSettled([sportDiscoveryApi.discoverPage(undefined, 12), sportDiscoveryApi.upcoming(20)]).then(([live, scheduled]) => {
      if (!active) return;
      setPage(live.status === 'fulfilled' ? live.value : { items: [], hasMore: false });
      setUpcoming(scheduled.status === 'fulfilled' ? scheduled.value : []);
      if (live.status === 'rejected' || scheduled.status === 'rejected') setError('Some matches could not be loaded. Check your connection and try again.');
      setLoading(false);
    });
    return () => { active = false; generation.current += 1; };
  }, [revision]));
  const loadMore = async () => {
    if (!page.hasMore || !page.nextCursor || loadingMore) return;
    setLoadingMore(true);
    const requestGeneration = generation.current;
    try {
      const next = await sportDiscoveryApi.discoverPage(page.nextCursor, 12);
      if (requestGeneration !== generation.current) return;
      setPage(current => ({ ...next, items: [...new Map([...current.items, ...next.items].map(item => [item.scoringMatchId, item])).values()] }));
      setError(undefined);
    } catch { if (requestGeneration === generation.current) setError('More live matches could not be loaded. Try again.'); }
    finally { setLoadingMore(false); }
  };
  return { page, upcoming, loading, error, loadingMore, loadMore, reload: () => setRevision(value => value + 1) };
}
