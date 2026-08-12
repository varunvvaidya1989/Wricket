import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { GlobalProfileData, globalProfileApi } from '@/lib/supabase/globalProfileApi';

export function useGlobalProfile(accountId?: string) {
  const [data, setData] = useState<GlobalProfileData>();
  const [loading, setLoading] = useState(Boolean(accountId));
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!accountId) {
      setData(undefined);
      setError(undefined);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setData(await globalProfileApi.get(accountId));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your global profile');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));

  return { data, loading, error, reload: load };
}
