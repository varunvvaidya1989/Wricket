import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import type { SponsorParent, TournamentSponsor } from '@/lib/sponsors/types';
import { tournamentSponsorsApi } from '@/lib/supabase/tournamentSponsorsApi';

export function useTournamentSponsors(parent: SponsorParent, enabled = true) {
  const { session } = useAuth();
  const [sponsors, setSponsors] = useState<TournamentSponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const { kind, id } = parent;
  const accountId = session?.user.id;
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const data = await tournamentSponsorsApi.list({ kind, id });
      if (request === generation.current) { setSponsors(data); setError(undefined); }
    } catch {
      if (request === generation.current) {
        setSponsors([]);
        setError('Sponsors could not be loaded. Check your connection and try again.');
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [kind, id]);

  useFocusEffect(useCallback(() => {
    setSponsors([]);
    setError(undefined);
    if (!enabled || !accountId) { setLoading(false); return; }
    setLoading(true);
    void refresh();
    // Refresh visibility changes and short-lived signed logo URLs while focused.
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 60_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { ++generation.current; clearInterval(timer); subscription.remove(); };
  }, [accountId, enabled, refresh]));
  return { sponsors, loading, error, refresh };
}
