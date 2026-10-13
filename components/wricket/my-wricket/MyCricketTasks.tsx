import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/components/providers/AuthProvider';
import { Text } from '@/components/wricket/ui/Text';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { SectionHeading, TaskRow } from '@/components/wricket/ui/DesignRows';
import { CricketTasks, getCricketTasks } from '@/lib/supabase/cricketTasksApi';

export function MyCricketTasks({ compact = false }: { compact?: boolean }) {
  const { session } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<CricketTasks>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setTasks(undefined);
    setError(false);
    if (session) void getCricketTasks(session.user.id).then(value => { if (active) setTasks(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
    // Explicit retry token re-runs this focus effect after a failed request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, attempt]));
  if (!session) return null;
  if (error) return <StateNotice title="Tasks unavailable" detail="Your matches and organiser tasks could not be loaded."
    error action={{ label: 'Try again', onPress: () => setAttempt(value => value + 1) }} />;
  if (!tasks) return <Text tone="muted">Loading your tasks…</Text>;
  return <View style={styles.list}>
    {!compact && (tasks.matches.length || tasks.tournaments.length) ? <SectionHeading title="Needs your attention" /> : null}
    {tasks.matches.slice(0, compact ? 1 : 2).map(match => <TaskRow key={match.id}
      title={compact ? `You’re scoring ${match.label}` : 'Continue scoring'} detail={compact ? 'Pick up your scoring session.' : match.label}
      onPress={() => router.push({ pathname: '/wricket/match/[id]/score', params: { id: match.id } })} />)}
    {!compact ? tasks.tournaments.slice(0, 1).map(tournament => <TaskRow key={tournament.id} organiser
      title="Manage your tournament" detail={tournament.name}
      onPress={() => router.push({ pathname: '/wricket/tournament/[id]', params: { id: tournament.id, tab: 'settings' } })} />) : null}
  </View>;
}
const styles = StyleSheet.create({ list: { gap: 14 } });
