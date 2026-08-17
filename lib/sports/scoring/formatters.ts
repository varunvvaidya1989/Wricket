import type {
  MatchOptions,
  NotationFormatter,
  Side,
  SportConfig,
  UnitState,
} from './types';

export const numericNotation: NotationFormatter = ({ score }) => String(score);

export const tennisNotation: NotationFormatter = ({ score, opponentScore, unit }) => {
  if (unit.level !== 'game' || unit.variant === 'tie_break') return String(score);
  const labels = ['Love', '15', '30', '40'] as const;
  if (score < 3) return labels[score];
  if (score === opponentScore || score < opponentScore) return '40';
  return opponentScore >= 3 ? 'AD' : '40';
};

/** Formats one side without ever changing the raw integer score in state. */
export function formatScore(
  config: SportConfig,
  unit: UnitState,
  side: Side,
  options: MatchOptions = config.defaultOptions ?? Object.freeze({}),
): string {
  const opponent = side === 0 ? 1 : 0;
  return config.notation({
    score: unit.score[side],
    opponentScore: unit.score[opponent],
    side,
    unit,
    options,
  });
}
