import type { StandingRow } from './types';
import type { QualifiedTeam } from './bracket';

export type KnockoutPreset = 'FINAL_2' | 'SF_4' | 'QF_8' | 'PLAYOFFS_4' | 'SIX_TEAM_CROSSOVER' | 'CUSTOM';
export interface RankedGroup { id: string; name: string; rows: StandingRow[] }
export const knockoutPresets: { value: KnockoutPreset; title: string; detail: string }[] = [
  { value: 'FINAL_2', title: 'Top 2 · Final', detail: 'One championship match' },
  { value: 'SF_4', title: 'Top 4 · SF → Final', detail: 'Two semi-finals, then the final' },
  { value: 'QF_8', title: 'Top 8 · QF → SF → Final', detail: 'Eight-team elimination bracket' },
  { value: 'PLAYOFFS_4', title: 'Top 4 · Playoffs', detail: 'Qualifier 1, Eliminator, Qualifier 2, Final' },
  { value: 'SIX_TEAM_CROSSOVER', title: '2 groups · 6-team crossover', detail: 'A1–B3, A2–B2, A3–B1; group-stage NRR determines the direct finalist' },
  { value: 'CUSTOM', title: 'Custom qualifiers', detail: 'Choose 2, 4 or 8 teams in explicit pairing order' },
];

export function seedQualifiers(groups: RankedGroup[], preset: KnockoutPreset, customIds?: readonly string[]): QualifiedTeam[] {
  const all = groups.flatMap(group => group.rows.map(row => ({ row, group }))).sort((a, b) => a.row.rank - b.row.rank || b.row.points - a.row.points || b.row.goalDifference - a.row.goalDifference);
  if (preset === 'PLAYOFFS_4' && (groups.length !== 1 || groups[0].rows.length < 4)) throw new Error('Four-team playoffs require one group with at least four teams.');
  if (preset === 'SIX_TEAM_CROSSOVER') {
    if (groups.length !== 2 || groups.some(group => group.rows.length < 3)) throw new Error('Six-team crossover requires two groups with at least three teams each.');
    return [[0, 0], [1, 2], [0, 1], [1, 1], [0, 2], [1, 0]].map(([groupIndex, rank]) => {
      const group = groups[groupIndex], row = group.rows[rank];
      if (row.unresolved) throw new Error(`Resolve the qualification tie in ${group.name} first.`);
      return { teamId: row.teamId, groupId: group.id, sourceRef: `${String.fromCharCode(65 + groupIndex)}${rank + 1}` };
    });
  }
  const count = preset === 'FINAL_2' ? 2 : ['SF_4', 'PLAYOFFS_4'].includes(preset) ? 4 : preset === 'QF_8' ? 8 : customIds?.length ?? 0;
  if (![2, 4, 8].includes(count)) throw new Error('Choose 2, 4 or 8 custom qualifiers.');
  let ids: readonly string[];
  if (preset === 'CUSTOM') ids = customIds ?? [];
  else if (preset === 'PLAYOFFS_4') ids = all.slice(0, count).map(item => item.row.teamId);
  else if (groups.length === 2 && groups.every(group => group.rows.length >= count / 2)) {
    const perGroup = count / 2;
    ids = Array.from({ length: perGroup }, (_, index) => index % 2 === 0
      ? [groups[0].rows[Math.floor(index / 2)].teamId, groups[1].rows[perGroup - 1 - Math.floor(index / 2)].teamId]
      : [groups[1].rows[Math.floor(index / 2)].teamId, groups[0].rows[perGroup - 1 - Math.floor(index / 2)].teamId]).flat();
  } else {
    const ranked = all.slice(0, count).map(item => item.row.teamId);
    ids = Array.from({ length: Math.floor(ranked.length / 2) }, (_, index) => [ranked[index], ranked[ranked.length - 1 - index]]).flat();
  }
  if (ids.length !== count || new Set(ids).size !== count) throw new Error(`Select exactly ${count} unique qualifiers.`);
  return ids.map((id, index) => {
    const item = all.find(entry => entry.row.teamId === id);
    if (!item) throw new Error('Every qualifier must belong to a tournament group.');
    if (preset !== 'CUSTOM' && item.row.unresolved) throw new Error(`Resolve the qualification tie in ${item.group.name} first, or choose an explicit custom order.`);
    return { teamId: id, groupId: item.group.id, sourceRef: preset === 'CUSTOM' ? `Seed ${index + 1}` : `${item.group.name} #${item.row.rank}` };
  });
}

export function reorderQualifier(ids: readonly string[], index: number, direction: -1 | 1): string[] {
  const next = [...ids], target = index + direction;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
