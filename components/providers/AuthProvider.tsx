import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getSupabaseClient } from '@/lib/supabase/client';
import { CloudProfile, getCloudProfile, saveCloudProfile } from '@/lib/supabase/profiles';

interface AuthContextValue {
  session: Session | null;
  profile: CloudProfile | null;
  loading: boolean;
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
  saveProfile(displayName: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setProfile(nextSession ? await getCloudProfile(nextSession.user.id) : null);
  }, []);

  useEffect(() => {
    let client: ReturnType<typeof getSupabaseClient>;
    try {
      client = getSupabaseClient();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Supabase is not configured');
      setLoading(false);
      return;
    }
    client.auth.getSession()
      .then(({ data }) => loadProfile(data.session))
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not restore cloud session'))
      .finally(() => setLoading(false));

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => {
        loadProfile(nextSession).catch(cause => {
          setProfile(null);
          setError(cause instanceof Error ? cause.message : 'Could not load cloud profile');
        });
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    loading,
    error,
    async signIn(email, password) {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    },
    async signUp(email, password) {
      const { data, error } = await getSupabaseClient().auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      return Boolean(data.session);
    },
    async signOut() {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
    },
    async saveProfile(displayName) {
      if (!session) throw new Error('Sign in before creating a profile');
      setProfile(await saveCloudProfile(session.user, displayName));
    },
  }), [error, loading, profile, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
