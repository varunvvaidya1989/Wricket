import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { StageText } from '@/components/sports/platform/StageUI';
import { buildRacketScorePresentation } from '@/lib/sports/scoring/scorePresentation';
import { racketScoringDesign as design } from '@/lib/sports/scoring/scoringDesign';
import type { MatchState, PointEvent, Side, SportConfig } from '@/lib/sports/scoring';

export function RacketScoringPage({ title, context, children }: { title: string; context: string; children: React.ReactNode }) {
  const router = useRouter();
  return <SafeAreaView style={styles.page} edges={['top', 'bottom', 'left', 'right']}>
    <Head><title>{title} | SportStage</title></Head>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/live')} style={styles.back}><MaterialCommunityIcons name="chevron-left" size={24} color={design.text} /></Pressable><View style={styles.copy}><StageText variant="eyebrow" style={styles.context}>{context}</StageText><StageText variant="heading" style={styles.heading}>{title}</StageText></View></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
  </SafeAreaView>;
}

export function RacketScoringBoard({ config, state, events, initialServer, sideNames, sidePlayers, onPoint, disabled = false }: {
  config: SportConfig; state: MatchState; events: readonly PointEvent[]; initialServer: Side;
  sideNames: readonly [string, string]; sidePlayers: readonly [readonly string[], readonly string[]];
  onPoint?: (side: Side) => void; disabled?: boolean;
}) {
  const presentation = useMemo(() => buildRacketScorePresentation(config, state, events, initialServer), [config, events, initialServer, state]);
  const [round, setRound] = useState<number>();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardHeight = Math.max(206, Math.min(270, (height - insets.top - insets.bottom - 244) / 2));
  const order = state.isComplete ? [0, 1] as const : [state.serve.servingSide, state.serve.servingSide === 0 ? 1 : 0] as const;
  const inspected = round === undefined ? undefined : presentation.rounds[round];
  return <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rounds}>
      {presentation.rounds.map(item => <Pressable key={item.index} accessibilityRole="button" accessibilityLabel={`${presentation.level} ${item.index + 1}${item.current ? ', live' : item.complete ? ', final' : ', upcoming'}`} accessibilityState={{ disabled: !item.available }} disabled={!item.available} onPress={() => setRound(item.index)} style={[styles.round, item.current && styles.currentRound, !item.available && styles.futureRound]}>
        <StageText variant="eyebrow" style={[styles.roundLabel, item.current && { color: design.accent }]}>{item.label}{item.current ? ' LIVE' : ''}</StageText>{item.score || item.current ? <StageText variant="rowTitle" style={styles.roundScore}>{(item.score ?? [0, 0]).join('–')}</StageText> : null}
      </Pressable>)}
    </ScrollView>
    {order.map(side => {
      const value = presentation.sides[side];
      const doubles = sidePlayers[side].length > 1;
      const contents = <>
        <View style={styles.cardHeader}><SideAvatar doubles={doubles} serving={value.serving && !state.isComplete} /><View style={styles.copy}><StageText variant="rowTitle" style={styles.name}>{sideNames[side]}</StageText>{doubles ? <StageText variant="small" style={styles.players}>{sideNames[side] === sidePlayers[side].join(' / ') ? `Doubles · Side ${side === 0 ? 'A' : 'B'}` : sidePlayers[side].join(' · ')}</StageText> : null}</View><View style={[styles.badge, value.serving && !state.isComplete && styles.servingBadge]}><StageText variant="eyebrow" style={[styles.badgeText, value.serving && !state.isComplete && { color: design.bg }]}>{state.isComplete ? state.winner === side ? 'WINNER' : 'FINAL' : value.serving ? `● SERVING${value.service ? ` · ${value.service}` : ''}` : 'RECEIVING'}</StageText></View></View>
        <StageText accessibilityLabel={`${sideNames[side]} score ${value.score}`} style={styles.score}>{value.score}</StageText>
        <View style={styles.cardFooter}><StageText variant="eyebrow" style={styles.summary}>{value.summary}</StageText><StageText variant="small" style={[styles.hint, value.serving && { color: design.accent }]}>{onPoint && !state.isComplete ? disabled ? 'Saving rally…' : value.hint : value.hint === 'MATCH WINNER' ? 'MATCH WINNER' : state.isComplete ? 'FINAL' : 'Spectator view'}</StageText></View>
      </>;
      const cardStyle = [styles.card, { minHeight: cardHeight }, value.serving && !state.isComplete && styles.servingCard];
      return onPoint && !state.isComplete ? <Pressable key={side} accessibilityRole="button" accessibilityLabel={`Rally won by ${sideNames[side]}`} accessibilityState={{ disabled, busy: disabled }} disabled={disabled} onPress={() => { void Haptics.selectionAsync().catch(() => undefined); onPoint(side); }} style={({ pressed }) => [...cardStyle, pressed && { opacity: 0.8 }]}>{contents}</Pressable> : <View key={side} style={cardStyle}>{contents}</View>;
    })}
    <Modal accessibilityLabel={`${presentation.level} ${(round ?? 0) + 1} details`} visible={inspected !== undefined} transparent animationType="fade" onRequestClose={() => setRound(undefined)}><View style={styles.overlay}><View style={styles.dialog}><StageText variant="heading">{presentation.level === 'set' ? 'Set' : 'Game'} {(round ?? 0) + 1} · {inspected?.complete ? 'Final' : 'Live'}</StageText><StageText>{sideNames[0]} · {inspected?.score?.[0] ?? 0}</StageText><StageText>{sideNames[1]} · {inspected?.score?.[1] ?? 0}</StageText><ScoringAction title="Back to scoring" onPress={() => setRound(undefined)} /></View></View></Modal>
  </>;
}

