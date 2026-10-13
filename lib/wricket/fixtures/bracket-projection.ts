import type { FixtureMatch } from './types';

/** Bracket seed order is durable; database UUID/read order is not bracket order. */
export function orderedBracketMatches(template: readonly FixtureMatch[], current: readonly FixtureMatch[]): FixtureMatch[] {
  const used = new Set<string>();
  const ordered = template.flatMap(slot => {
    const match = current.find(row => !used.has(row.id) && (row.id === slot.id ||
      (row.teamA === slot.teamA && row.teamB === slot.teamB && row.leg === slot.leg)));
    if (!match) return [];
    used.add(match.id);
    return [match];
  });
  return [...ordered, ...current.filter(row => !used.has(row.id))];
}
