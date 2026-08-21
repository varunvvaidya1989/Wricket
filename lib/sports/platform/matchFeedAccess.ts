import type { CloudSport } from '@/lib/supabase/profiles';
import { isSportReleased } from './sportRelease';

const sportDestination: Readonly<Record<string, { name: string; feedRoute(matchId: string): string }>> = {
  CRICKET: { name: 'Cricket', feedRoute: (matchId) => `/wricket/match/${matchId}/live` },
  TENNIS: { name: 'Tennis', feedRoute: (matchId) => `/tennis/match/${matchId}/feed` },
  BADMINTON: { name: 'Badminton', feedRoute: (matchId) => `/badminton/match/${matchId}/feed` },
  PADEL: { name: 'Padel', feedRoute: (matchId) => `/padel/match/${matchId}/feed` },
  TABLE_TENNIS: { name: 'Table Tennis', feedRoute: (matchId) => `/table-tennis/match/${matchId}/feed` },
  PICKLEBALL: { name: 'Pickleball', feedRoute: (matchId) => `/pickleball/match/${matchId}/feed` },
};

export type MatchFeedAccessDecision =
  | { kind: 'SIGN_IN' }
  | { kind: 'UNSUPPORTED'; title: string; message: string }
  | { kind: 'UNAVAILABLE'; title: string; message: string }
  | { kind: 'OPEN'; route: string };

export function resolveMatchFeedAccess(input: {
  authenticated: boolean;
  connectedSports: readonly CloudSport[];
  nonCricketEnabled?: boolean;
  sportCode: string;
  scoringMatchId: string;
}): MatchFeedAccessDecision {
  if (!input.authenticated) return { kind: 'SIGN_IN' };
  const destination = sportDestination[input.sportCode];
  if (!destination) return {
    kind: 'UNSUPPORTED',
    title: 'Sport app unavailable',
    message: 'This match belongs to a sport app that is not available on this version of SportStage.',
  };
  if (!isSportReleased(input.sportCode, input.nonCricketEnabled)) return {
    kind: 'UNSUPPORTED',
    title: `${destination.name} is coming later`,
    message: `${destination.name} is not available in the current SportStage release.`,
  };

  const connectedSport = input.connectedSports.find((sport) => sport.code === input.sportCode);
  if (!connectedSport || connectedSport.accessStatus !== 'ACTIVE' || connectedSport.status !== 'AVAILABLE') {
    const message = connectedSport?.accessStatus === 'SUSPENDED'
      ? `Your ${destination.name} app access is paused. Review your account before opening this feed.`
      : connectedSport?.accessStatus === 'COMING_SOON' || connectedSport?.status === 'COMING_SOON'
        ? `Your ${destination.name} app is not ready yet.`
        : `Add ${destination.name} to your SportStage account before opening its detailed match feed.`;
    return { kind: 'UNAVAILABLE', title: `${destination.name} app unavailable`, message };
  }

  return { kind: 'OPEN', route: destination.feedRoute(input.scoringMatchId) };
}
