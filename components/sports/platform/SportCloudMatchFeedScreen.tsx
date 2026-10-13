import * as Linking from 'expo-linking';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, Share, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { TournamentSponsors } from '@/components/sponsors/TournamentSponsors';
import { RacquetScorePanel } from '@/components/sports/scoring/RacquetScorePanel';
import { SPORT_CONFIGS, SPORT_PRESENTATION, activePointEvents, replay, sportRulesSummary, type ScoringSportId } from '@/lib/sports/scoring';
import { buildSportMatchTimeline } from '@/lib/sports/platform/sportMatchTimeline';
import { sportScoringApi, type SportCloudMatchFeed } from '@/lib/supabase/sportScoringApi';
import { supabaseErrorMessage } from '@/lib/supabase/errorMessage';
import { StageButton, StageIntro, StageList, StageNotice, StagePage, StageRow, StageText, stageColors as colors } from './StageUI';

export function SportCloudMatchFeedScreen({ sportId }: { sportId: ScoringSportId }) {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const id = params.id;
  const tab = params.tab === 'history' || params.tab === 'info' ? params.tab : 'watch';
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [feed, setFeed] = useState<SportCloudMatchFeed>();
  const [feedOwner, setFeedOwner] = useState<string>();
  const owner = `${auth.session?.user.id ?? ''}:${id}`;
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [error, setError] = useState<string>();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareError, setShareError] = useState<string>();
  const generation = useRef(0);
  const load = useCallback(async (silent = false) => {
    const request = ++generation.current;
    if (!id) { setError('The match feed link is incomplete.'); setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const next = await sportScoringApi.feed(id);
      if (request !== generation.current) return;
      const connected = auth.profile?.connectedSports.find(sport => sport.code === presentation.catalogCode && sport.accessStatus === 'ACTIVE');
      if (!connected || connected.id !== next.sportId) throw new Error(`This match is not available with your current ${config.name} app selection.`);
      setFeed(next); setFeedOwner(owner); setError(undefined);
    } catch (cause) {
      if (request === generation.current) setError(supabaseErrorMessage(cause, 'Could not load this match feed.'));
    } finally { if (request === generation.current) setLoading(false); }
  }, [auth.profile?.connectedSports, config.name, id, owner, presentation.catalogCode]);
  useFocusEffect(useCallback(() => {
    void load();
    if (!id) return;
    const unsubscribe = sportScoringApi.subscribe(id, () => void load(true), setError, setRealtimeConnected);
    return () => { generation.current++; unsubscribe(); };
  }, [id, load]));
  const view = useMemo(() => {
    if (!feed || feed.id !== id || feedOwner !== owner) return undefined;
    const options = feed.rulesSnapshot.options && typeof feed.rulesSnapshot.options === 'object' && !Array.isArray(feed.rulesSnapshot.options) ? feed.rulesSnapshot.options as Record<string, boolean | number | string | undefined> : {};
    const settings = { initialServer: feed.rulesSnapshot.initial_server === 1 ? 1 as const : 0 as const, options };
    const sideNames = [feed.participantA, feed.participantB] as const;
    return { options, sideNames, state: replay(config, activePointEvents(feed.events), settings), timeline: buildSportMatchTimeline(config, feed.events, sideNames, settings) };
  }, [config, feed, feedOwner, id, owner]);
  if (loading && !view) return <StagePage focused title="Match view" eyebrow={config.name.toUpperCase()}><StageNotice>Opening the match · getting the latest score…</StageNotice></StagePage>;
  if (!feed || !view) return <StagePage focused title="Match view" eyebrow={config.name.toUpperCase()}><StageIntro title="Match unavailable." description={error ?? 'This match could not be restored for your account.'} /><StageButton title="Try again" onPress={() => void load()} /></StagePage>;
  const header = tab === 'history' ? 'Rally history' : tab === 'info' ? 'Match information' : `${feed.participantA} vs ${feed.participantB}`;
  const share = async () => {
    setShareError(undefined);
    try {
      const url = Linking.createURL('match', { queryParams: { id: feed.id } });
      await Share.share({ title: `${config.name} match`, message: `${feed.participantA} vs ${feed.participantB} · ${feed.headlineScore}\n${url}`, url });
    } catch (cause) { setShareError(supabaseErrorMessage(cause, 'Sharing is unavailable on this device.')); }
  };
  return <StagePage focused title={header} eyebrow={`${config.name.toUpperCase()} · ${feed.status.replaceAll('_', ' ')}`} onBack={tab !== 'watch' ? () => router.setParams({ tab: 'watch' }) : undefined}>
    {error ? <StageNotice retry={() => void load(true)}>{error} The last loaded score remains visible.</StageNotice> : null}
    {tab === 'watch' ? <>
      <RacquetScorePanel config={config} state={view.state} sideNames={view.sideNames} accent={colors.accent} />
      {view.state.isComplete && view.state.winner !== undefined ? <StageIntro eyebrow="MATCH WINNER" title={view.sideNames[view.state.winner]} description="Completed result from the recorded match." /> : null}
      <StageNotice>{feed.status.replaceAll('_', ' ')} · {realtimeConnected ? 'Live updates connected' : 'Live updates reconnecting'} · Score updated {new Date(feed.updatedAt).toLocaleString()}</StageNotice>
      {feed.competitionId ? <TournamentSponsors key={feed.competitionId} parent={{ kind: 'sport', id: feed.competitionId }} placement="match" /> : null}
      <StageText variant="eyebrow" muted>MATCH PROGRESS</StageText>
      {view.timeline.length ? <View style={styles.timeline}>{view.timeline.slice(0, 3).map(item => <FeedEvent key={item.event.sequence} item={item} />)}</View> : <StageNotice>Waiting for the first rally. Recorded updates will appear here.</StageNotice>}
      <StageList><StageRow title="Rally history" detail="Recorded rallies and corrections" symbol="↗" onPress={() => router.setParams({ tab: 'history' })} /><StageRow title="Match information" detail="Players, venue and selected rules" symbol="↗" onPress={() => router.setParams({ tab: 'info' })} /></StageList>
      <StageButton title="Share match" onPress={() => setShareOpen(true)} />
    </> : tab === 'history' ? <>
      <StageIntro eyebrow="MATCH UPDATES" title="Every rally, in order." description="Latest recorded updates first, including corrections." />
      {view.timeline.length ? <View style={styles.timeline}>{view.timeline.map(item => <FeedEvent key={item.event.sequence} item={item} />)}</View> : <StageNotice>No rallies recorded yet.</StageNotice>}
    </> : <>
      <StageIntro eyebrow="MATCH FACTS" title="The essentials." description="Players and the format selected before play." />
      <View style={styles.facts}>{[{ label: 'Side A', value: feed.sideAPlayers.join(' / ') }, { label: 'Side B', value: feed.sideBPlayers.join(' / ') }, { label: 'Format', value: feed.matchFormat.toLowerCase() }, { label: 'Match rules', value: sportRulesSummary(sportId, view.options) }, { label: 'First server', value: view.sideNames[feed.rulesSnapshot.initial_server === 1 ? 1 : 0] }, { label: 'Venue', value: typeof feed.rulesSnapshot.venue === 'string' ? feed.rulesSnapshot.venue : 'Not specified' }, { label: 'Competition', value: feed.competitionName }].map(item => <View key={item.label} style={styles.fact}><StageText variant="small" muted>{item.label}</StageText><StageText variant="rowTitle">{item.value}</StageText></View>)}</View>
    </>}
    <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}><View style={styles.overlay}><View style={styles.dialog}><ScrollView contentContainerStyle={{ gap: 16 }}>
      <StageIntro eyebrow="MATCH LINK" title="Share the match." description="Preview the current score, then share the spectator link." />
      <RacquetScorePanel config={config} state={view.state} sideNames={view.sideNames} accent={colors.accent} />
      {shareError ? <StageNotice>{shareError}</StageNotice> : null}
      <StageButton primary title="Share spectator link" onPress={() => void share()} /><StageButton title="Back to match" onPress={() => setShareOpen(false)} />
    </ScrollView></View></View></Modal>
  </StagePage>;
}

function FeedEvent({ item }: { item: ReturnType<typeof buildSportMatchTimeline>[number] }) {
  const date = new Date(item.event.createdAt);
  return <View style={styles.event}><View style={styles.sequence}><StageText variant="eyebrow" style={{ color: colors.accent, letterSpacing: 0 }}>{item.marker}</StageText></View><View style={{ flex: 1, minWidth: 0, gap: 4 }}><StageText variant="rowTitle">{item.title}</StageText><StageText variant="small" muted>{item.description}</StageText><StageText variant="eyebrow" muted>{Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleTimeString()}</StageText></View></View>;
}

const styles = StyleSheet.create({
  timeline: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden' },
  event: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', gap: 12 },
  sequence: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: '#42563a', backgroundColor: '#263b25', alignItems: 'center', justifyContent: 'center' },
  facts: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden' },
  fact: { padding: 16, gap: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  overlay: { flex: 1, padding: 18, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)' },
  dialog: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 18, maxHeight: '95%', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 16, backgroundColor: colors.bg, gap: 18 },
});
