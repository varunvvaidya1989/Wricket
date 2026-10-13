import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/components/providers/AuthProvider';
import { Text } from '@/components/wricket/ui/Text';
import { Card } from '@/components/wricket/ui/Card';
import { Button } from '@/components/wricket/ui/Button';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { tournamentParticipationApi, type TrackedApplication } from '@/lib/supabase/tournamentParticipationApi';
import { PAYMENT_LABELS } from '@/lib/supabase/tournamentRegistrationApi';

const statuses = { PENDING: 'Pending review', APPROVED: 'Approved', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn' };
export function MyTournamentApplications() {
  const { session } = useAuth(); const router = useRouter();
  const [rows, setRows] = useState<TrackedApplication[]>(); const [error, setError] = useState<string>(); const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    void attempt; // A refresh also invalidates any request from the previous attempt.
    let active = true; setRows(undefined); setError(undefined);
    if (session) void tournamentParticipationApi.mine(session.user.id).then(value => { if (active) setRows(value); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load your applications'); });
    return () => { active = false; };
  }, [session, attempt]));
  return <View style={{ gap: 18, padding: 18 }}><Text variant="h1">Your tournament applications.</Text><Text tone="muted">Track player and team requests, review decisions and the organiser’s payment flags.</Text>
    {error ? <StateNotice error title="Applications unavailable" detail={error} action={{ label: 'Refresh applications', onPress: () => setAttempt(value => value + 1) }} /> : !rows ? <Text tone="muted">Loading your applications…</Text> : !rows.length ? <StateNotice title="Your next tournament awaits" detail="Find a published tournament in Explore to request a place." action={{ label: 'Explore tournaments', onPress: () => router.push('/wricket/search') }} /> : rows.map(row => <Card key={`${row.kind}-${row.id}`} style={{ gap: 12 }}>
      <Text variant="overline" tone="muted">{row.kind === 'PLAYER' ? 'PLAYER APPLICATION' : 'TEAM APPLICATION'}</Text><Text variant="h3">{row.tournamentName}</Text>{row.teamName ? <Text variant="caption">{row.teamName}</Text> : null}<Text tone="accent">{statuses[row.status]}</Text><Text variant="caption" tone="muted">Payment: {PAYMENT_LABELS[row.payment]}</Text>
      <Button title="View application" accessibilityLabel={`View application for ${row.tournamentName}`} variant="secondary" onPress={() => router.push({ pathname: '/wricket/tournament/[id]', params: { id: row.tournamentId, tab: row.kind === 'PLAYER' ? 'players' : 'teams' } })} />
    </Card>)}
  </View>;
}
