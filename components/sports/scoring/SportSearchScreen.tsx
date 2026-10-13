import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageField, StageIntro, StageList, StageNotice, StagePage, StageRow, StageText } from '@/components/sports/platform/StageUI';
import { useSportFeatureFlag } from '@/hooks/useSportFeatureFlag';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import { sportCompetitionApi } from '@/lib/supabase/sportCompetitionApi';
import { sportDiscoveryApi } from '@/lib/supabase/sportDiscoveryApi';
import { sportRosterApi } from '@/lib/supabase/sportRosterApi';
import { sportScoringApi } from '@/lib/supabase/sportScoringApi';

const categories = ['Matches', 'Competitions', 'Clubs'] as const;
type Result = { id: string; title: string; detail: string; route: string };

export function SportSearchScreen({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const presentation = SPORT_PRESENTATION[sportId];
  const name = SPORT_CONFIGS[sportId].name;
  const base = `/${presentation.routeSegment}`;
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const category = categories.find(item => item === params.category);
  const query = typeof params.q === 'string' ? params.q.slice(0, 120) : '';
  const accountId = auth.session?.user.id;
  const connectedSport = auth.profile?.connectedSports.find(item => item.code === presentation.catalogCode);
  const competitionsFlag = useSportFeatureFlag('cloud_competitions', presentation.catalogCode, accountId);
  const key = `${accountId}:${sportId}:${category}:${query}:${competitionsFlag.enabled}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; items: Result[]; error?: string }>();
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!category) return;
    const timer = setTimeout(() => {
      const load = async (): Promise<Result[]> => {
        if (category === 'Clubs') {
          if (!accountId) return [];
          const clubs = await sportRosterApi.discoverClubs(presentation.catalogCode, query);
          return clubs.map(club => ({ id: club.id, title: club.name, detail: `${name} · Public club`, route: `${base}/club/${club.id}` }));
        }
        if (category === 'Competitions') {
          if (!competitionsFlag.enabled) return [];
          const competitions = await sportCompetitionApi.list(presentation.catalogCode);
          return competitions.map(item => ({ id: item.id, title: item.name, detail: item.lifecycle.replaceAll('_', ' ').toLowerCase(), route: `${base}/competition/${item.id}?mode=view` }));
        }
        const [mine, publicMatches, upcoming] = await Promise.all([
          accountId && connectedSport ? sportScoringApi.listMine({ accountId, sportId: connectedSport.id }) : Promise.resolve([]),
          sportDiscoveryApi.discoverPage(undefined, 49),
          sportDiscoveryApi.upcoming(30, presentation.catalogCode),
        ]);
        const matches = new Map<string, Result>();
        mine.forEach(match => matches.set(match.id, { id: match.id, title: `${match.participantA} vs ${match.participantB}`, detail: `${match.status.toLowerCase()} · ${match.headlineScore || 'Waiting for the first rally'}`, route: `${base}/match/${match.id}/feed` }));
        publicMatches.items.filter(item => item.sportCode === presentation.catalogCode).forEach(match => matches.set(match.scoringMatchId, { id: match.scoringMatchId, title: `${match.participantA} vs ${match.participantB}`, detail: `${match.competitionName} · ${match.headlineScore}`, route: `${base}/match/${match.scoringMatchId}/feed` }));
        upcoming.forEach(match => matches.set(match.discoveryId, { id: match.discoveryId, title: `${match.participantA} vs ${match.participantB}`, detail: `${match.competitionName} · ${new Date(match.scheduledAt).toLocaleString()}`, route: `${base}/competition/${match.competitionId}?mode=view` }));
        return [...matches.values()];
      };
      void load().then(items => {
        if (active) setResult({ key, items });
      }).catch(() => {
        if (active) setResult({ key, items: [], error: 'These results couldn’t be loaded. Please try again.' });
      });
    }, query ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
    // Attempt reissues the focused search without changing its route filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, base, category, competitionsFlag.enabled, connectedSport?.id, key, name, presentation.catalogCode, query, attempt]));
  const current = result?.key === key ? result : undefined;
  const items = current?.items.filter(item => `${item.title} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  return <StagePage>
    <StageIntro title="More ways to play." description="Browse this sport. Switch sports from the header." />
    <StageList>
      <StageRow title="Find a match" detail="Live action and recent results" symbol="↗" onPress={() => router.setParams({ category: 'Matches' })} />
      <StageRow title="Find a competition" detail="Open entries and upcoming events" symbol="◇" onPress={() => router.setParams({ category: 'Competitions' })} />
      <StageRow title="Find a club" detail="Teams and regular playing groups" symbol="+" onPress={() => router.setParams({ category: 'Clubs' })} />
    </StageList>
    {category ? <>
      <StageField label={`Search ${name} ${category.toLowerCase()}`} value={query} onChangeText={q => router.setParams({ q })} placeholder="Search by name" maxLength={120} autoCapitalize="none" />
      <StageText variant="eyebrow" muted>{category.toUpperCase()}</StageText>
      {!current ? <StageNotice>Finding {category.toLowerCase()}…</StageNotice> : current.error ? <StageNotice retry={() => setAttempt(value => value + 1)}>{current.error}</StageNotice> : items.length ? <StageList>{items.map(item => <StageRow key={item.id} title={item.title} detail={item.detail} symbol="↗" onPress={() => router.push(item.route as Href)} />)}</StageList> : <StageNotice>{category === 'Competitions' && !competitionsFlag.enabled ? competitionsFlag.loading ? 'Checking competition availability…' : 'Competitions are not available yet.' : query ? 'No matching results. Try a different name.' : category === 'Clubs' ? 'No public clubs found. Open your clubs to create a group or review invitations.' : 'No matches here yet. Check back for new activity.'}</StageNotice>}
      {category === 'Clubs' ? <><StageText variant="small" muted>Showing up to 50 public clubs. Narrow the name to find your group.</StageText><StageButton title="Open my clubs & invitations" onPress={() => router.push(`${base}/clubs` as Href)} /></> : null}
    </> : null}
    <StageButton title="Search across all sports" onPress={() => router.push({ pathname: '/explore', params: query ? { q: query } : {} })} />
  </StagePage>;
}
