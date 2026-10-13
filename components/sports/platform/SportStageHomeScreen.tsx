import { type Href, useRouter } from 'expo-router';
import { useAuth } from '@/components/providers/AuthProvider';
import { MatchLauncher } from './MatchLauncher';
import { StageButton, StageIntro, StageList, StageLiveCard, StageNotice, StagePage, StageRow, StageSportGrid, StageText } from './StageUI';
import { connectedStageSports, sportEntry, stageSports } from '@/lib/sports/platform/connectedExperience';
import { sportStageContent } from '@/lib/sports/platform/sportLiveContent';
import { useStageDiscovery } from '@/hooks/useStageDiscovery';
import { useStageResume } from '@/hooks/useStageResume';

export function SportStageHomeScreen() {
  const auth = useAuth();
  const router = useRouter();
  const discovery = useStageDiscovery();
  const connected = connectedStageSports(auth.profile?.connectedSports ?? []);
  const resume = useStageResume(auth.session?.user.id, auth.profile?.connectedSports ?? []);
  return <StagePage>
    <StageIntro eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()} title="Back to your game." description="A little cricket. A little court time. All in one place." />
    {resume.matches.length ? <StageList>{resume.matches.slice(0, 2).map(match => <StageRow key={match.id} title={match.title} detail={match.detail} symbol="↗" onPress={() => router.push(match.route as Href)} />)}</StageList> : null}
    {resume.error ? <StageNotice>{resume.error} Open your sport to check your match.</StageNotice> : null}
    <StageText variant="eyebrow" muted>YOUR SPORTS</StageText>
    <StageSportGrid current={auth.profile?.primarySport?.code} sports={auth.session && connected.length ? connected : stageSports} onChoose={code => {
      const route = sportEntry(code, Boolean(auth.session), auth.profile?.connectedSports ?? []);
      if (route) router.push(route as Href);
    }} />
    <StageText variant="eyebrow" muted>HAPPENING NOW</StageText>
    {discovery.loading ? <StageNotice>Loading live matches…</StageNotice> : null}
    {discovery.error ? <StageNotice retry={discovery.reload}>{discovery.error}</StageNotice> : null}
    {discovery.page.items.length ? discovery.page.items.slice(0, 3).map(match => <StageLiveCard key={match.scoringMatchId} sport={sportStageContent(match.sportCode).name} participantA={match.participantA} participantB={match.participantB} competition={match.competitionName} score={match.headlineScore} status={Date.parse(match.staleAfter) <= Date.now() ? 'Waiting for live update' : match.status === 'LIVE' ? 'Live' : match.status.toLowerCase().replaceAll('_', ' ')} onPress={() => router.push({ pathname: '/match', params: { id: match.scoringMatchId } })} />)
      : !discovery.loading && !discovery.error ? <StageNotice>No public matches are live right now. Explore competitions and upcoming games.</StageNotice> : null}
    {discovery.page.items.length > 3 || discovery.page.hasMore ? <StageButton title="See all live matches" onPress={() => router.navigate({ pathname: '/explore', params: { category: 'Matches' } })} /> : null}
    <MatchLauncher />
  </StagePage>;
}
