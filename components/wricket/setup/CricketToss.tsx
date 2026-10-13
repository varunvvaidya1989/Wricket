import { svgDataUri } from '@/lib/wricket/presentation/svg';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/wricket/ui/Text';
import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { Image } from 'expo-image';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { flipCoin, CoinSide } from '@/lib/sports/toss';
import type { Team } from '@/lib/wricket/domain/types';
import type { TossAction, TossState } from '@/lib/wricket/presentation/tossState';

export function CricketToss({ teamA, teamB, state, dispatch }: {
  teamA: Team; teamB: Team; state: TossState; dispatch: React.Dispatch<TossAction>;
}) {
  const [callerId, setCallerId] = useState<string>();
  const [calledSide, setCalledSide] = useState<CoinSide>();
  const flipped = useRef(false);
  const teams = [teamA, teamB] as const;
  const winner = teams.find(team => team.id === state.winnerId);
  const caller = teams.find(team => team.id === (state.landed?.callerId ?? callerId));
  const flip = () => {
    if (!callerId || !calledSide || state.landed || flipped.current) return;
    flipped.current = true;
    dispatch({ type: 'land', result: flipCoin({ participants: teams, callerId, calledSide }) });
  };
  return <View style={styles.stack}>
<View><Text variant="overline" tone="muted">Before the first ball</Text><Text variant="h1" style={{ marginTop: 8 }}>Make the call.</Text>
    <Text variant="caption" tone="muted" style={{ marginTop: 9 }}>Record an on-field result or use the match coin.</Text></View>
    {!state.landed ? <View style={[styles.row, { gap: 7 }]}>{(['MANUAL', 'VIRTUAL'] as const).map(mode => <Pressable key={mode} accessibilityRole="button" accessibilityState={{ selected: state.mode === mode }} onPress={() => dispatch({ type: 'mode', mode })} style={[styles.chip, state.mode === mode && styles.activeChip]}><Text style={{ fontSize: 10, color: state.mode === mode ? colors.accent : colors.textMuted }}>{mode === 'MANUAL' ? 'On-field toss' : 'Virtual coin'}</Text></Pressable>)}</View> : null}
    {state.mode === 'VIRTUAL' ? <Card>
      {!state.landed ? <>
        <Text variant="overline" tone="muted">Who is calling?</Text>
        <View style={[styles.stack, { marginTop: 10 }]}>{teams.map(team => <Button key={team.id} title={team.name}
          variant={callerId === team.id ? 'primary' : 'secondary'} onPress={() => setCallerId(team.id)} />)}</View>
        <View style={[styles.row, { marginTop: 14 }]}>{(['HEADS', 'TAILS'] as const).map(side => <Button key={side}
          title={side === 'HEADS' ? 'Heads' : 'Tails'} variant={calledSide === side ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => setCalledSide(side)} />)}</View>
      </> : <View style={[styles.row, { justifyContent: 'space-between' }]}><Text variant="overline" tone="muted">Virtual toss</Text><View style={styles.row}><DesignIcon name="lock" size={14} color={colors.accent} /><Text variant="caption" tone="accent">Result locked</Text></View></View>}
      <TossCoin label={state.landed?.landedSide ?? 'TOSS'} />
      {state.landed ? <><Text variant="h2" style={{ textAlign: 'center' }}>{state.landed.landedSide === 'HEADS' ? 'Heads' : 'Tails'} landed.</Text>
        <Text variant="caption" tone="muted" style={styles.center}>{caller?.name} called {state.landed.calledSide.toLowerCase()}.</Text>
        <Text variant="h3" tone="accent" style={styles.center}>{winner?.name} won the toss.</Text></>
        : <Button title="Flip the coin" disabled={!callerId || !calledSide} onPress={flip} />}
    </Card> : <Card><Text variant="overline" tone="muted">Who won the toss?</Text><TossCoin label="TOSS" /><View style={[styles.stack, { marginTop: 12 }]}>
      {teams.map(team => <Button key={team.id} title={team.name} variant={state.winnerId === team.id ? 'primary' : 'secondary'} onPress={() => dispatch({ type: 'manual', winnerId: team.id })} />)}
    </View></Card>}
    {winner ? <View style={styles.stack}><Text variant="overline" tone="muted">{winner.name} chooses to</Text><View style={styles.row}>
      {(['BAT', 'BOWL'] as const).map(choice => <Pressable key={choice} accessibilityRole="button" accessibilityLabel={choice === 'BAT' ? 'Bat first' : 'Field first'}
        accessibilityState={{ selected: state.choice === choice }} onPress={() => dispatch({ type: 'choice', choice })}
        {...({ 'aria-selected': state.choice === choice } as object)}
        style={[styles.decision, state.choice === choice && styles.selected]}>
        <DesignIcon name={choice === 'BAT' ? 'bat' : 'ball'} size={18} color={state.choice === choice ? colors.accentInk : colors.text} />
        <Text variant="bodyStrong" style={{ color: state.choice === choice ? colors.accentInk : colors.text }}>{choice === 'BAT' ? 'Bat first' : 'Field first'}</Text>
      </Pressable>)}
    </View></View> : null}
  </View>;
}
function TossCoin({ label }: { label: string }) {
  const background = `<svg xmlns="http://www.w3.org/2000/svg" width="132" height="132"><defs><radialGradient id="coin" cx="30%" cy="20%" r="80%"><stop stop-color="#4b452b"/><stop offset="1" stop-color="#26271b"/></radialGradient></defs><circle cx="66" cy="66" r="65" fill="url(#coin)" stroke="#b59a58" stroke-width="2"/><circle cx="66" cy="66" r="60" fill="none" stroke="#32331f" stroke-width="6"/><circle cx="66" cy="66" r="57" fill="none" stroke="#8e7a42"/></svg>`;
  return <View style={styles.coin}><Image source={{ uri: svgDataUri(background) }} style={StyleSheet.absoluteFill} /><DesignIcon name="ball" size={30} color="#efcb7a" /><Text style={{ fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2, color: '#efcb7a' }}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  stack: { gap: 14 }, row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  center: { textAlign: 'center', marginTop: 8 },
  coin: { width: 132, height: 132, marginVertical: 12, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', gap: 7 },
  chip: { paddingVertical: 8, paddingHorizontal: 11, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  activeChip: { backgroundColor: '#233a24', borderColor: '#4e7142' },
  decision: { flex: 1, minHeight: 46, padding: 13, gap: 9, flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
});
