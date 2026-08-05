import { useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';

import { AnimatedSportStageSplash } from '@/components/branding/AnimatedSportStageSplash';
import { useAuth } from './AuthProvider';

export function RootAccessGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const root = segments[0];

  useEffect(() => {
    if (auth.loading) return;
    if (auth.authLinkError) {
      if (root !== 'auth-link-error') router.replace('/auth-link-error');
      return;
    }
    const publicAuthRoute = root === 'auth' || root === 'auth-link-error' || root === 'forgot-password' || root === 'reset-password';
    if (!auth.session) {
      if (!publicAuthRoute) router.replace('/auth');
      return;
    }
    const onboardingComplete = auth.profile?.onboardingStatus === 'COMPLETED' && Boolean(auth.profile.primarySport);
    if (!onboardingComplete) {
      if (root !== 'onboarding') router.replace('/onboarding');
      return;
    }
    if (root === 'auth' || root === 'auth-link-error' || root === 'forgot-password' || root === 'onboarding') {
      router.replace('/');
      return;
    }
    const cricketAccess = auth.profile?.primarySport?.code === 'CRICKET'
      && auth.profile.primarySport.accessStatus === 'ACTIVE';
    if (root === 'wricket' && !cricketAccess) router.replace('/');
  }, [auth.authLinkError, auth.loading, auth.profile, auth.session, root, router]);

  if (auth.loading) return <AnimatedSportStageSplash />;
  return <>{children}</>;
}
