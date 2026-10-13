import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/wricket/ui/Card';
import { Text } from '@/components/wricket/ui/Text';
import { Button } from '@/components/wricket/ui/Button';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { getTournamentMvp } from '@/lib/wricket/app/mvp';
import { listTeams, listUsers } from '@/lib/wricket/db/repo';
import { mvpApi } from '@/lib/supabase/mvpApi';
import { getSupabaseClient } from '@/lib/supabase/client';
import { leaderboardValue, rankLeaderboard, type LeaderboardMetric, type LeaderboardRow } from '@/lib/wricket/presentation/tournamentLeaderboard';
import { svgDataUri } from '@/lib/wricket/presentation/svg';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { colors } from '@/lib/wricket/presentation/design';
import { spacing } from '@/lib/theme/spacing';

const metrics: LeaderboardMetric[] = ['MVP', 'Batting', 'Bowling', 'Fielding'];
const contributionColors = [colors.accent, colors.gold, '#76a7cd'];
const podiumGradient = svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" width="110" height="135"><defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#312d1e"/><stop offset="1" stop-color="#1b221a"/></linearGradient></defs><rect width="110" height="135" fill="url(#gold)"/></svg>');

export function TournamentMvpLeaderboard({ tournamentId, cloudTournamentId, completedMatches = 0 }: {
  tournamentId: string; cloudTournamentId?: string; completedMatches?: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [metric, setMetric] = useState<LeaderboardMetric>('MVP');
  const [expanded, setExpanded] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  useEffect(() => { setRows([]); setExpanded(undefined); }, [cloudTournamentId, tournamentId]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useFocusEffect(refresh);
  useEffect(() => {
    if (!cloudTournamentId) return;
    const client = getSupabaseClient();
    let timer: ReturnType<typeof setTimeout>;
    const changed = () => { clearTimeout(timer); timer = setTimeout(refresh, 300); };
    const channel = client.channel(`tournament-leaderboard-${cloudTournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${cloudTournamentId}` }, changed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_mvp_results' }, changed)
      .subscribe();
    return () => { clearTimeout(timer); void client.removeChannel(channel); };
  }, [cloudTournamentId, refresh]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(undefined);
    const load = async (): Promise<LeaderboardRow[]> => {
      // An empty cloud result is authoritative; never replace it with stale local rankings.
      if (cloudTournamentId) return mvpApi.getCompleteTournamentLeaderboard(cloudTournamentId);
      const [leaderboard, users, teams] = await Promise.all([getTournamentMvp(tournamentId), listUsers(), listTeams(tournamentId)]);
      const names = new Map(users.map(user => [user.id, user.name]));
      const teamNames = new Map(teams.map(team => [team.id, team.name]));
      return leaderboard.map(row => ({ ...row, playerName: names.get(row.playerId) ?? 'Unknown player',
        teamNames: row.teamIds.map(id => teamNames.get(id) ?? 'Unknown team'), matchDetails: [] }));
    };
    void load().then(value => { if (!cancelled) { setRows(value); setExpanded(current => current ?? value[0]?.playerId); } })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load MVP standings.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cloudTournamentId, completedMatches, revision, tournamentId]);
  const ranked = useMemo(() => rankLeaderboard(rows, metric), [rows, metric]);
  const rankedMatchCount = cloudTournamentId ? new Set(rows.flatMap(row => row.matchDetails.map(match => match.matchId))).size : completedMatches;
  const unit = metric === 'MVP' ? 'PTS' : metric === 'Batting' ? 'RUNS' : metric === 'Bowling' ? 'WKTS' : 'ACTIONS';
  const value = (row: LeaderboardRow) => metric === 'MVP' ? leaderboardValue(row, metric).toFixed(2) : String(leaderboardValue(row, metric));
  if (loading && !rows.length) return <Card><SportStageLoader variant="compact" message="Calculating tournament MVP" detail="" /></Card>;
  return <View style={styles.stack}>
    <View><Text variant="overline" tone="muted">THROUGH {rankedMatchCount} COMPLETED MATCHES</Text>
      <Text variant="h1" style={{ marginTop: 9 }}>Tournament MVP.</Text>
      <Text tone="muted" style={{ marginTop: 8 }}>Progressive standings from eligible completed matches.</Text></View>
    {cloudTournamentId && rankedMatchCount < completedMatches ? <Text variant="caption" tone="muted">Rankings are ready for {rankedMatchCount} of {completedMatches} eligible completed matches. Remaining calculations will appear when processed.</Text> : null}
    {error ? <Card><Text accessibilityRole="alert">{error}</Text><Button title="Retry leaderboard" onPress={refresh} /></Card> : null}
    <View style={styles.switch}>{metrics.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityLabel={`${item} leaderboard`}
      aria-selected={metric === item} accessibilityState={{ selected: metric === item }} onPress={() => setMetric(item)} style={[styles.switchItem, metric === item && styles.selected]}>
      <Text variant="caption" style={{ fontSize: 9 }} tone={metric === item ? 'accent' : 'muted'}>{item}</Text></Pressable>)}</View>
    {!error && !ranked.length ? <Card><Text variant="h3">{metric === 'MVP' ? completedMatches > 0 ? 'No calculated rankings yet' : 'No eligible completed matches yet' : metric === 'Batting' ? 'No runs recorded yet' : metric === 'Bowling' ? 'No wickets recorded yet' : 'No fielding actions recorded yet'}</Text><Text tone="muted">Rankings use recorded contributions from eligible completed matches.</Text></Card> : null}
    {!error && ranked.length >= 3 ? <View style={styles.podium}>{[ranked[1], ranked[0], ranked[2]].map(row => <View key={row.playerId} style={[styles.podiumPlace, row.rank === 1 && styles.first]}>
      {row.rank === 1 ? <><Image accessible={false} source={{ uri: podiumGradient }} style={StyleSheet.absoluteFill} resizeMode="stretch" /><DesignIcon name="trophy" size={18} color={colors.gold} /></> : null}
      <View style={[styles.avatar, row.rank === 1 && styles.goldAvatar]}><Text variant="h3">{initials(row.playerName)}</Text></View>
      <Text variant="bodyStrong" style={styles.center}>{row.playerName}</Text><Text variant="mono" style={{ fontSize: 8, lineHeight: 12 }} tone={row.rank === 1 ? 'accent' : 'muted'}>{row.rank} / {value(row)}</Text></View>)}</View> : null}
    {!error ? <View style={styles.list}>{ranked.map(row => {
      const open = expanded === row.playerId;
      return <View key={row.playerId} style={styles.entry}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Inspect ${row.playerName}, rank ${row.rank}, ${value(row)} ${unit}`}
          accessibilityState={{ expanded: open }} onPress={() => setExpanded(open ? undefined : row.playerId)} style={styles.row}>
          <Text variant="mono" tone={row.rank === 1 ? 'accent' : 'dim'} style={styles.rank}>{String(row.rank).padStart(2, '0')}</Text>
          <View style={styles.smallAvatar}><Text variant="bodyStrong">{initials(row.playerName)}</Text></View>
          <View style={styles.identity}><Text variant="bodyStrong" style={styles.playerName}>{row.playerName}</Text><Text variant="caption" style={styles.teamCaption} tone="muted">{row.teamNames.join(', ')} / {row.matchesPlayed} matches</Text></View>
          <View style={styles.value}><Text variant="h3" style={{ fontSize: 18, lineHeight: 23.4 }} tone="accent">{value(row)}</Text><Text variant="overline" style={{ fontSize: 6, lineHeight: 9, letterSpacing: 0.5 }} tone="muted">{unit}</Text></View>
        </Pressable>
        {open ? <View style={styles.details}><Contribution row={row} />
          <Text variant="caption" tone="muted">{row.playerOfTheMatchCount} player of the match / {row.topThreeCount} top-three finishes</Text>
          <Text variant="overline" tone="muted">MATCH CONTRIBUTIONS</Text>
          {row.matchDetails.length ? row.matchDetails.map(match => <Pressable key={match.matchId} accessibilityRole="button"
            accessibilityLabel={`View scorecard against ${match.opponentName}`} style={styles.match} onPress={() => router.push({ pathname: '/wricket/match/[id]/scorecard', params: { id: match.matchId } })}>
            <View style={styles.identity}><Text variant="bodyStrong">vs {match.opponentName}</Text><Text variant="caption" tone="muted">{new Date(match.date).toLocaleDateString()} / {match.teamName}{match.playerOfMatch ? ' / POTM' : ''}</Text>
              <Text variant="caption" tone="dim">Bat {match.battingPoints.toFixed(2)} / Bowl {match.bowlingPoints.toFixed(2)} / Field {match.fieldingPoints.toFixed(2)}</Text></View>
            <Text variant="mono" tone="accent">{match.totalPoints.toFixed(2)}</Text><MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} /></Pressable>) : <Text tone="muted">Match details will be available after these records sync.</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${row.playerName} performance`} style={styles.match} onPress={() => router.push({ pathname: '/wricket/stats', params: { playerId: row.playerId, playerName: row.playerName } })}><Text tone="accent">View player performance</Text><MaterialCommunityIcons name="chevron-right" size={18} color={colors.accent} /></Pressable>
        </View> : null}
      </View>;
    })}</View> : null}
    <View style={styles.legend}>{['Batting', 'Bowling', 'Fielding'].map((label, index) => <View key={label} style={styles.legendItem}><View style={[styles.dot, { backgroundColor: contributionColors[index] }]} /><Text variant="caption" tone="muted">{label}</Text></View>)}</View>
    <Text variant="caption" tone="muted">{metric === 'MVP' ? 'MVP points retain full calculation precision. Displayed totals are rounded to two decimals. Tap a player to inspect their points breakdown.' : 'This view uses recorded tournament statistics from eligible completed matches. Change back to MVP to see contribution points.'}</Text>
    <Button title={loading ? 'Refreshing leaderboard' : 'Refresh leaderboard'} disabled={loading} variant="secondary" onPress={refresh} />
  </View>;
}

