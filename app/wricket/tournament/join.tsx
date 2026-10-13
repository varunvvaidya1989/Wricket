import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/components/providers/AuthProvider';
import { Card } from '@/components/wricket/ui/Card';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { TournamentTeamApplicationForm } from '@/components/wricket/tournament/TournamentTeamEntry';
import { tournamentTeamEntryApi as api, type TournamentEntryPreview } from '@/lib/supabase/tournamentTeamEntryApi';
import { StageButton, StagePage, StageText } from '@/components/sports/platform/StageUI';
import { colors } from '@/lib/wricket/presentation/design';

export default function TournamentEntryScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const auth = useAuth(); const router = useRouter();
  const [preview, setPreview] = useState<TournamentEntryPreview>();
  const [error, setError] = useState<string>(); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setPreview(undefined); setError(undefined);
    if (!token || !/^[a-f0-9]{48}$/.test(token)) { setError('This invitation link is incomplete. Ask the organiser for a new link.'); return; }
    if (!auth.session) return;
    void api.preview(token).then(value => { if (active) setPreview(value); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not check this invitation'); });
    return () => { active = false; };
  }, [auth.session, token, retry]);
  return <StagePage focused title="Tournament invitation">
      {error ? <StateNotice error title="Invitation unavailable" detail={error} action={{ label: 'Check invitation again', onPress: () => setRetry(value => value + 1) }} /> : !auth.session ? <Card style={{ gap: 14 }}><StageText variant="eyebrow" muted>TOURNAMENT INVITATION</StageText><StageText variant="title">Take your place.</StageText><StageText muted>Sign in to check your invitation and continue with your team.</StageText><StageButton primary title="Sign in for tournament invitation" onPress={() => router.push({ pathname: '/auth', params: { returnTo: `/wricket/tournament/join?token=${token}` } })} /></Card> : preview ? <>
        <View><StageText variant="eyebrow" muted>{preview.kind === 'CLAIM_CAPTAIN' ? 'CAPTAIN INVITATION' : 'TEAM ENTRY INVITATION'}</StageText><StageText variant="title" style={{ marginTop: 8 }}>{preview.tournament_name}</StageText><StageText variant="small" muted style={{ marginTop: 8 }}>Invitation expires {new Date(preview.expires_at).toLocaleString()}</StageText></View>
        {preview.kind === 'CLAIM_CAPTAIN' ? <Card style={{ gap: 14 }}>
          <DesignIcon name="users" size={24} color={colors.accent} /><StageText variant="heading">{preview.team_name}</StageText><StageText muted>Claim the captain role for this reserved team. You’ll manage its roster and add players to the existing tournament place.</StageText>
          <StageText variant="small" muted>The organiser keeps tournament ownership. This invitation grants roster management access.</StageText>
          <StageButton primary title="Claim captain role" loading={busy} onPress={() => { if (!token || lock.current) return; lock.current = true; setBusy(true); void api.claim(token).then(teamId => router.replace({ pathname: '/wricket/team/[id]', params: { id: teamId } })).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not claim this team')).finally(() => { lock.current = false; setBusy(false); }); }} />
        </Card> : <TournamentTeamApplicationForm tournamentId={preview.tournament_id} accountId={auth.session.user.id} settings={{ registration_open: true, fee_required: preview.fee_required, fee_label: preview.fee_label, payment_instructions: preview.payment_instructions }} token={token} />}
      </> : <StageText muted>Checking your invitation…</StageText>}
  </StagePage>;
}
