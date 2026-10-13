import { svgDataUri } from '@/lib/wricket/presentation/svg';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/wricket/ui/Text';
import { TeamCrest } from '@/components/wricket/ui/DesignIcon';
import { StatusBadge } from '@/components/wricket/ui/StatusBadge';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { matchStatus } from '@/lib/wricket/presentation/status';
import { formatOver } from '@/lib/wricket/domain/scoring';
import type { CloudLiveMatch } from '@/lib/supabase/liveMatchApi';

export function SpectatorMatchHeader({ match, result }: { match: CloudLiveMatch; result: string }) {
  const team = match.innings?.battingTeamId === match.teamB.id ? match.teamB : match.teamA;
  const terminal = matchStatus(match.status).terminal;
  const overs = Number(match.rules.oversPerInnings ?? 0);
  if (terminal) return <View style={[styles.header, { backgroundColor: '#292719', paddingVertical: 20 }]}>
    <StatusBadge status={match.status} />
    <Text variant="h1" style={{ color: colors.gold, marginTop: 14, marginBottom: 18 }}>{result}</Text>
    {match.allInnings.map(innings => <View key={innings.id} style={[styles.row, { marginTop: 9 }]}><Text variant="caption" style={{ flex: 1 }}>{innings.battingTeamId === match.teamA.id ? match.teamA.name : match.teamB.name}{match.allInnings.length > 2 ? ` · innings ${innings.sequence}` : ''}</Text><Text variant="mono">{innings.totalRuns}/{innings.totalWickets} ({formatOver(innings.totalBalls)})</Text></View>)}
  </View>;
  return <View style={styles.header}>
    <Image pointerEvents="none" source={{ uri: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#1e2c20"/><stop offset="1" stop-color="#0e1811"/></linearGradient></defs><path fill="url(#g)" d="M0 0h400v200H0z"/></svg>') }} contentFit="fill" style={StyleSheet.absoluteFill} />
    <View style={styles.row}><StatusBadge status={match.status} /><Text variant="overline" tone="muted">{match.innings ? `INNINGS ${match.innings.sequence}` : match.format}{overs ? ` · ${overs} OVERS` : ''}</Text></View>
    {match.innings ? <>
      <View style={[styles.row, { marginTop: 10 }]}><Text variant="caption" style={{ flex: 1 }}>{team.name}</Text><TeamCrest name={team.name} /></View>
      <View accessibilityLabel={`Match score ${match.score.runs} for ${match.score.wickets}`} style={{ flexDirection: 'row', alignItems: 'baseline' }}><Text style={styles.score}>{match.score.runs}</Text><Text style={styles.wickets}>/{match.score.wickets}</Text><Text variant="mono" tone="muted" style={{ marginLeft: 12 }}>{formatOver(match.score.legalBalls)}{overs ? ` / ${overs}` : ''} ov</Text></View>
    </> : <Text variant="h3" style={{ marginTop: 16 }}>{terminal ? 'Match ended' : 'Waiting for play to begin'}</Text>}
    {terminal ? <Text variant="bodyStrong" tone="accent" style={{ marginTop: 8 }}>{result}</Text> : match.innings?.target ? <Text variant="bodyStrong" tone="accent" style={{ marginTop: 8 }}>Need {Math.max(0, match.innings.target - match.score.runs)}{overs ? ` from ${Math.max(0, overs * 6 - match.score.legalBalls)} balls` : ' runs'}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ header: { paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderColor: colors.border, overflow: 'hidden' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, score: { fontFamily: fonts.display, fontSize: 43, lineHeight: 49.45, letterSpacing: -3 }, wickets: { fontFamily: fonts.display, fontSize: 29, lineHeight: 36, color: '#9baf94' } });