export function ScoringReceipt({ text, undo, disabled }: { text: string; undo?: () => void; disabled?: boolean }) {
  return <View style={styles.receipt}><StageText variant="small" accessibilityLiveRegion="polite" style={styles.receiptText}>{text}</StageText>{undo ? <Pressable accessibilityRole="button" accessibilityLabel="Undo last rally" accessibilityState={{ disabled }} disabled={disabled} onPress={undo} style={[styles.undo, disabled && { opacity: 0.5 }]}><MaterialCommunityIcons name="undo-variant" size={16} color={design.text} /><StageText style={styles.actionText}>Undo</StageText></Pressable> : null}</View>;
}

export function ScoringAction({ title, onPress, icon, selected = false, disabled = false }: { title: string; onPress: () => void; icon?: 'tune' | 'dots-horizontal'; selected?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.action, selected && { borderColor: design.accent }, disabled && { opacity: 0.5 }]}>{icon ? <MaterialCommunityIcons name={icon} size={17} color={design.text} /> : null}<StageText style={styles.actionText}>{title}</StageText></Pressable>;
}

function SideAvatar({ doubles, serving }: { doubles: boolean; serving: boolean }) {
  return <View accessible={false} style={[styles.avatars, { width: doubles ? 52 : 42 }]}>{(doubles ? [0, 1] : [0]).map(index => <View key={index} style={[styles.avatar, serving && styles.activeAvatar, doubles && { width: 34, height: 34 }, { left: index * 19, zIndex: 2 - index }]}><MaterialCommunityIcons name="account" size={doubles ? 24 : 30} color={serving ? design.accent : design.muted} /></View>)}{doubles ? <View style={[styles.pairDot, serving && { backgroundColor: design.accent, borderColor: design.serving }]} /> : null}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: design.bg },
  header: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 12, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: design.border, backgroundColor: design.surface, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 12, paddingTop: 0, paddingBottom: 16, gap: 10 },
  copy: { flex: 1, minWidth: 0, gap: 3 }, context: { color: design.muted, fontSize: 9, lineHeight: 14, letterSpacing: 1 }, heading: { color: design.text, fontSize: 17, lineHeight: 22 },
  rounds: { gap: 7 }, round: { minHeight: 36, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: design.surface, borderColor: design.border, borderWidth: 1, borderRadius: 10 },
  currentRound: { backgroundColor: design.serving, borderColor: design.accent }, futureRound: { backgroundColor: design.bg, borderStyle: 'dashed' }, roundLabel: { color: design.muted, fontSize: 9, letterSpacing: 0.5 }, roundScore: { color: design.text, fontSize: 12 },
  card: { width: '100%', padding: 16, borderWidth: 1, borderColor: design.border, borderRadius: 20, backgroundColor: design.surface, justifyContent: 'space-between', gap: 8 }, servingCard: { backgroundColor: design.serving, borderWidth: 2, borderColor: design.accent, padding: 15 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, name: { color: design.text, fontSize: 14 }, players: { color: design.muted, fontSize: 10 },
  avatars: { height: 42, flexShrink: 0, justifyContent: 'center' }, avatar: { position: 'absolute', width: 42, height: 42, borderRadius: 24, borderWidth: 1.5, borderColor: '#3a4b3d', backgroundColor: '#1a241c', alignItems: 'center', justifyContent: 'center' }, activeAvatar: { borderColor: design.accent, backgroundColor: '#263f17' }, pairDot: { position: 'absolute', left: 19, bottom: 0, zIndex: 3, height: 10, width: 10, borderRadius: 5, borderWidth: 1.5, borderColor: design.muted, backgroundColor: design.surface },
  badge: { borderRadius: 20, borderWidth: 1, borderColor: '#364a37', paddingVertical: 4, paddingHorizontal: 8, maxWidth: '100%' }, servingBadge: { backgroundColor: design.accent, borderColor: design.accent }, badgeText: { color: design.muted, fontSize: 8, lineHeight: 12, letterSpacing: 0.5 },
  score: { color: design.text, fontFamily: design.score, fontSize: 96, lineHeight: 110, textAlign: 'center', letterSpacing: -4 },
  cardFooter: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 }, summary: { flex: 1, minWidth: 0, color: design.muted, fontSize: 9, lineHeight: 14, letterSpacing: 0.5 }, hint: { flexShrink: 1, maxWidth: '50%', textAlign: 'right', color: design.text, fontFamily: design.display, fontSize: 11 },
  receipt: { minHeight: 38, borderWidth: 1, borderColor: design.border, borderRadius: 12, backgroundColor: design.surface, paddingLeft: 12, paddingRight: 4, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 8 }, receiptText: { flex: 1, minWidth: 0, color: design.text },
  undo: { minHeight: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#364a37', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  action: { flex: 1, minHeight: 44, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: design.border, borderRadius: 12, backgroundColor: design.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, actionText: { color: design.text, fontFamily: design.display, fontSize: 12 },
  overlay: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.72)' }, dialog: { alignSelf: 'center', width: '100%', maxWidth: 560, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: design.border, backgroundColor: design.surface, gap: 16 },
});
