import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Share, View } from 'react-native';
import { StageButton, StageIntro, StageNotice, StagePage, StageStateArt, StageText, stageColors as colors } from '@/components/sports/platform/StageUI';
import { sportDiscoveryApi, type SportPublicPlayerCard } from '@/lib/supabase/sportDiscoveryApi';

export default function PublicPlayerCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [card, setCard] = useState<SportPublicPlayerCard>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setCard(undefined); setError(undefined); setLoading(true);
    if (!id) { setLoading(false); return; }
    void sportDiscoveryApi.publicPlayerCard(id).then(value => { if (active) setCard(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load this player card.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attempt]);
  const share = async () => {
    if (!card) return;
    const url = Linking.createURL(`player/${card.sportProfileId}`);
    try { await Share.share({ message: `${card.displayName} on SportStage: ${url}` }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not share this player card.'); }
  };
  return <StagePage focused title="Player profile">
    {loading ? <StageNotice>Opening player card…</StageNotice> : null}
    {error ? <StageNotice retry={() => setAttempt(value => value + 1)}>{error}</StageNotice> : null}
    {!loading && !error && !card ? <><StageStateArt symbol="↻" /><StageIntro eyebrow="PLAYER CARD UNAVAILABLE" title="This profile is private." description="This player has not made a public card available." /></> : null}
    {card ? <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {card.avatarUrl ? <Image source={{ uri: card.avatarUrl }} style={{ width: 70, height: 70, borderRadius: 22 }} /> : <View style={{ width: 70, height: 70, borderRadius: 22, backgroundColor: '#2c4226', borderWidth: 1, borderColor: '#536d44', justifyContent: 'center', alignItems: 'center' }}><StageText variant="title" style={{ fontSize: 24, color: colors.accent }}>{initials(card.displayName)}</StageText></View>}
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}><StageText variant="title" style={{ fontSize: 25, lineHeight: 30 }}>{card.displayName}</StageText><StageText variant="small" muted>{card.sportCode.replaceAll('_', ' ')}{card.headline ? ` · ${card.headline}` : ''}</StageText></View>
      </View>
      <StageText variant="eyebrow" muted>SHARED SPORTSTAGE PROFILE</StageText>
      <StageNotice>Only this player’s published sport identity is shown. Private contact details and account settings are excluded.</StageNotice>
      <StageButton title="Share player card" onPress={() => void share()} />
    </> : null}
  </StagePage>;
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'S'; }

