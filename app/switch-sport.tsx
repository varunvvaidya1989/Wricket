import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageIntro, StagePage, StageSportGrid } from '@/components/sports/platform/StageUI';
import { sportEntry, stageSports } from '@/lib/sports/platform/connectedExperience';

export default function SwitchSport() {
  const router = useRouter();
  const auth = useAuth();
  const { current } = useLocalSearchParams<{ current?: string }>();
  return <StagePage focused title="Switch sport">
    <StageIntro eyebrow="YOUR SPORTS" title="Where to next?" description="Switching sports keeps your current match available to resume." />
    <StageSportGrid sports={stageSports} current={current} onChoose={code => {
      const destination = sportEntry(code, Boolean(auth.session), auth.profile?.connectedSports ?? []);
      if (destination) router.push(destination as Href);
    }} />
    <StageButton title="All-sports home" onPress={() => router.navigate('/live')} />
    <StageButton title="Manage connected sports" onPress={() => auth.session ? router.push('/account') : router.push({ pathname: '/auth', params: { returnTo: '/account' } })} />
  </StagePage>;
}
