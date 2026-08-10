import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getSupabaseClient } from '@/lib/supabase/client';
import { CloudProfile, getCloudProfile, saveCloudProfile } from '@/lib/supabase/profiles';
import { resetDb } from '@/lib/wricket/db/client';

interface AuthContextValue {
  session: Session | null;
  profile: CloudProfile | null;
  loading: boolean;
  error: string | null;
  authLinkError: { code: string; message: string } | null;
  clearAuthLinkError(): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, draft?: { displayName: string; sportCodes: string[]; primarySportCode: string; phoneE164: string }): Promise<boolean>;
  signOutCurrentDevice(): Promise<void>;
  saveProfile(displayName: string): Promise<void>;
  refreshProfile(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string, currentPassword?: string): Promise<void>;
  updateEmail(email: string): Promise<void>;
  updateMobile(phone: string | null): Promise<void>;
  resendSignupConfirmation(email: string): Promise<void>;
  sendMagicLink(email: string): Promise<void>;
  clearDeviceData(): Promise<void>;
  deleteAccount(confirmation: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authLinkError, setAuthLinkError] = useState<{ code: string; message: string } | null>(null);

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

    const createSessionFromUrl = async (url: string) => {
      const parsed = Linking.parse(url);
      const fragment = url.includes('#') ? new URLSearchParams(url.split('#')[1]) : null;
      const errorDescription = parsed.queryParams?.error_description ?? fragment?.get('error_description');
      const errorCode = parsed.queryParams?.error_code ?? fragment?.get('error_code');
      if (errorDescription) {
        setAuthLinkError({ code: String(errorCode ?? 'auth_link_invalid'), message: String(errorDescription) });
        return;
      }
      const code = parsed.queryParams?.code;
      if (typeof code === 'string') {
        setAuthLinkError(null);
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        return;
      }
      const accessToken = parsed.queryParams?.access_token ?? fragment?.get('access_token');
      const refreshToken = parsed.queryParams?.refresh_token ?? fragment?.get('refresh_token');
      if (typeof accessToken === 'string' && typeof refreshToken === 'string') {
        setAuthLinkError(null);
        const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (sessionError) throw sessionError;
      }
    };
    const handleUrl = (url: string | null) => {
      if (!url) return;
      void createSessionFromUrl(url).catch(cause => {
        const authCause = cause as { code?: unknown; message?: unknown };
        setAuthLinkError({
          code: typeof authCause.code === 'string' ? authCause.code : 'auth_link_invalid',
          message: typeof authCause.message === 'string' ? authCause.message : 'Could not open authentication link',
        });
      });
    };
    void Linking.getInitialURL().then(handleUrl);
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => {
        loadProfile(nextSession).catch(cause => {
          setProfile(null);
          setError(cause instanceof Error ? cause.message : 'Could not load cloud profile');
        });
      }, 0);
    });
    return () => {
      data.subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    loading,
    error,
    authLinkError,
    clearAuthLinkError() { setAuthLinkError(null); },
    async signIn(email, password) {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    },
    async signUp(email, password, draft) {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: Linking.createURL('onboarding'),
          ...(draft ? { data: {
            display_name: draft.displayName.trim(),
            primary_sport_code: draft.primarySportCode,
            sport_codes: draft.sportCodes,
            mobile_e164: draft.phoneE164,
          } } : {}),
        },
      });
      if (error) throw error;
      return Boolean(data.session);
    },
    async signOutCurrentDevice() {
      const { error } = await getSupabaseClient().auth.signOut({ scope: 'local' });
      if (error) throw error;
    },
    async saveProfile(displayName) {
      if (!session) throw new Error('Sign in before creating a profile');
      setProfile(await saveCloudProfile(session.user, displayName));
    },
    async refreshProfile() {
      if (!session) { setProfile(null); return; }
      setProfile(await getCloudProfile(session.user.id));
    },
    async requestPasswordReset(email) {
      const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: Linking.createURL('reset-password'),
      });
      if (error) throw error;
    },
    async updatePassword(password, currentPassword) {
      const { error } = await getSupabaseClient().auth.updateUser({
        password,
        ...(currentPassword ? { current_password: currentPassword } : {}),
      });
      if (error) throw error;
    },
    async updateEmail(email) {
      const { error } = await getSupabaseClient().auth.updateUser(
        { email: email.trim() },
        { emailRedirectTo: Linking.createURL('account') },
      );
      if (error) throw error;
    },
    async updateMobile(phone) {
      const { error } = await getSupabaseClient().auth.updateUser({
        data: { mobile_e164: phone, pending_phone_e164: null },
      });
      if (error) throw error;
    },
    async resendSignupConfirmation(email) {
      const { error } = await getSupabaseClient().auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: Linking.createURL('onboarding') },
      });
      if (error) throw error;
    },
    async sendMagicLink(email) {
      const { error } = await getSupabaseClient().auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: Linking.createURL(''),
          shouldCreateUser: false,
        },
      });
      if (error) throw error;
    },
    async clearDeviceData() {
      await resetDb();
    },
    async deleteAccount(confirmation) {
      const client = getSupabaseClient();
      const { error: deleteError } = await client.rpc('delete_my_sportstage_account', { p_confirmation: confirmation });
      if (deleteError) throw deleteError;
      await resetDb();
      await client.auth.signOut({ scope: 'local' });
      setSession(null);
      setProfile(null);
    },
  }), [authLinkError, error, loading, profile, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
