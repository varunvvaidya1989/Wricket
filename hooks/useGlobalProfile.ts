import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { GlobalProfileData, globalProfileApi } from '@/lib/supabase/globalProfileApi';

export function useGlobalProfile(accountId?: string) {
  const generation = useRef(0);
  const [data, setData] = useState<GlobalProfileData>();
  const [loading, setLoading] = useState(Boolean(accountId));
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!accountId) {
      setData(undefined);
      setError(undefined);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const next = await globalProfileApi.get(accountId);
      if (request !== generation.current) return;
      setData(next);
      setError(undefined);
    } catch (cause) {
      if (request !== generation.current) return;
      setError(cause instanceof Error ? cause.message : 'Could not load your global profile');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [accountId]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]));

  return { data: data?.profile.id === accountId ? data : undefined, loading, error, reload: load };
}
