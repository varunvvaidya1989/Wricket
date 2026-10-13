import { expect, it } from 'vitest';
import { orderedBracketMatches } from './bracket-projection';
import type { FixtureMatch } from './types';

it('retains custom seeds and qualifier-one order when canonical rows arrive in UUID order', () => {
  const template: FixtureMatch[] = Array.from({ length: 4 }, (_, index) => ({
    id: `temporary-${index}`, stageId: 'stage', teamA: `seed-${index * 2 + 1}`,
    teamB: `seed-${index * 2 + 2}`, round: 1, leg: 1, status: 'SCHEDULED',
  }));
  const current = template.map((row, index) => ({ ...row, id: `canonical-${index}`, status: 'COMPLETED' as const }));
  expect(orderedBracketMatches(template, [current[3], current[1], current[2], current[0]])).toEqual(current);
  expect(orderedBracketMatches(template, current.slice(0, 2))).toEqual(current.slice(0, 2));
});
