import { type Href, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';

import { safeAuthReturnTo } from '@/lib/auth/returnTo';
import { canResumeOfflineScoring, isOfflineError } from '@/lib/auth/offlineScoring';
import { isSportReleased } from '@/lib/sports/platform/sportRelease';
import { useAuth } from './AuthProvider';

const appSportByRoot: Readonly<Record<string, string>> = {
  wricket: 'CRICKET',
  tennis: 'TENNIS',
  badminton: 'BADMINTON',
  padel: 'PADEL',
  'table-tennis': 'TABLE_TENNIS',
  pickleball: 'PICKLEBALL',
};

export function RootAccessGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { returnTo, token, section, id: routeMatchId } = useGlobalSearchParams<{ returnTo?: string; token?: string; section?: string; id?: string }>();
  const root: string | undefined = segments[0];
  const isTeamInvitation = root === 'wricket' && segments[1] === 'team' && segments[2] === 'join';
  const isTournamentInvitation = root === 'wricket' && segments[1] === 'tournament' && String(segments[2]) === 'join';
  const isSportCompetition = root !== 'wricket' && Boolean(appSportByRoot[root ?? '']) && segments[1] === 'competition';
  const competitionReturn = isSportCompetition ? safeAuthReturnTo(`/${root}/competition/${routeMatchId}${section ? `?section=${section}` : ''}`) : undefined;
  const authReturnTo = safeAuthReturnTo(returnTo) ?? competitionReturn ?? (isTeamInvitation ? safeAuthReturnTo(`/wricket/team/join?token=${token ?? ''}`) : isTournamentInvitation ? safeAuthReturnTo(`/wricket/tournament/join?token=${token ?? ''}`) : undefined);

  useEffect(() => {
    if (auth.loading) return;
    if (auth.authLinkError) {
      if (root !== 'auth-link-error') router.replace({ pathname: '/auth-link-error', params: (auth.authLinkError?.returnTo ?? authReturnTo) ? { returnTo: (auth.authLinkError?.returnTo ?? authReturnTo)! } : {} });
      return;
    }
    const publicAuthRoute = isSportCompetition || isTeamInvitation || isTournamentInvitation || root === 'live' || root === 'explore' || root === 'start-match' || root === 'switch-sport' || root === 'player' || root === 'match' || root === 'tournament' || root === 'auth' || root === 'auth-link-error' || root === 'forgot-password' || root === 'reset-password';
    if (!auth.session) {
      if (!publicAuthRoute) router.replace('/live');
      return;
    }
    const onboardingComplete = auth.profile?.onboardingStatus === 'COMPLETED' && Boolean(auth.profile.primarySport);
    if (!onboardingComplete) {
      if (Platform.OS !== 'web' && isOfflineError(auth.error) && root === 'wricket') {
        let cancelled = false;
        const scoringSegments = segments.map((segment,index) => index === 2 && segment === '[id]' ? routeMatchId ?? segment : segment);
        void canResumeOfflineScoring({ platform: Platform.OS,segments: scoringSegments,accountId: auth.session.user.id,profileError: auth.error })
          .then(allowed => { if (!cancelled && !allowed) router.replace('/live'); })
          .catch(() => { if (!cancelled) router.replace('/live'); });
        return () => { cancelled = true; };
      }
      if (root !== 'onboarding') router.replace({ pathname: '/onboarding', params: authReturnTo ? { returnTo: authReturnTo } : {} });
      return;
    }
    if (authReturnTo && !root) {
      router.replace(authReturnTo as Href);
      return;
    }
    if (root === 'auth' || root === 'auth-link-error' || root === 'forgot-password' || root === 'onboarding') {
      router.replace((authReturnTo ?? '/') as Href);
      return;
    }
    const requiredSport = root ? appSportByRoot[root] : undefined;
    const hasSportAccess = !requiredSport || (
      isSportReleased(requiredSport) && auth.profile?.connectedSports.some(
        sport => sport.code === requiredSport && sport.accessStatus === 'ACTIVE',
      )
    );
    if (!hasSportAccess) {
      const setupReturn = root && segments[1] === 'match' && segments[2] === 'new' ? safeAuthReturnTo(`/${root}/match/new`) : undefined;
      if (setupReturn ?? competitionReturn) router.replace({ pathname: '/account', params: { returnTo: (setupReturn ?? competitionReturn)! } });
      else router.replace('/apps');
    }
  }, [auth.authLinkError, auth.error, auth.loading, auth.profile, auth.session, authReturnTo, competitionReturn, isSportCompetition, isTeamInvitation, isTournamentInvitation, root, router, segments, routeMatchId]);

  // Keep the root navigator mounted so initial native links can resolve while
  // restoring auth. The launch boundary covers and disables the routes.
  return <>{children}</>;
}
