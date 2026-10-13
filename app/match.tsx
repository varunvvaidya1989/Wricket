import React from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/components/providers/AuthProvider';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/wricket/ui/Text';
import { Button } from '@/components/wricket/ui/Button';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { matchSharePath } from '@/lib/wricket/presentation/matchShare';

export default function SharedMatchScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const auth = useAuth();
  const router = useRouter();
  const valid = typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id);
  const access = auth.profile?.connectedSports.some(sport => sport.code === 'CRICKET' && sport.accessStatus === 'ACTIVE');
  if (valid && auth.session && access) return <Redirect href={{ pathname: '/wricket/match/[id]/live', params: { id } }} />;
  return <Screen padded={false}><WricketHeader title="Shared match" backTo="/live" /><View style={{ padding: 18, gap: 18 }}>
    <Text variant="h1">Follow the match.</Text>
    <Text tone="muted">{!valid ? 'This match link is incomplete.' : !auth.session ? 'Sign in to view the score, history and match details.' : 'Add Cricket to your sports, then return to this match link.'}</Text>
    {valid && !auth.session ? <Button title="Sign in to view match" onPress={() => router.push({ pathname: '/auth', params: { returnTo: matchSharePath(id!) } })} /> : null}
    {valid && auth.session ? <Button title="Choose your sports" onPress={() => router.push('/apps')} /> : null}
  </View></Screen>;
}
