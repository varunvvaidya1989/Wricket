import { type Href, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';

import { AnimatedSportStageSplash } from '@/components/branding/AnimatedSportStageSplash';
import { safeAuthReturnTo } from '@/lib/auth/returnTo';
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
  const { returnTo } = useGlobalSearchParams<{ returnTo?: string }>();
  const root = segments[0];
  const authReturnTo = safeAuthReturnTo(returnTo);

  useEffect(() => {
    if (auth.loading) return;
    if (auth.authLinkError) {
      if (root !== 'auth-link-error') router.replace('/auth-link-error');
      return;
    }
    const publicAuthRoute = root === 'live' || root === 'player' || root === 'tournament' || root === 'auth' || root === 'auth-link-error' || root === 'forgot-password' || root === 'reset-password';
    if (!auth.session) {
      if (!publicAuthRoute) router.replace('/live');
      return;
    }
    const onboardingComplete = auth.profile?.onboardingStatus === 'COMPLETED' && Boolean(auth.profile.primarySport);
    if (!onboardingComplete) {
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
    if (!hasSportAccess) router.replace('/apps');
  }, [auth.authLinkError, auth.loading, auth.profile, auth.session, authReturnTo, root, router]);

  if (auth.loading) return <AnimatedSportStageSplash />;
  return <>{children}</>;
}
