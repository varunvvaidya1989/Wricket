import { type Href, useRouter } from 'expo-router';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageIntro, StageList, StageNotice, StagePage, StageRow, StageText } from './StageUI';
import { connectedStageSports, sportEntry, sportLetters } from '@/lib/sports/platform/connectedExperience';
import { sportLaunchDescription } from '@/lib/sports/platform/sportDashboard';

export function MySportsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const sports = connectedStageSports(auth.profile?.connectedSports ?? []);
  return <StagePage>
    <StageIntro eyebrow="YOUR SPACE" title="Made for your game." description="Matches, teams and records for the sports you play." />
    {auth.error ? <StageNotice retry={() => { void auth.refreshProfile(); }}>Your connected sports could not be refreshed. Check your connection and try again.</StageNotice> : null}
    {sports.length ? <StageList>{sports.map(sport => <StageRow key={sport.code} title={sport.name} detail={sportLaunchDescription(sport.code)} symbol={sportLetters[sport.code]} onPress={() => {
      const route = sportEntry(sport.code, Boolean(auth.session), auth.profile?.connectedSports ?? []);
      if (route) router.push(route as Href);
    }} />)}</StageList> : !auth.error ? <StageNotice>Connect a sport to find your matches, teams and records here.</StageNotice> : null}
    <StageText variant="eyebrow" muted>YOUR NEXT STEPS</StageText>
    <StageList>
      <StageRow title="Invitations and updates" detail="Review team invitations and notifications" symbol="↗" onPress={() => router.push('/notifications')} />
      <StageRow title="Your profile" detail="Your sports, records and account details" symbol="◎" onPress={() => router.push('/profile')} />
      <StageRow title="Following" detail="Matches and competitions you follow" symbol="♡" onPress={() => router.push('/feed')} />
    </StageList>
    <StageButton title="Choose more sports" onPress={() => router.push('/account')} />
  </StagePage>;
}
