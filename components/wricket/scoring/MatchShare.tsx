import React, { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import type { CloudLiveMatch } from '@/lib/supabase/liveMatchApi';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/wricket/ui/Text';
import { Button } from '@/components/wricket/ui/Button';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { StatusBadge } from '@/components/wricket/ui/StatusBadge';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { matchShareSummary, matchShareUrl } from '@/lib/wricket/presentation/matchShare';
import { capturePoster } from '@/lib/wricket/presentation/capturePoster';
import { formatOver } from '@/lib/wricket/domain/scoring';

export function MatchShare({ match, onClose }: { match: CloudLiveMatch; onClose: () => void }) {
  const poster = useRef<View>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const data = matchShareSummary(match);
  const url = matchShareUrl(match.id, Platform.OS === 'web' ? window.location.origin
    : process.env.EXPO_PUBLIC_WRICKET_E2E === 'true' ? 'http://127.0.0.1:4173' : undefined);
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage(''); setFailed(false);
    try { await action(); }
    catch (cause) { if ((cause as { name?: string }).name !== 'AbortError') { setFailed(true); setMessage(cause instanceof Error ? cause.message : 'Sharing failed. Please try again.'); } }
    finally { busyRef.current = false; setBusy(false); }
  };
  const link = () => run(async () => {
    if (Platform.OS === 'web') { await navigator.clipboard.writeText(url); setMessage('Match link copied.'); }
    else await Share.share({ title: data.title, message: `${data.title}\n${url}`, url });
  });
  const exportImage = () => run(async () => {
    if (!poster.current || !size.width) throw new Error('The preview is still loading. Please try again.');
    const uri = await capturePoster(poster.current, 1080, Math.round(1080 * size.height / size.width));
    if (Platform.OS === 'web') {
      const anchor = document.createElement('a'); anchor.href = uri; anchor.download = `wricket-${match.id}.png`; anchor.click(); setMessage('Match image downloaded.');
    } else {
      if (!await Sharing.isAvailableAsync()) throw new Error('Image sharing is unavailable on this device.');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: data.title });
    }
  });
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!busy) onClose(); }}><Screen padded={false} edges={['top','bottom','left','right']} style={{ backgroundColor: colors.bg }}>
    <WricketHeader title="Share match" backTo="/wricket/live" onBack={() => { if (!busy) onClose(); }} />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      <View><Text variant="h1">Send the game.</Text><Text tone="muted" style={{ marginTop: 8 }}>Here’s what your friends will see.</Text></View>
      <View ref={poster} collapsable={false} onLayout={event => setSize(event.nativeEvent.layout)} style={styles.poster}>
        <View style={styles.row}><Text style={styles.brand}>wricket<Text style={styles.brand} tone="accent"> /</Text></Text><StatusBadge status={match.status} /></View>
        <Text variant="overline" tone="muted" style={{ marginTop: 25 }}>{data.tournament}</Text>
        <Text variant="h2" style={{ marginTop: 15 }}>{data.team}</Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 8 }}>vs {data.opponent}</Text>
        <View style={[styles.row, { marginVertical: 18, flexWrap: 'wrap' }]}><Text style={styles.score}>{data.score}</Text><Text variant="mono" tone="muted">{formatOver(data.balls)} overs</Text></View>
        {data.innings.filter(innings => innings.id !== match.innings?.id).map(innings => <View key={innings.id} style={styles.innings}><Text variant="caption" style={{ flex: 1 }}>{innings.team} · innings {innings.sequence}</Text><Text variant="mono">{innings.runs}/{innings.wickets}</Text></View>)}
        {data.terminal ? <Text variant="h3" tone="accent" style={{ marginTop: 20 }}>{data.result}</Text> : data.target ? <Text tone="accent">{Math.max(0, data.target - match.score.runs)} needed{data.overs ? ` from ${Math.max(0, data.overs * 6 - data.balls)} balls` : ''}.</Text> : null}
        <View style={styles.footer}><Text variant="overline" tone="muted">VIEW THE MATCH ON SPORTSTAGE</Text><Text variant="caption" tone="muted" style={{ marginTop: 8 }}>{url}</Text></View>
      </View>
      <Text variant="caption" tone="muted">Only match details are included. Organiser contact information stays private.</Text>
      {message ? <Text accessibilityRole={failed ? 'alert' : undefined} accessibilityLiveRegion="polite" tone={failed ? 'danger' : 'accent'}>{message}</Text> : null}
      {failed ? <Pressable accessibilityRole="button" accessibilityLabel="Select match link" onPress={() => setMessage(url)}><Text selectable>{url}</Text></Pressable> : null}
    </ScrollView>
    <View style={styles.actions}><Button title={Platform.OS === 'web' ? 'Copy match link' : 'Share match link'} disabled={busy} onPress={() => void link()} /><Button title="Export match image" variant="secondary" disabled={busy} loading={busy} onPress={() => void exportImage()} /></View>
  </Screen></Modal>;
}
const styles = StyleSheet.create({ content: { padding: 18, gap: 20 }, poster: { backgroundColor: '#19271b', borderWidth: 1, borderColor: '#3c5334', borderRadius: 18, padding: 22 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, brand: { fontFamily: fonts.display, fontSize: 23, lineHeight: 28, letterSpacing: -1.2 }, score: { fontFamily: fonts.display, fontSize: 48, lineHeight: 58, letterSpacing: -2, color: colors.text }, innings: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border }, footer: { marginTop: 25, paddingTop: 18, borderTopWidth: 1, borderColor: colors.border }, actions: { padding: 18, gap: 8, borderTopWidth: 1, borderColor: colors.border } });
