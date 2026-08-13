import { describe, expect, it } from 'vitest';

import type { FixtureMatch } from './types';
import { projectManualBracket } from './manual-schedule';

describe('manual schedule bracket projection', () => {
  it('groups owner-created fixtures by named round and preserves stage order', () => {
    const bracket = projectManualBracket('stage-1', [
      fixture('final', 'F', 2, 'team-1', 'team-3'),
      fixture('semi-1', 'SF', 1, 'team-1', 'team-2'),
      fixture('semi-2', 'SF', 1, 'team-3', 'team-4'),
    ]);

    expect(bracket?.rounds.map(round => [round.name, round.matches.length])).toEqual([
      ['SF', 2],
      ['F', 1],
    ]);
    expect(bracket).toMatchObject({
      stageId: 'stage-1',
      seedingSource: 'MANUAL',
      bracketSize: 4,
      byes: 0,
    });
  });

  it('returns no bracket without knockout fixtures and calculates owner-selected byes', () => {
    expect(projectManualBracket('stage-1', [])).toBeNull();
    expect(projectManualBracket('stage-1', [
      fixture('quarter-1', 'QF', 1, 'team-1', 'team-2'),
      fixture('quarter-2', 'QF', 1, 'team-3', 'team-4'),
      fixture('quarter-3', 'QF', 1, 'team-5', 'team-6'),
    ])).toMatchObject({ bracketSize: 8, byes: 2 });
  });
});

function fixture(
  id: string,
  roundId: string,
  round: number,
  teamA: string,
  teamB: string,
): FixtureMatch {
  return {
    id,
    stageId: 'stage-1',
    roundId,
    teamA,
    teamB,
    round,
    leg: 1,
    status: 'SCHEDULED',
  };
}
