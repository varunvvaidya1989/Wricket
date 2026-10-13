import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { StageButton, StageText, stageColors as colors } from '@/components/sports/platform/StageUI';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { rateLabel } from '@/lib/sports/analytics/analyze';
import type { PlayerAnalytics, Rate } from '@/lib/sports/analytics/types';

const BLUE = '#83cfff';

/** Reanimate when the filtered sample changes; respect the OS motion preference. */
function useReveal(key: string) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: 650, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [key, progress, reduced]);
  return progress;
}

export function RateDiagram({ items, unit = 'rallies' }: { items: { label: string; rate: Rate }[]; unit?: 'rallies' | 'matches' | 'observations' | 'finishes' }) {
  const key = items.map(item => `${item.rate.won}:${item.rate.total}`).join('|');
  const reveal = useReveal(key);
  const [selected, setSelected] = useState<string>();
  return <View style={{ gap: 15 }}>{items.map(({ label, rate }, index) => {
    const percent = rate.total ? rate.won / rate.total * 100 : 0;
    return <Pressable key={label} accessibilityRole="button" accessibilityLabel={`${label}: ${rateLabel(rate)}, ${rate.won} of ${rate.total} ${unit}`} accessibilityState={{ selected: selected === label }} onPress={() => setSelected(label)} style={{ gap: 7 }}>
      <View style={styles.between}><StageText>{label}</StageText><StageText style={{ color: index % 2 ? BLUE : colors.accent }}>{rateLabel(rate)}</StageText></View>
      <View style={styles.track}><Animated.View style={{ height: '100%', borderRadius: 8, backgroundColor: index % 2 ? BLUE : colors.accent, width: reveal.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${percent}%`] }) }} /></View>
      <StageText variant="small" muted>{rate.total ? `${rate.won} / ${rate.total} ${unit}${selected === label && (unit === 'rallies' || unit === 'matches') ? ` · ${rate.total - rate.won} lost` : ''}` : 'No observations yet'}</StageText>
    </Pressable>;
  })}</View>;
}

export function ServeFlow({ serve, returns }: { serve: Rate; returns: Rate }) {
  return <View style={{ gap: 12 }}>{[{ label: 'Serving', rate: serve }, { label: 'Receiving', rate: returns }].map(({ label, rate }) => <View key={label} style={styles.flow}>
    <View style={styles.flowSource}><StageText variant="rowTitle">{label}</StageText><StageText variant="small" muted>{rate.total} rallies</StageText></View>
    <StageText style={{ color: colors.accent }}>→</StageText>
    <View style={{ flex: 1, gap: 5 }}><View style={[styles.flowTarget, { borderColor: colors.accent }]}><StageText style={{ color: colors.accent }}>Won {rate.won}</StageText></View><View style={[styles.flowTarget, { borderColor: BLUE }]}><StageText style={{ color: BLUE }}>Lost {rate.total - rate.won}</StageText></View></View>
  </View>)}</View>;
}

export function CourtDiagram({ zones, table = false }: { zones: PlayerAnalytics['zones']; table?: boolean }) {
  const [selected, setSelected] = useState<string>();
  const total = zones.reduce((sum, zone) => sum + zone.count, 0);
  const reveal = useReveal(zones.map(zone => zone.count).join(':'));
  const selectedZone = zones.find(zone => zone.label === selected);
  return <View style={{ gap: 12 }}>
    <View style={[styles.court, table && { borderRadius: 5 }]}>
      <View style={styles.opponentCourt}><View style={styles.centerLine} /><StageText variant="small" muted>OPPONENT SIDE</StageText></View>
      <View style={styles.net}><StageText variant="eyebrow" style={{ color: colors.bg }}>NET</StageText></View>
      {[...zones].reverse().map(zone => {
        const share = total ? zone.count / total : 0;
        return <Pressable key={zone.label} accessibilityRole="button" accessibilityLabel={`${zone.label}, ${zone.count} recorded winning finishes`} accessibilityState={{ selected: zone.label === selected }} onPress={() => setSelected(zone.label)} style={[styles.courtZone, selected === zone.label && { borderColor: colors.accent, borderWidth: 2 }]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.accent, opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, 0.04 + share * 0.48] }) }]} />
          <StageText variant="small">{zone.label}</StageText><StageText variant="rowTitle" style={{ color: colors.accent }}>{total ? `${Math.round(share * 100)}%` : '—'}</StageText>
        </Pressable>;
      })}
    </View>
    <StageText variant="small" muted accessibilityLiveRegion="polite">{selectedZone ? `${selectedZone.label}: ${selectedZone.count} of ${total} mapped winning finishes.` : `${total} mapped winning finishes. Tap a zone to inspect it.`} Positions describe the hitter, not ball landing locations.</StageText>
  </View>;
}

export function TrendDiagram({ trend }: { trend: PlayerAnalytics['trend'] }) {
  const recent = trend.slice(0, 10).reverse();
  const [selectedId, setSelectedId] = useState<string>();
  const selected = recent.find(item => item.id === selectedId) ?? recent.at(-1);
  const reveal = useReveal(recent.map(item => `${item.id}:${item.points.won}:${item.points.total}`).join('|'));
  return <View style={{ gap: 12 }}>
    <View style={styles.chart}>
      <View pointerEvents="none" style={styles.midline}><StageText variant="small" muted>50%</StageText></View>
      {recent.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Match ${index + 1}, ${item.opponent}, ${item.result}, ${rateLabel(item.points)} rallies won`} accessibilityState={{ selected: selected?.id === item.id }} onPress={() => setSelectedId(item.id)} style={styles.column}>
        <View style={styles.barSpace}><Animated.View style={{ width: '80%', minHeight: item.points.total ? 2 : 0, height: reveal.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${item.points.total ? item.points.won / item.points.total * 100 : 0}%`] }), borderRadius: 6, backgroundColor: item.result === 'W' ? colors.accent : BLUE, opacity: selected?.id === item.id ? 1 : 0.55 }} /></View>
        <StageText variant="small" muted>{index + 1}</StageText>
      </Pressable>)}
    </View>
    <StageText variant="small" muted accessibilityLiveRegion="polite">{selected ? `${new Date(selected.date).toLocaleDateString()} · ${selected.opponent} · ${selected.result} · ${selected.points.won}/${selected.points.total} rallies won (${rateLabel(selected.points)})` : 'Play a match to start your trend.'}</StageText>
    <StageText variant="small" muted>Oldest → newest · rally win percentage · green = match won, blue = other result. Tap a bar for details.</StageText>
  </View>;
}

export function FinishDiagram({ items }: { items: { label: string; count: number }[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return <RateDiagram items={items.map(item => ({ label: item.label, rate: { won: item.count, total } }))} unit="finishes" />;
}

export function MatchStory({ trend }: { trend: PlayerAnalytics['trend'] }) {
  const [matchId, setMatchId] = useState<string>();
  const playable = trend.filter(item => item.timeline.length);
  const selected = playable.find(item => item.id === matchId) ?? playable[0];
  return <View style={{ gap: 14 }}>
    <ScrollView horizontal contentContainerStyle={{ gap: 8 }} showsHorizontalScrollIndicator={false}>{playable.slice(0, 10).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: selected?.id === item.id }} onPress={() => setMatchId(item.id)} style={[styles.storyMatch, item.id === selected?.id && { borderColor: colors.accent }]}><StageText variant="small">{item.opponent} · {item.result}</StageText></Pressable>)}</ScrollView>
    {selected ? <RallyPlayback key={`${selected.id}:${selected.points.total}`} match={selected} /> : <StageText muted>No rallies available to replay.</StageText>}
  </View>;
}

function RallyPlayback({ match }: { match: PlayerAnalytics['trend'][number] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useFocusEffect(useCallback(() => () => setPlaying(false), []));
  const reduced = useReducedMotion();
  const scroll = useRef<FlatList<PlayerAnalytics['trend'][number]['timeline'][number]>>(null);
  const point = match.timeline[Math.min(index, match.timeline.length - 1)];
  const total = index + 1;
  const reveal = useReveal(`${match.id}:${index}`);
  useEffect(() => {
    if (!playing || reduced) return;
    const timer = setInterval(() => setIndex(current => Math.min(current + 1, match.timeline.length - 1)), 900);
    return () => clearInterval(timer);
  }, [playing, reduced, match.timeline.length]);
  useEffect(() => {
    if (index === match.timeline.length - 1 || reduced) setPlaying(false);
    scroll.current?.scrollToOffset({ offset: Math.max(0, index * 50 - 100), animated: !reduced });
  }, [index, match.timeline.length, reduced]);
  return <View style={{ gap: 14 }}>
    <View style={styles.between}><StageText variant="rowTitle">Rally {total} / {match.timeline.length}</StageText><StageText style={{ color: point.won ? colors.accent : BLUE }}>{point.won ? 'Your side won' : 'Opponent won'}</StageText></View>
    <View style={styles.momentum}>
      <View style={styles.momentumHalf}><StageText style={styles.storyScore}>{point.wonSoFar}</StageText><StageText variant="small" muted>YOUR RALLIES</StageText></View>
      <Animated.View style={[styles.pulse, { opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }), backgroundColor: point.won ? colors.accent : BLUE, transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]} />
      <View style={styles.momentumHalf}><StageText style={[styles.storyScore, { color: BLUE }]}>{total - point.wonSoFar}</StageText><StageText variant="small" muted>OPPONENT RALLIES</StageText></View>
    </View>
    <FlatList ref={scroll} horizontal data={match.timeline} extraData={index} keyExtractor={item => String(item.sequence)} showsHorizontalScrollIndicator={false} getItemLayout={(_, step) => ({ length: 50, offset: step * 50, index: step })} ItemSeparatorComponent={() => <View style={{ width: 6 }} />} renderItem={({ item, index: step }) => <Pressable accessibilityRole="button" accessibilityLabel={`Rally ${step + 1}, ${item.won ? 'won' : 'lost'}`} accessibilityState={{ selected: step === index }} onPress={() => { setPlaying(false); setIndex(step); }} style={{ width: 44, minHeight: 44, justifyContent: 'center' }}><View style={{ height: step === index ? 40 : 26, borderRadius: 5, backgroundColor: item.won ? colors.accent : BLUE, opacity: step > index ? 0.25 : 1 }} /></Pressable>} />
    <View style={styles.flow}><StageButton title="Previous" disabled={index === 0} onPress={() => { setPlaying(false); setIndex(index - 1); }} /><StageButton title={playing ? 'Pause' : index === match.timeline.length - 1 ? 'Replay' : 'Play'} disabled={reduced} primary onPress={() => { if (index === match.timeline.length - 1) setIndex(0); setPlaying(!playing); }} /><StageButton title="Next" disabled={index === match.timeline.length - 1} onPress={() => { setPlaying(false); setIndex(index + 1); }} /></View>
    <StageText variant="small" muted accessibilityLiveRegion={playing ? 'none' : 'polite'}>{point.serving ? 'Your side served' : 'Your side received'} · {point.wonSoFar === total - point.wonSoFar ? 'Level on rallies' : `${Math.abs(point.wonSoFar * 2 - total)}-rally ${point.wonSoFar * 2 > total ? 'lead' : 'deficit'}`} · green = won, blue = lost. {reduced ? 'Reduced motion is on; use Previous, Next or tap a rally.' : 'Play to watch momentum change.'} Rally counts include side-outs and do not represent the match score.</StageText>
  </View>;
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  track: { height: 12, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.border },
  flow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flowSource: { flex: 1, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, padding: 15, gap: 5 },
  flowTarget: { padding: 10, borderWidth: 1, borderRadius: 10 },
  court: { alignSelf: 'center', width: '100%', maxWidth: 350, borderWidth: 2, borderColor: colors.borderStrong, borderRadius: 12, overflow: 'hidden' },
  opponentCourt: { height: 65, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  centerLine: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, backgroundColor: colors.border },
  net: { alignItems: 'center', backgroundColor: colors.accent, padding: 3 },
  courtZone: { minHeight: 66, padding: 12, borderBottomWidth: 1, borderColor: colors.borderStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chart: { height: 170, flexDirection: 'row', gap: 8, alignItems: 'flex-end', borderBottomWidth: 1, borderColor: colors.borderStrong },
  midline: { position: 'absolute', left: 0, right: 0, top: 73, borderTopWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  column: { flex: 1, minWidth: 0, height: '100%', alignItems: 'center', gap: 8 },
  barSpace: { flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  storyMatch: { minHeight: 44, justifyContent: 'center', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  momentum: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 16 },
  momentumHalf: { flex: 1, alignItems: 'center', gap: 8 },
  storyScore: { fontSize: 38, lineHeight: 44, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.accent },
  pulse: { width: 20, height: 20, borderRadius: 10 },
});
