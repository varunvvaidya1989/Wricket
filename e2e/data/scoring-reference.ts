import type { ScoringEvent, ScoringRules } from '@/lib/wricket/domain/scoring/events';

// Reviewed literals, not expected values recomputed with the implementation.
export const referenceRules: ScoringRules = {
  format: 'TURF', inningsKind: 'LIMITED_OVERS', ballsPerOver: 6,
  oversLimit: 2, playersPerSide: 7, wicketsAvailable: 6,
  allowLbw: true, allowFreeHit: true, allowRetiredBatterReturn: true,
};
export const referenceOpening = {
  inningsId: 'reference-innings', battingTeamId: 'team-a', bowlingTeamId: 'team-b',
  strikerId: 'batter-a', nonStrikerId: 'batter-b', bowlerId: 'bowler-a',
};
export const referenceEvents: readonly ScoringEvent[] = [
  { type: 'DELIVERY', sequence: 1, inningsId: 'reference-innings', strikerId: 'batter-a', nonStrikerId: 'batter-b', bowlerId: 'bowler-a', runs: { extraKind: null, bat: 1, extras: 0 } },
  { type: 'DELIVERY', sequence: 2, inningsId: 'reference-innings', strikerId: 'batter-b', nonStrikerId: 'batter-a', bowlerId: 'bowler-a', runs: { extraKind: null, bat: 4, extras: 0 } },
  { type: 'DELIVERY', sequence: 3, inningsId: 'reference-innings', strikerId: 'batter-b', nonStrikerId: 'batter-a', bowlerId: 'bowler-a', runs: { extraKind: null, bat: 0, extras: 0 } },
  { type: 'DELIVERY', sequence: 4, inningsId: 'reference-innings', strikerId: 'batter-b', nonStrikerId: 'batter-a', bowlerId: 'bowler-a', runs: { extraKind: 'WIDE', bat: 0, extras: 1 } },
  { type: 'DELIVERY', sequence: 5, inningsId: 'reference-innings', strikerId: 'batter-b', nonStrikerId: 'batter-a', bowlerId: 'bowler-a', runs: { extraKind: 'NO_BALL', bat: 0, extras: 1 } },
  { type: 'DELIVERY', sequence: 6, inningsId: 'reference-innings', strikerId: 'batter-b', nonStrikerId: 'batter-a', bowlerId: 'bowler-a', runs: { extraKind: 'BYE', bat: 0, extras: 2 } },
  { type: 'ADJUSTMENT', sequence: 7, inningsId: 'reference-innings', kind: 'PENALTY', runs: 5 },
];
export const referenceExpected = {
  runsBeforeAdjustment: 9, runsAfterAdjustment: 14, legalBalls: 4,
  strikerId: 'batter-b', nonStrikerId: 'batter-a',
  batterRuns: [1, 4], bowlerRunsConceded: 7,
  extras: { byes: 2, legByes: 0, wides: 1, noBalls: 1, penalties: 5, bonuses: 0, total: 9 },
};
