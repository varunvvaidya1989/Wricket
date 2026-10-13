import { globalSearchApi } from '@/lib/supabase/globalSearchApi';
import { sportCompetitionApi } from '@/lib/supabase/sportCompetitionApi';
import { sportRosterApi } from '@/lib/supabase/sportRosterApi';
import type { SportPublicLiveSnapshot, SportUpcomingSnapshot } from '@/lib/supabase/sportDiscoveryApi';
import { sportHome, stageSports, type ExploreItem } from './connectedExperience';
import { sportStageContent } from './sportLiveContent';

export function discoveryExploreItems(live: readonly SportPublicLiveSnapshot[], upcoming: readonly SportUpcomingSnapshot[]): ExploreItem[] {
  return [...live.flatMap(match => {
    const name = sportStageContent(match.sportCode).name;
    const items: ExploreItem[] = [{ key: `match:${match.scoringMatchId}`, kind: 'Matches', title: `${match.participantA} vs ${match.participantB}`, detail: `${name} · ${match.competitionName} · ${match.headlineScore}`, sportCode: match.sportCode, route: `/match?id=${encodeURIComponent(match.scoringMatchId)}` }];
    if (match.competitionId) items.push(competitionItem(match.competitionId, match.competitionName, match.sportCode, 'Live matches'));
    return items;
  }), ...upcoming.flatMap(match => [
    { key: `scheduled:${match.discoveryId}`, kind: 'Matches' as const, title: `${match.participantA} vs ${match.participantB}`, detail: `${sportStageContent(match.sportCode).name} · ${match.competitionName} · ${new Date(match.scheduledAt).toLocaleString()}`, sportCode: match.sportCode,
      route: match.sourceKind === 'CRICKET_MATCH' ? `/match?id=${encodeURIComponent(match.sourceId)}` : competitionItem(match.competitionId, match.competitionName, match.sportCode, '').route },
    competitionItem(match.competitionId, match.competitionName, match.sportCode, 'Upcoming fixtures'),
  ])];
}

function competitionItem(id: string, name: string, code: string, detail: string): ExploreItem {
  return { key: `competition:${code}:${id}`, kind: 'Competitions', title: name, detail: `${sportStageContent(code).name} · ${detail}`, sportCode: code,
    route: code === 'CRICKET' ? `/tournament?id=${encodeURIComponent(id)}` : `${sportHome(code)}/competition/${encodeURIComponent(id)}?mode=view` };
}

// Every directory request retains its existing server-side visibility policy.
// Partial failures are returned separately rather than presented as no results.
export async function loadExploreDirectory(query: string, connectedCodes: readonly string[]): Promise<{ items: ExploreItem[]; partial: boolean }> {
  const directorySports = stageSports.filter(sport => sport.code !== 'CRICKET' && connectedCodes.includes(sport.code));
  const tasks: Promise<ExploreItem[]>[] = [
    (query.trim().length >= 2 ? globalSearchApi.search(query) : globalSearchApi.suggested()).then(results => results.map(item => ({
      key: `${item.type === 'TOURNAMENT' ? 'competition:CRICKET' : item.type === 'MATCH' ? 'match' : item.type}:${item.id}`,
      kind: item.type === 'TOURNAMENT' ? 'Competitions' as const : item.type === 'TEAM' ? 'Teams' as const : item.type === 'MATCH' ? 'Matches' as const : 'Players' as const,
      title: item.title, detail: `Cricket · ${item.subtitle}`, sportCode: 'CRICKET',
      route: item.type === 'TOURNAMENT' ? `/tournament?id=${encodeURIComponent(item.id)}` : item.type === 'MATCH' ? `/match?id=${encodeURIComponent(item.id)}` : item.type === 'TEAM' ? `/wricket/team/${encodeURIComponent(item.id)}` : `/wricket/user/${encodeURIComponent(item.id)}`,
    }))),
    ...directorySports.map(async sport => {
      const competitions = await sportCompetitionApi.list(sport.code);
      return competitions.map(item => competitionItem(item.id, item.name, sport.code, item.lifecycle.toLowerCase().replaceAll('_', ' ')));
    }),
  ];
  if (query.trim().length >= 2) tasks.push(...directorySports.map(async sport => {
    const players = await sportRosterApi.searchPlayers(sport.code, query);
    return players.map(item => ({ key: `player:${item.sportProfileId}`, kind: 'Players' as const, title: item.displayName, detail: `${sport.name} player`, sportCode: sport.code, route: `/player/${encodeURIComponent(item.sportProfileId)}` }));
  }));
  const results = await Promise.allSettled(tasks);
  return { items: results.flatMap(result => result.status === 'fulfilled' ? result.value : []), partial: results.some(result => result.status === 'rejected') };
}
