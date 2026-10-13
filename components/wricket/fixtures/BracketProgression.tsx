import React, { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/wricket/ui/Button';
import { Text } from '@/components/wricket/ui/Text';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { Card } from '@/components/wricket/ui/Card';
import { colors } from '@/lib/wricket/presentation/design';
import { fixtureWinner } from '@/lib/wricket/fixtures/result';
import type { FixtureMatch, KnockoutBracket } from '@/lib/wricket/fixtures';

export function BracketProgression({ bracket, names, manual, canManage, onSchedule, onStart }: { bracket: KnockoutBracket; names: Map<string, string>; manual: boolean; canManage: boolean; onSchedule: (match: FixtureMatch) => void; onStart: (match: FixtureMatch) => void }) {
  const [layouts, setLayouts] = useState<Record<string, RoundLayout>>({});
  const remember = (id: string, index: number | undefined, top: number, height: number) => setLayouts(previous => {
    const old = previous[id] ?? { height: 0, cards: {} };
    if (index === undefined ? old.height === height : old.cards[index]?.top === top && old.cards[index]?.height === height) return previous;
    return { ...previous, [id]: index === undefined ? { ...old, height } : { ...old, cards: { ...old.cards, [index]: { top, height } } } };
  });
  const { width } = useWindowDimensions();
  const columnWidth = Math.max(140, Math.min(170, (width - 62) / 2));
  const label = (value: string) => ({ QF: 'QUARTER-FINALS', SF: 'SEMI-FINALS', F: 'FINAL', PLAYOFFS_1: 'QUALIFIER 1 / ELIMINATOR', QUALIFIER_2: 'QUALIFIER 2', CROSSOVER: 'CROSSOVER' }[value] ?? value.replaceAll('_', ' '));
  const winner = (match: FixtureMatch) => { try { return fixtureWinner(match); } catch { return undefined; } };
  const final = bracket.rounds.find(round => round.name === 'F')?.matches[0];
  const champion = final && winner(final);
  return <View style={{ gap: 18 }}>
    <View><Text variant="overline" tone="muted">KNOCKOUT STAGE</Text><Text variant="h1" style={{ marginTop: 8 }}>The road to the title.</Text></View>
    {champion ? <Card style={{ borderColor: '#6d5b32', backgroundColor: '#292719' }}><DesignIcon name="trophy" size={24} color={colors.gold} /><Text variant="overline" style={{ color: colors.gold, marginTop: 10 }}>CHAMPION</Text><Text variant="h2" style={{ marginTop: 8 }}>{names.get(champion) ?? 'Unavailable team'}</Text></Card> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Winning bracket rounds" contentContainerStyle={{ gap: 4, alignItems: 'center', paddingBottom: 12 }}>
      {bracket.rounds.map((round, index) => <React.Fragment key={round.id}>
        {index > 0 ? <RoundConnector from={layouts[bracket.rounds[index - 1].id]} to={layouts[round.id]} /> : null}
        <View onLayout={event => remember(round.id, undefined, 0, event.nativeEvent.layout.height)} style={{ width: columnWidth, gap: 12 }}><Text variant="overline" tone="muted">{label(round.name)}</Text>
          {round.matches.length ? round.matches.map((match, matchIndex) => {
            const selectedWinner = winner(match);
            const unresolved = ['COMPLETED', 'WALKOVER'].includes(match.status) && !selectedWinner;
            return <View key={match.id} onLayout={event => remember(round.id, matchIndex, event.nativeEvent.layout.y, event.nativeEvent.layout.height)}><Card style={{ ...styles.match, ...(selectedWinner ? styles.won : {}) }}>
              <Text variant="overline" tone="muted">{round.name === 'PLAYOFFS_1' ? matchIndex === 0 ? 'QUALIFIER 1' : 'ELIMINATOR' : `${label(round.name)} ${matchIndex + 1}`}</Text>
              {[match.teamA, match.teamB].map((teamId, teamIndex) => <View key={teamIndex} style={styles.team}><Text variant="bodyStrong" style={{ flex: 1, color: selectedWinner === teamId ? colors.accent : colors.text }}>{teamId ? names.get(teamId) ?? 'Unavailable team' : 'BYE'}</Text>{teamId && selectedWinner === teamId ? <DesignIcon name="check" size={15} color={colors.accent} /> : null}</View>)}
              <Text variant="caption" tone="muted">{unresolved ? 'Result needs resolution' : match.status === 'LIVE' ? 'Live now' : match.scheduledAt ? new Date(match.scheduledAt).toLocaleString() : match.status === 'SCHEDULED' ? 'Not scheduled' : match.status.replaceAll('_', ' ')}</Text>
              {canManage && match.status === 'SCHEDULED' && match.teamB && match.canonicalMatchId ? <View style={{ gap: 8, marginTop: 12 }}><Button title="Schedule" accessibilityLabel={`Schedule ${round.name} ${matchIndex + 1}`} size="sm" variant="secondary" onPress={() => onSchedule(match)} /><Button title="Start match" accessibilityLabel={`Start ${round.name} ${matchIndex + 1}`} size="sm" onPress={() => onStart(match)} /></View> : null}
            </Card></View>;
          }) : round.slotMap.filter(entry => entry.slot % 2 === 1).map((entry, matchIndex) => <View key={entry.slot} onLayout={event => remember(round.id, matchIndex, event.nativeEvent.layout.y, event.nativeEvent.layout.height)}><Card style={styles.match}><Text variant="overline" tone="muted">{label(round.name)} {matchIndex + 1}</Text><Text style={{ marginTop: 12 }}>{entry.sourceRef}</Text><Text tone="muted" style={{ marginTop: 10 }}>vs {round.slotMap[matchIndex * 2 + 1]?.sourceRef ?? 'Awaiting qualifier'}</Text><Text variant="caption" tone="muted" style={{ marginTop: 12 }}>Awaiting recorded results</Text></Card></View>)}
        </View>
      </React.Fragment>)}
    </ScrollView>
    <Text variant="caption" tone="muted">{manual ? 'This schedule contains only the fixtures you create. Add later rounds with the confirmed qualifiers.' : 'The bracket advances from recorded fixture results. Matches without a winner remain unresolved.'}</Text>
  </View>;
}
interface RoundLayout { height: number; cards: Record<number, { top: number; height: number }> }
function RoundConnector({ from, to }: { from?: RoundLayout; to?: RoundLayout }) {
  if (!from || !to) return <View style={{ width: 18 }} />;
  const sources = Object.values(from.cards); const targets = Object.values(to.cards);
  const height = Math.max(from.height, to.height);
  if (sources.length !== targets.length * 2) return <View style={{ width: 18, height, alignItems: 'center', justifyContent: 'center' }}><DesignIcon name="arrow" size={18} color={colors.textMuted} /></View>;
  const center = (card: { top: number; height: number }, column: RoundLayout) => (height - column.height) / 2 + card.top + card.height / 2;
  return <View accessible={false} style={{ width: 22, height }}>{targets.map((target, index) => {
    const a = center(sources[index * 2], from), b = center(sources[index * 2 + 1], from), end = center(target, to);
    return <React.Fragment key={index}>
      {[a, b].map((top, index) => <View key={index} style={{ position: 'absolute', left: 0, top, width: 11, height: 1, backgroundColor: colors.borderStrong }} />)}
      <View style={{ position: 'absolute', left: 11, top: Math.min(a, b, end), width: 1, height: Math.max(a, b, end) - Math.min(a, b, end), backgroundColor: colors.borderStrong }} />
      <View style={{ position: 'absolute', left: 11, top: end, width: 11, height: 1, backgroundColor: colors.borderStrong }} />
    </React.Fragment>;
  })}</View>;
}
const styles = StyleSheet.create({ match: { padding: 12 }, team: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, borderBottomWidth: 1, borderColor: colors.border }, won: { borderColor: '#547d43', backgroundColor: '#18271c' } });
