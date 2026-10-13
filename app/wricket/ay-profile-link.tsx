import { Stack } from 'expo-router';
import { StageLegacyRecord } from '@/components/sports/platform/StageLegacyRecord';
import { StageNotice, StagePage } from '@/components/sports/platform/StageUI';

export default function AuctionYodhaProfileLinkScreen() {
  return <StagePage focused title="Link playing history" eyebrow="ACCOUNT">
    <Stack.Screen options={{ headerShown: false }} />
    <StageLegacyRecord />
    <StageNotice>Linking an AuctionYodha player record connects your identity. It does not enter you in an auction or send an invitation.</StageNotice>
  </StagePage>;
}