function Contribution({ row }: { row: LeaderboardRow }) {
  const points = [row.battingPoints, row.bowlingPoints, row.fieldingPoints];
  const positive = points.reduce((sum, value) => sum + Math.max(0, value), 0);
  return <View style={{ gap: 8 }}>{positive > 0 ? <View style={styles.bar}>{points.map((value, index) => <View key={index} style={{ flex: Math.max(0, value) / positive, backgroundColor: contributionColors[index] }} />)}</View> : null}
    {['Batting', 'Bowling', 'Fielding'].map((label, index) => <View key={label} style={styles.points}><Text variant="caption" tone="muted">{label}</Text><Text variant="mono">{points[index].toFixed(2)} points</Text></View>)}</View>;
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join(''); }
const styles = StyleSheet.create({
  playerName: { fontSize: 11, lineHeight: 14.3 }, teamCaption: { fontSize: 8, lineHeight: 12.8, marginTop: 4 },
  stack: { gap: 14 }, switch: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: '#374839', backgroundColor: '#121b14', borderRadius: 9, padding: 3 },
  switchItem: { flexGrow: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 6 }, selected: { backgroundColor: '#304629' },
  podium: { flexDirection: 'row', gap: 7, alignItems: 'flex-end', paddingTop: 18 }, podiumPlace: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8, minHeight: 110, paddingTop: 14, paddingBottom: 10, paddingHorizontal: 5, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, overflow: 'hidden' },
  first: { flex: 1.15, minHeight: 135, borderColor: '#6d5b32' }, center: { textAlign: 'center', fontSize: 10, lineHeight: 13 },
  avatar: { width: 33, height: 33, borderRadius: 17, backgroundColor: colors.surfaceElevated, justifyContent: 'center', alignItems: 'center' }, goldAvatar: { borderWidth: 1, borderColor: colors.gold },
  smallAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' }, entry: { borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, minHeight: 72 }, rank: { width: 22, fontSize: 9, lineHeight: 13.5 }, identity: { flex: 1, minWidth: 0 }, value: { alignItems: 'flex-end', flexShrink: 0 },
  details: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 }, bar: { height: 3, flexDirection: 'row', overflow: 'hidden', borderRadius: 3 }, points: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 6, height: 6, borderRadius: 2 },
});
