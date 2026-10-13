import { svgDataUri } from '@/lib/wricket/presentation/svg';
import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import type { CloudLiveMatch } from '@/lib/supabase/liveMatchApi';
import { Text } from '@/components/wricket/ui/Text';
import { colors } from '@/lib/wricket/presentation/design';
import { scoreAtLegalBalls } from '@/lib/wricket/domain/test-match';
import { formatOver } from '@/lib/wricket/domain/scoring';

export function ChaseComparison({ match }: { match: CloudLiveMatch }) {
  const current = match.innings;
  const reference = [...match.allInnings].reverse().find(item => current && item.sequence < current.sequence && item.battingTeamId !== current.battingTeamId);
  const limit = Math.min(match.score.legalBalls, reference?.totalBalls ?? 0);
  if (!current || !reference || !limit) return null;
  const counts = Array.from(new Set([0, ...Array.from({ length: Math.floor(limit / 6) }, (_, index) => (index + 1) * 6), limit]));
  const series = [current.id, reference.id].map(id => counts.map(balls => scoreAtLegalBalls(match.commentary, id, balls)));
  const max = Math.max(1, ...series.flat());
  const paths = series.map(points => points.map((runs, index) => `${index ? 'L' : 'M'}${12 + counts[index] / limit * 276},${104 - runs / max * 88}`).join(' '));
  const diff = series[0].at(-1)! - series[1].at(-1)!;
  const batting = current.battingTeamId === match.teamA.id ? match.teamA : match.teamB;
  const other = reference.battingTeamId === match.teamA.id ? match.teamA : match.teamB;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120" viewBox="0 0 300 120"><path d="M12 24H288M12 54H288M12 84H288" stroke="#365439" stroke-dasharray="3 4" fill="none"/><path d="${paths[1]}" stroke="#a1afa4" stroke-width="2" fill="none"/><path d="${paths[0]}" stroke="#a6f477" stroke-width="2" fill="none"/></svg>`;
  return <View accessibilityLabel={`At ${formatOver(limit)} overs, ${batting.name} ${series[0].at(-1)}, ${other.name} ${series[1].at(-1)}`} style={{ padding: 16, borderWidth: 1, borderColor: '#405b31', borderRadius: 24, backgroundColor: '#1d2d1e', gap: 12 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text variant="overline" tone="muted">CHASE AT THE SAME OVER</Text><Text variant="caption" tone="accent">{diff > 0 ? '+' : ''}{diff}</Text></View>
    <Image source={{ uri: svgDataUri(svg) }} style={{ width: '100%', height: 120 }} contentFit="fill" />
    <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}><Text variant="caption" style={{ color: colors.accent }}>● {batting.shortName}</Text><Text variant="caption" tone="muted">● {other.shortName}</Text><Text variant="caption" tone="muted">{formatOver(limit)} ov</Text></View>
  </View>;
}
