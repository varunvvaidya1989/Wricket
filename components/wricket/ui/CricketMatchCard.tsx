import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { CloudLiveMatch } from '@/lib/supabase/liveMatchApi';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { formatOver } from '@/lib/wricket/domain/scoring';
import { matchStatus } from '@/lib/wricket/presentation/status';
import { Text } from './Text';
import { TeamCrest } from './DesignIcon';
import { StatusBadge } from './StatusBadge';

export function CricketMatchCard({ match, onPress }: { match: CloudLiveMatch; onPress: () => void }) {
  const lifecycle = matchStatus(match.status);
  const target = match.innings?.target;
  const batting = match.innings?.battingTeamId === match.teamA.id ? match.teamA : match.teamB;
  const overs = Number(match.rules.oversPerInnings);
  const balls = Number.isFinite(overs) ? Math.max(0, overs * 6 - match.score.legalBalls) : undefined;
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${match.teamA.name} versus ${match.teamB.name}`}
    onPress={onPress} style={styles.card}>
    <View style={styles.top}><StatusBadge status={match.status} /><Text variant="overline" tone="muted" style={styles.context}>{match.tournamentName}</Text></View>
    {[match.teamA, match.teamB].map((team, index) => {
      const innings = match.allInnings.filter(item => item.battingTeamId === team.id);
      const current = match.innings?.battingTeamId === team.id;
      const figures = current ? `${match.score.runs}/${match.score.wickets}` : innings.length ? innings.map(item => `${item.totalRuns}/${item.totalWickets}`).join(' & ') : null;
      const legalBalls = current ? match.score.legalBalls : innings.at(-1)?.totalBalls;
      return <View key={team.id} style={styles.team}>
        <TeamCrest name={team.name} blue={index === 1} /><Text style={styles.name}>{team.name}</Text>
        <View>{figures ? <Text style={styles.figures}>{figures}</Text> : <Text variant="caption" tone="dim">Yet to bat</Text>}
          {legalBalls !== undefined ? <Text style={styles.overs}>{formatOver(legalBalls)} overs</Text> : null}</View>
      </View>;
    })}
    <View style={styles.situation}><Text style={{ fontSize: 11, lineHeight: 16.5 }}>
      {!lifecycle.terminal && target ? <>{batting.name} need <Text tone="accent" style={{ fontSize: 11 }}>{Math.max(0, target - match.score.runs)}{balls !== undefined ? ` from ${balls} balls` : ' runs'}</Text></>
        : match.venue ?? lifecycle.label}
    </Text></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  context: { flex: 1, textAlign: 'right', fontSize: 8 },
  team: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15 },
  name: { fontFamily: fonts.display, fontSize: 14, lineHeight: 18.2, flex: 1 },
  figures: { fontFamily: fonts.mono, fontSize: 23, lineHeight: 30, letterSpacing: -1, textAlign: 'right' },
  overs: { fontFamily: fonts.mono, fontSize: 9, lineHeight: 14, color: colors.textMuted, marginTop: 4, textAlign: 'right' },
  situation: { borderTopWidth: 1, borderColor: colors.border, marginTop: 15, paddingTop: 12 },
});
