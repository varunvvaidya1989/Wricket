import { RELEASED_SPORTSTAGE_SPORTS } from './sportLiveContent';
import type { CloudSport } from '@/lib/supabase/profiles';

const segments: Readonly<Record<string, string>> = {
  CRICKET: 'wricket', BADMINTON: 'badminton', TENNIS: 'tennis', PADEL: 'padel',
  TABLE_TENNIS: 'table-tennis', PICKLEBALL: 'pickleball',
};
const order = ['CRICKET', 'BADMINTON', 'TENNIS', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL'];
export const stageSports = [...RELEASED_SPORTSTAGE_SPORTS].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
export const sportLetters: Readonly<Record<string, string>> = { CRICKET: 'C', BADMINTON: 'B', TENNIS: 'T', PADEL: 'P', TABLE_TENNIS: 'TT', PICKLEBALL: 'PB' };

export function sportHome(code: string): string | undefined {
  return stageSports.some(sport => sport.code === code) && segments[code] ? `/${segments[code]}` : undefined;
}

export function connectedStageSports(sports: readonly CloudSport[]) {
  return stageSports.filter(item => sports.some(sport => sport.code === item.code && sport.accessStatus === 'ACTIVE' && sport.status === 'AVAILABLE'));
}

export function sportEntry(code: string, signedIn: boolean, sports: readonly CloudSport[], setup = false): string | undefined {
  const home = sportHome(code);
  if (!home) return undefined;
  const destination = setup ? `${home}/match/new` : home;
  if (!signedIn) return `/auth?returnTo=${encodeURIComponent(destination)}`;
  if (!connectedStageSports(sports).some(sport => sport.code === code)) return `/account?returnTo=${encodeURIComponent(destination)}`;
  return destination;
}

export type ExploreCategory = 'All' | 'Matches' | 'Teams' | 'Competitions';
export interface ExploreItem {
  key: string; kind: Exclude<ExploreCategory, 'All'> | 'Players';
  title: string; detail: string; sportCode: string; route: string;
}
export function filterExplore(items: readonly ExploreItem[], query: string, category: ExploreCategory) {
  const clean = query.trim().toLocaleLowerCase();
  return [...new Map(items.filter(item => (category === 'All' || item.kind === category)
    && `${item.title} ${item.detail}`.toLocaleLowerCase().includes(clean)).map(item => [item.key, item])).values()];
}
export function exploreCategory(value: unknown): ExploreCategory {
  return value === 'Matches' || value === 'Teams' || value === 'Competitions' ? value : 'All';
}
