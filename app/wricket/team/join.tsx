import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TeamInvitationPreview, teamManagementApi } from '@/lib/supabase/teamManagementApi';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export default function JoinTeamScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const auth = useAuth();
  const router = useRouter();
  const [invite, setInvite] = useState<TeamInvitationPreview>();
  const [error, setError] = useState<string>();
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    if (!token || !auth.session) return;
    teamManagementApi.previewInvitation(token).then(setInvite)
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Invitation unavailable'));
  }, [auth.session, token]);

  if (!auth.session) return <Screen>
    <Stack.Screen options={{ title: 'Join team' }} />
    <View style={styles.center}>
      <MaterialCommunityIcons name="account-lock-outline" size={44} color={colors.accent} />
      <Text variant="h2">Sign in to join</Text>
      <Text tone="muted" style={{ textAlign: 'center' }}>Team invitations require a verified SportStage account.</Text>
      <Button title="Open account" onPress={() => router.push('/account')} />
    </View>
  </Screen>;

  return <Screen>
    <Stack.Screen options={{ title: 'Join team' }} />
    <View style={styles.center}>
      {error ? <Text tone="muted">{error}</Text> : invite ? <Card style={{ width: '100%' }}>
        <Text variant="overline" tone="muted">TEAM INVITATION</Text>
        <Text variant="h1" style={{ marginTop: spacing.sm }}>{invite.teamName}</Text>
        <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
          Join as {invite.role.toLowerCase()} · expires {new Date(invite.expiresAt).toLocaleString()}
        </Text>
        <Button
          title={`Join ${invite.teamShortName}`}
          loading={joining}
          style={{ marginTop: spacing.xl }}
          onPress={async () => {
            if (!token) return;
            setJoining(true);
            try {
              const joined = await teamManagementApi.acceptInvitation(token);
              router.replace({ pathname: '/wricket/team/[id]', params: { id: joined.teamId } });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Could not join team');
            } finally {
              setJoining(false);
            }
          }}
        />
      </Card> : <Text tone="muted">Checking invitation…</Text>}
    </View>
  </Screen>;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md } });
