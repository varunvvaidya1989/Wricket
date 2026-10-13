import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageIntro, StageList, StageNotice, StagePage, StageRow, StageText, stageColors as colors } from '@/components/sports/platform/StageUI';
import { useGlobalProfile } from '@/hooks/useGlobalProfile';
import { sportResultsApi, type MySportStatistic } from '@/lib/supabase/sportResultsApi';
import { sportLetters } from '@/lib/sports/platform/connectedExperience';

export default function GlobalProfileScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const preview = params.view === 'public';
  const accountId = auth.session?.user.id;
  const { data, loading, error, reload } = useGlobalProfile(accountId);
  const [cloudStats, setCloudStats] = useState<MySportStatistic[]>([]);
  const [statsError, setStatsError] = useState<string>();
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsAttempt, setStatsAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setCloudStats([]); setStatsError(undefined); setStatsLoading(true);
    if (!accountId) { setStatsLoading(false); return; }
    void sportResultsApi.listMine().then(result => { if (active) setCloudStats(result); })
      .catch(cause => { if (active) setStatsError(cause instanceof Error ? cause.message : 'Could not load match records.'); })
      .finally(() => { if (active) setStatsLoading(false); });
    return () => { active = false; };
  }, [accountId, statsAttempt]);
  return <StagePage focused title={preview ? 'Public profile preview' : 'Your profile'}>
    {!data && loading ? <StageNotice>Loading your profile…</StageNotice> : null}
    {error ? <StageNotice retry={() => void reload()}>{error}</StageNotice> : null}
    {data ? <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {data.profile.avatarUrl ? <Image accessible={false} source={{ uri: data.profile.avatarUrl }} style={{ width: 70, height: 70, borderRadius: 22 }} /> : <View style={{ width: 70, height: 70, borderRadius: 22, backgroundColor: '#2c4226', borderWidth: 1, borderColor: '#536d44', justifyContent: 'center', alignItems: 'center' }}><StageText aria-hidden variant="title" style={{ fontSize: 24, color: colors.accent }}>{initials(data.profile.displayName)}</StageText></View>}
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}><StageText variant="title" style={{ fontSize: 25, lineHeight: 30 }}>{data.profile.displayName}</StageText><StageText variant="small" muted>{data.sports.map(summary => summary.sport.name).join(' · ') || 'SportStage member'}</StageText></View>
      </View>
      {preview ? <><StageIntro eyebrow="PUBLIC IDENTITY" title="How players see you." description="Your name and photo identify you to other players. Email and mobile stay in your private account settings." /><StageNotice>This is a preview of your identity. Public sport cards are shared only through each sport’s visibility settings.</StageNotice><StageButton title="Edit identity" onPress={() => router.push('/account?section=identity')} /></> : <>
      <StageButton title="View public profile" onPress={() => router.push('/profile?view=public')} />
      <StageText variant="eyebrow" muted>YOUR SPORTS</StageText>
      {data.partial ? <StageNotice retry={() => void reload()}>Some cricket activity is unavailable. Your sport access is unaffected.</StageNotice> : null}
      {statsError ? <StageNotice retry={() => setStatsAttempt(value => value + 1)}>{statsError}</StageNotice> : null}
      <StageList>{data.sports.map(summary => {
        const stat = cloudStats.find(item => item.sportCode === summary.sport.code);
        const detail = !summary.available ? 'Profile reserved · activates at launch' : summary.headlineStats.length ? summary.headlineStats.map(item => `${item.value} ${item.label.toLowerCase()}`).join(' · ') : stat ? `${stat.matchesPlayed} played · ${stat.wins} won · ${stat.losses} lost` : statsLoading ? 'Loading match records…' : statsError || (summary.sport.code === 'CRICKET' && data.partial) ? 'Match records unavailable' : 'No recorded activity yet.';
        return <StageRow key={summary.sport.code} symbol={sportLetters[summary.sport.code]} title={summary.sport.name} detail={detail} onPress={() => summary.available ? router.push((summary.sport.code === 'CRICKET' ? '/wricket/my-wricket' : summary.sport.appRoute ?? '/apps') as never) : router.push('/account?section=sports')} />;
      })}</StageList>
      {!data.sports.length ? <StageNotice>No sports connected. Choose your sports in Account & privacy.</StageNotice> : null}
      <StageText variant="eyebrow" muted>YOUR ACCOUNT</StageText>
      <StageList><StageRow symbol="↗" title="Account & privacy" detail="Identity, connected sports and security" onPress={() => router.push('/account')} /><StageRow symbol="↗" title="Notifications" detail="Invitations and match updates" onPress={() => router.push('/notifications')} /><StageRow symbol="?" title="Help with a task" detail="How to use SportStage" onPress={() => router.push('/manual')} /></StageList>
      </>}
    </> : null}
  </StagePage>;
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'S'; }

