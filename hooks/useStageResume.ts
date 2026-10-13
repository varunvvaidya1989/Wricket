import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { CloudSport } from '@/lib/supabase/profiles';
import { getCricketTasks } from '@/lib/supabase/cricketTasksApi';
import { sportScoringApi } from '@/lib/supabase/sportScoringApi';
import { connectedStageSports, sportHome } from '@/lib/sports/platform/connectedExperience';

interface ResumeMatch { id: string; title: string; detail: string; route: string; sportCode: string }
export function useStageResume(accountId: string | undefined, sports: readonly CloudSport[]) {
  const [state, setState] = useState<{ accountId?: string; matches: ResumeMatch[]; error?: string }>({ matches: [] });
  const [loading, setLoading] = useState(false);
  // Depend on stable identity/access values, not a newly created array each render.
  const sportKey = sports.map(sport => `${sport.code}:${sport.id}:${sport.accessStatus}:${sport.status}`).join('|');
  useFocusEffect(useCallback(() => {
    let active = true;
    setState({ accountId, matches: [] });
    if (!accountId) { setLoading(false); return; }
    setLoading(true);
    const connected = connectedStageSports(sports);
    void Promise.allSettled(connected.map(async sport => {
      if (sport.code === 'CRICKET') {
        const tasks = await getCricketTasks(accountId);
        return tasks.matches.map(match => ({ id: match.id, title: 'Continue your cricket match', detail: match.label, route: `/wricket/match/${match.id}/score`, sportCode: sport.code }));
      }
      const cloudSport = sports.find(item => item.code === sport.code)!;
      const matches = await sportScoringApi.listOwned({ accountId, sportId: cloudSport.id, limit: 5 });
      return matches.filter(match => match.status === 'LIVE').map(match => ({ id: match.id, title: `Continue your ${sport.name.toLowerCase()} match`, detail: `${match.participantA} vs ${match.participantB} · ${match.headlineScore}`, route: `${sportHome(sport.code)}/match/${match.id}/score`, sportCode: sport.code }));
    })).then(results => {
      if (!active) return;
      setState({ accountId, matches: results.flatMap(result => result.status === 'fulfilled' ? result.value : []), error: results.some(result => result.status === 'rejected') ? 'Some saved matches could not be loaded.' : undefined });
      setLoading(false);
    });
    return () => { active = false; };
    // The key includes every field used to select an authorised sport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, sportKey]));
  return { matches: state.accountId === accountId ? state.matches : [], error: state.accountId === accountId ? state.error : undefined, loading };
}
