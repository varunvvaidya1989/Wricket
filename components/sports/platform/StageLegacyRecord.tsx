import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '@/components/providers/AuthProvider';
import { legacyPlayerLinkApi, type LegacyLinkResolution } from '@/lib/supabase/legacyPlayerLinkApi';
import { StageButton, StageIntro, StageNotice, StageText, stageColors as colors } from './StageUI';

export function StageLegacyRecord() {
  const auth = useAuth();
  const router = useRouter();
  const [resolution, setResolution] = useState<LegacyLinkResolution>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    setResolution(undefined); setSelected(undefined); setError(undefined); setSaved(false);
    if (!auth.profile) return;
    void legacyPlayerLinkApi.resolve(auth.profile.displayName).then(value => {
      if (active) { setResolution(value); if (value.candidates.length === 1) setSelected(value.candidates[0].playerId); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not check your previous record.'); });
    return () => { active = false; };
  }, [auth.profile, attempt]);
  const verified = resolution?.status === 'VERIFIED_MATCH';
  const connected = ['LINKED', 'AUTO_LINKED'].includes(resolution?.status ?? '');
  const connect = async () => {
    if (!selected || busy.current) return;
    busy.current = true;
    setSaving(true); setError(undefined);
    try {
      if (verified) await legacyPlayerLinkApi.confirm(selected);
      else await legacyPlayerLinkApi.request(selected);
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not connect this record.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <View style={{ gap: 18 }}>
    <StageIntro eyebrow="YOUR CRICKET HISTORY" title="Is this your record?" description="Review the player identity before connecting your previous playing history." />
    {error ? <StageNotice retry={() => setAttempt(value => value + 1)}>{error}</StageNotice> : !resolution ? <StageNotice>Checking your previous record…</StageNotice> : null}
    {saved ? <StageNotice>{verified ? 'Your verified player record is connected.' : 'Verification pending. Your account remains usable while support reviews the request.'}</StageNotice> : connected ? <StageNotice>A player record is already connected to this account.</StageNotice> : resolution?.status === 'NO_MATCH' ? <StageNotice>No previous player record is available for this account.</StageNotice> : resolution ? <>
      {resolution.candidates.map(candidate => <Pressable key={candidate.playerId} accessibilityRole="radio" accessibilityLabel={candidate.displayName} accessibilityState={{ checked: selected === candidate.playerId }} aria-checked={selected === candidate.playerId} onPress={() => setSelected(candidate.playerId)} style={{ minHeight: 76, padding: 16, gap: 6, borderRadius: 16, borderWidth: 1, borderColor: selected === candidate.playerId ? colors.accent : colors.border, backgroundColor: colors.surface }}><StageText variant="rowTitle">{candidate.displayName}</StageText><StageText variant="small" muted>AuctionYodha player record</StageText></Pressable>)}
      <StageNotice>{verified ? 'Your verified account contact matches this record. Review it before confirming.' : 'A matching name is a candidate, not proof of ownership. This request requires verification.'}</StageNotice>
      <StageButton primary title={verified ? 'Connect verified record' : 'Request record link'} disabled={!selected} loading={saving} onPress={() => void connect()} />
    </> : null}
    <StageButton title={connected || saved ? 'Back to account' : 'This isn’t me'} disabled={saving} onPress={() => router.canGoBack() ? router.back() : router.replace('/account')} />
  </View>;
}
