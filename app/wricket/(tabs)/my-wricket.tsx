import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/wricket/ui/Text';
import { MatchesSection } from '@/components/wricket/my-wricket/MatchesSection';
import { MyTeamsSection } from '@/components/wricket/my-wricket/MyTeamsSection';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { useAuth } from '@/components/providers/AuthProvider';
import { personalStatsApi, PersonalStats } from '@/lib/supabase/personalStatsApi';
import { LinkRow, SectionHeading } from '@/components/wricket/ui/DesignRows';
import { fonts } from '@/lib/wricket/presentation/design';
import { TournamentsScreen } from './index';
import StatsScreen from './stats';
import { MyCricketTasks } from '@/components/wricket/my-wricket/MyCricketTasks';
import { MyTournamentApplications } from '@/components/wricket/my-wricket/MyTournamentApplications';

const sections = [
  { id: 'matches', label: 'My matches', detail: 'Upcoming games, live scores and results', icon: 'ball' },
  { id: 'teams', label: 'My teams', detail: 'Your squads, invitations and team roles', icon: 'users' },
  { id: 'tournaments', label: 'My tournaments', detail: 'Organise competitions and follow their progress', icon: 'trophy' },
  { id: 'applications', label: 'My applications', detail: 'Tournament requests, review decisions and payment flags', icon: 'trophy' },
  { id: 'performance', label: 'Performance', detail: 'Your recorded batting, bowling and match history', icon: 'chart' },
] as const;

export default function MyWricketScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [record, setRecord] = useState<PersonalStats>();
  const [recordError, setRecordError] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    setRecord(undefined); setRecordError(false);
    if (auth.session) void personalStatsApi.get(auth.session.user.id).then(value => { if (active) setRecord(value); })
      .catch(() => { if (active) setRecordError(true); });
    return () => { active = false; };
  }, [auth.session]));
  const { section } = useLocalSearchParams<{ section?: string }>();
  const selected = sections.find(item => item.id === section);
  if (selected) return <Screen padded={false}>
    <WricketHeader title={selected.label} backTo="/wricket/my-wricket" onBack={() => router.setParams({ section: undefined })} />
    <View style={{ flex: 1 }}>
      {selected.id === 'matches' ? <MatchesSection /> : null}
      {selected.id === 'teams' ? <MyTeamsSection /> : null}
      {selected.id === 'tournaments' ? <TournamentsScreen embedded /> : null}
      {selected.id === 'performance' ? <StatsScreen embedded /> : null}
      {selected.id === 'applications' ? <ScrollView><MyTournamentApplications /></ScrollView> : null}
    </View>
  </Screen>;
  return <Screen padded={false} edges={['left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <View><Text variant="overline" tone="muted">YOUR GAME, IN ONE PLACE</Text>
        <Text variant="h1" style={{ marginTop: 9 }}>Hello, {auth.profile?.displayName?.split(' ')[0] ?? 'cricketer'}.</Text></View>
      <MyCricketTasks />
      <SectionHeading title="Your record" action="Full performance" onPress={() => router.push({ pathname: '/wricket/my-wricket', params: { section: 'performance' } })} />
      <View style={styles.record}>
        <Text variant="h3">{record?.matches ? 'A season taking shape.' : 'Your cricket story starts here.'}</Text>
        {record?.matches ? <View style={styles.metrics}>{[[record.matches, 'MATCHES'], [record.runs, 'RUNS'], [record.wickets, 'WICKETS']].map(([value, label]) => <View key={label} style={{ flex: 1 }}><Text style={styles.figure}>{value}</Text><Text variant="overline" style={{ fontSize: 8, letterSpacing: 0.5 }} tone="muted">{label}</Text></View>)}</View>
          : <Text variant="caption" tone="muted" style={{ marginTop: 9 }}>{recordError ? 'Your record could not be loaded. Open Performance to retry.' : record ? 'Play your first match to build your record.' : 'Loading your record…'}</Text>}
      </View>
      <View>
        {sections.filter(item => item.id !== 'performance').map(item => <LinkRow key={item.id} title={item.label} detail={item.detail} icon={item.icon}
          onPress={() => router.push({ pathname: '/wricket/my-wricket', params: { section: item.id } })} />)}
        <LinkRow title="Create a tournament" detail="Bring your next competition together" icon="plus" onPress={() => router.push('/wricket/tournament/new')} />
        <LinkRow title="Cricket profile" detail="Your account and linked player" icon="users" onPress={() => router.push('/wricket/me')} />
      </View>
    </ScrollView>
  </Screen>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 19, paddingBottom: 30, gap: 14 },
  record: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#465e38', backgroundColor: '#1d2d1d' },
  metrics: { flexDirection: 'row', gap: 10, paddingTop: 17 },
  figure: { fontFamily: fonts.display, fontSize: 26, lineHeight: 34, letterSpacing: -0.6, marginBottom: 6 },
});
