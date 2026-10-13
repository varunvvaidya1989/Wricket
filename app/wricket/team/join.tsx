import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageIntro, StageNotice, StagePage, StageStateArt } from '@/components/sports/platform/StageUI';
import { TeamInvitationPreview, teamManagementApi } from '@/lib/supabase/teamManagementApi';

export default function JoinTeamScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const auth = useAuth();
  const router = useRouter();
  const lock = useRef(false);
  const [invite, setInvite] = useState<TeamInvitationPreview>();
  const [error, setError] = useState<string>();
  const [joining, setJoining] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setInvite(undefined); setError(undefined);
    if (!token || !/^[a-f0-9]{48}$/.test(token)) { setError('This invitation link is incomplete. Ask the owner for a new link.'); return; }
    if (!auth.session) return;
    void teamManagementApi.previewInvitation(token).then(value => { if (active) setInvite(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Invitation unavailable.'); });
    return () => { active = false; };
  }, [auth.session, token, attempt]);
  const join = async () => {
    if (!token || lock.current || !invite) return;
    lock.current = true; setJoining(true);
    try {
      const joined = await teamManagementApi.acceptInvitation(token);
      router.replace({ pathname: '/wricket/team/[id]', params: { id: joined.teamId } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not join team.'); }
    finally { lock.current = false; setJoining(false); }
  };
  const signIn = () => router.push({ pathname: '/auth', params: { returnTo: `/wricket/team/join?token=${token}` } });
  return <StagePage focused title="Team invitation" footer={!error ? <StageButton primary title={!auth.session ? 'Sign in to join' : invite ? `Join ${invite.teamShortName}` : 'Checking invitation…'} loading={joining} disabled={Boolean(auth.session && !invite)} onPress={!auth.session ? signIn : () => void join()} /> : undefined}>
    <Stack.Screen options={{ headerShown: false }} />
    <StageStateArt symbol="+" />
    <StageIntro eyebrow="TEAM INVITATION" title={invite ? invite.teamName : error ? 'Invitation unavailable.' : 'Take your place.'} description={invite ? `Join as ${invite.role.toLowerCase()}. This invitation expires ${new Date(invite.expiresAt).toLocaleString()}.` : 'Sign in with your SportStage account to check this invitation and join the team.'} />
    {error ? <StageNotice retry={() => setAttempt(value => value + 1)}>{error}</StageNotice> : auth.session && !invite ? <StageNotice>Checking your invitation…</StageNotice> : null}
    {invite ? <StageNotice>{invite.role === 'CAPTAIN' ? 'This team invitation grants captain access to manage its roster. Tournament ownership stays with the organiser.' : 'Your player account will be added to this team’s roster.'}</StageNotice> : null}
  </StagePage>;
}
