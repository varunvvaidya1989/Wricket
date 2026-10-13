import { type Href, useRouter } from 'expo-router';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageIntro, StagePage, StageSportGrid } from '@/components/sports/platform/StageUI';
import { sportEntry, stageSports } from '@/lib/sports/platform/connectedExperience';

export default function StartMatch() {
  const router = useRouter();
  const auth = useAuth();
  return <StagePage focused title="Start a match">
    <StageIntro eyebrow="START A MATCH" title="Which sport today?" description="Choose a sport, then review the players and rules." />
    <StageSportGrid setup sports={stageSports} onChoose={code => {
      const destination = sportEntry(code, Boolean(auth.session), auth.profile?.connectedSports ?? [], true);
      if (destination) router.push(destination as Href);
    }} />
  </StagePage>;
}
