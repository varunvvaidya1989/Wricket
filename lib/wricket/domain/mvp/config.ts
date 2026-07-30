import type { MatchFormat } from '../types';
import type { MatchLengthConfig, MvpConfig } from './types';

const factors: MatchLengthConfig<number> = {
  upTo7: 0.08, upTo12: 0.08, upTo16: 0.08, upTo20: 0.08,
  upTo26: 0.06, upTo35: 0.06, upTo40: 0.04, upTo50: 0.04,
  over50: 0.02, test: 0.02,
};

export const DEFAULT_MVP_CONFIG: Readonly<MvpConfig> = Object.freeze({
  version: 'wricket-mvp-v1',
  runsPerMvpPoint: 10,
  batting: {
    performanceFactorByOvers: factors,
    enableStrikeRatePenalty: false,
    minimumBallsForStrikeRateAdjustment: 3,
  },
  bowling: {
    baseRunsPerWicketByOvers: {
      upTo7: 12, upTo12: 14, upTo16: 16, upTo20: 18,
      upTo26: 20, upTo35: 22, upTo40: 22, upTo50: 25,
      over50: 27, test: 25,
    },
    batterPositionStrength: { top: 1, middle: 0.8, lower: 0.6 },
    wicketHaulBonuses: [
      { wickets: 3, points: 0.5, code: 'BOWLING_THREE_WICKET_BONUS' },
      { wickets: 5, points: 1, code: 'BOWLING_FIVE_WICKET_BONUS' },
      { wickets: 10, points: 1.5, code: 'BOWLING_TEN_WICKET_BONUS' },
    ],
    wicketHaulBonusesCumulative: false,
    performanceFactorByOvers: factors,
    enablePerformancePenalty: false,
    // One over in short cricket; two overs in longer limited-overs; five in Tests.
    minimumLegalBallsForBowlingAdjustmentByOvers: {
      upTo7: 6, upTo12: 6, upTo16: 6, upTo20: 6,
      upTo26: 12, upTo35: 12, upTo40: 12, upTo50: 12,
      over50: 30, test: 30,
    },
    maximumBowlingPerformanceBonus: 1,
    maidensPerWicketEquivalentByOvers: {
      upTo7: 1, upTo12: 2, upTo16: 2, upTo20: 2,
      upTo26: 2, upTo35: 3, upTo40: 3, upTo50: 3,
      over50: 6, test: 6,
    },
  },
  fielding: {
    assistedDismissalPercentage: 0.2,
    directHitRunOutPercentage: 1,
    assistedRunOutPercentage: 1,
    awardCaughtAndBowledFieldingCredit: true,
  },
  awards: {
    playerOfMatchWinningTeamTopRankLimit: 3,
    fighterOfMatchTopRankLimit: 3,
    awardPlayerOfMatchForCompletedTie: true,
  },
  tieBreakers: [
    'TOTAL_POINTS', 'WINNING_TEAM', 'WICKETS', 'FIELDING_POINTS',
    'BATTING_RUNS', 'BATTING_STRIKE_RATE', 'BOWLING_ECONOMY', 'PLAYER_ID',
  ] as const,
  precisionDecimalPlaces: 6,
});

export function valueForMatchLength<T>(
  values: MatchLengthConfig<T>,
  overs: number,
  format: MatchFormat,
): T {
  if (format === 'TURF_TEST') return values.test;
  if (overs <= 7) return values.upTo7;
  if (overs <= 12) return values.upTo12;
  if (overs <= 16) return values.upTo16;
  if (overs <= 20) return values.upTo20;
  if (overs <= 26) return values.upTo26;
  if (overs <= 35) return values.upTo35;
  if (overs <= 40) return values.upTo40;
  if (overs <= 50) return values.upTo50;
  return values.over50;
}

export function battingPositionBand(position: number, teamSize: number): 'top' | 'middle' | 'lower' {
  const size = Math.max(1, teamSize);
  const topEnd = Math.max(1, Math.round(size * 0.36));
  const middleEnd = Math.min(size, topEnd + Math.max(1, Math.round(size * 0.36)));
  if (position <= topEnd) return 'top';
  if (position <= middleEnd) return 'middle';
  return 'lower';
}
