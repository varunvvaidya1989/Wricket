import { svgDataUri } from '@/lib/wricket/presentation/svg';
import React, { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Screen } from '@/components/ui/Screen';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { Text } from '@/components/wricket/ui/Text';
import { Card } from '@/components/wricket/ui/Card';
import { Button } from '@/components/wricket/ui/Button';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { LinkRow } from '@/components/wricket/ui/DesignRows';
import type { CloudLiveMatch, CloudMatchContext } from '@/lib/supabase/liveMatchApi';
import { buildCompleteScorecard } from '@/lib/wricket/presentation/spectatorScorecard';
import { colors } from '@/lib/wricket/presentation/design';

export function SpectatorMatchInfo({ visible, onClose, match, context, failed, onRetry, onTournament }: {
  visible: boolean; onClose: () => void; match: CloudLiveMatch; context?: CloudMatchContext; failed: boolean;
  onRetry: () => void; onTournament: () => void;
}) {
  const [selected, setSelected] = useState<string>();
  const [mapError, setMapError] = useState(false);
  const winner = [match.teamA, match.teamB].find(team => team.id === match.tossWinnerTeamId);
  const team = [match.teamA, match.teamB].find(item => item.id === selected);
  const cards = buildCompleteScorecard(match);
  const format = { TURF: 'Turf', BOX: 'Box', TURF_TEST: 'Test' }[match.format] ?? match.format;
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen"><Screen padded={false} style={{ backgroundColor: colors.bg }}>
    <WricketHeader title={team ? 'Playing side' : 'Match info'} backTo="/wricket/live" onBack={() => team ? setSelected(undefined) : onClose()} />
    <ScrollView contentContainerStyle={{ padding: 18, gap: 20 }}>
      {team ? <>
        <Text variant="h1">{team.name}</Text>
        {(context?.squads ?? []).filter(player => player.teamId === team.id).map(player => {
          const innings = cards.filter(card => card.battingTeamId === team.id).at(-1);
          const batter = innings?.batters.find(row => row.id === player.id);
          return <View key={player.id} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border, gap: 6 }}>
            <Text variant="h3">{player.name}{player.isCaptain ? ' · C' : ''}{player.isKeeper ? ' · WK' : ''}</Text>
            <Text variant="caption" tone="muted">{player.role}{batter ? ` · ${batter.runs} (${batter.balls}) · ${batter.dismissal ?? 'Not out'}` : ''}</Text>
          </View>;
        })}
        {!context?.squads.some(player => player.teamId === team.id) ? <Text tone="muted">Playing side not available.</Text> : null}
      </> : <>
        <Card><Text variant="overline" tone="muted">TOSS</Text><Text variant="h3" style={{ marginTop: 9 }}>{winner && match.tossChoice ? `${winner.name} chose to ${match.tossChoice === 'BAT' ? 'bat' : 'bowl'}.` : 'Toss not recorded yet.'}</Text><View style={{ marginVertical: 16, height: 1, backgroundColor: colors.border }} />
          <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'space-between' }}><Text variant="caption" tone="muted">Format</Text><Text variant="caption" style={{ flex: 1, textAlign: 'right' }}>{format}{match.rules.oversPerInnings ? ` · ${match.rules.oversPerInnings} overs` : ''}</Text></View>
          <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'space-between', marginTop: 13 }}><Text variant="caption" tone="muted">Playing side</Text><Text variant="caption">{match.rules.playersPerSide ? `${match.rules.playersPerSide} players each` : 'Not available'}</Text></View>
        </Card>
        {match.tournamentId ? <LinkRow title={match.tournamentName} detail="View tournament" icon="trophy" onPress={onTournament} /> : <Text variant="h3">{match.tournamentName}</Text>}
        <View><Text variant="overline" tone="muted">VENUE</Text><Text variant="h3" style={{ marginTop: 9, marginBottom: 12 }}>{match.venue || 'Venue not recorded.'}</Text>
          {match.venue ? <Pressable accessibilityRole="button" accessibilityLabel="Open venue in maps" onPress={() => { void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(match.venue!)}`).catch(() => setMapError(true)); }} style={{ height: 125, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1b2b1e', borderWidth: 1, borderColor: '#365439', alignItems: 'center', justifyContent: 'center' }}>
            <Image pointerEvents="none" source={{ uri: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" width="340" height="125"><defs><pattern id="g" width="55" height="50" patternTransform="rotate(25)" patternUnits="userSpaceOnUse"><path d="M0 0H55V50" fill="none" stroke="#344a32" stroke-width="4"/></pattern></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>') }} style={{ position: 'absolute', width: '100%', height: '100%' }} />
            <DesignIcon name="pin" size={36} color={colors.accent} /><Text variant="caption" tone="accent">Open in maps</Text>
          </Pressable> : null}{mapError ? <Text accessibilityRole="alert" tone="danger">Could not open maps. Please try again.</Text> : null}
        </View>
        <Text variant="overline" tone="muted">PLAYING SIDES</Text>
        {failed ? <View style={{ gap: 8 }}><Text tone="muted">Playing sides could not be loaded.</Text><Button title="Retry match info" onPress={onRetry} /></View> : !context ? <Text tone="muted">Loading playing sides…</Text> : [match.teamA, match.teamB].map(item => {
          const players = context.squads.filter(player => player.teamId === item.id);
          return <LinkRow key={item.id} title={item.name} detail={players.length ? players.slice(0, 3).map(player => player.name).join(', ') + (players.length > 3 ? ` + ${players.length - 3} players` : '') : 'Playing side not submitted'} icon="users" onPress={() => setSelected(item.id)} />;
        })}
      </>}
    </ScrollView>
  </Screen></Modal>;
}
