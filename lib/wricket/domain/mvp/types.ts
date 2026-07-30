import type { MatchFormat, MatchResult, MatchStatus } from '../types';

export type MvpCategory = 'batting' | 'bowling' | 'fielding' | 'award';
export type MvpTieBreaker =
  | 'TOTAL_POINTS'
  | 'WINNING_TEAM'
  | 'WICKETS'
  | 'FIELDING_POINTS'
  | 'BATTING_RUNS'
  | 'BATTING_STRIKE_RATE'
  | 'BOWLING_ECONOMY'
  | 'PLAYER_ID';

export interface MvpExplanationItem {
  category: MvpCategory;
  code: string;
  label: string;
  points: number;
  metadata?: Record<string, unknown>;
}

export interface MatchLengthConfig<T> {
  upTo7: T;
  upTo12: T;
  upTo16: T;
  upTo20: T;
  upTo26: T;
  upTo35: T;
  upTo40: T;
  upTo50: T;
  over50: T;
  test: T;
}

export interface MvpConfig {
  version: string;
  runsPerMvpPoint: number;
  batting: {
    performanceFactorByOvers: MatchLengthConfig<number>;
    enableStrikeRatePenalty: boolean;
    minimumBallsForStrikeRateAdjustment: number;
  };
  bowling: {
    baseRunsPerWicketByOvers: MatchLengthConfig<number>;
    batterPositionStrength: { top: number; middle: number; lower: number };
    wicketHaulBonuses: readonly { wickets: number; points: number; code: string }[];
    wicketHaulBonusesCumulative: boolean;
    performanceFactorByOvers: MatchLengthConfig<number>;
    enablePerformancePenalty: boolean;
    minimumLegalBallsForBowlingAdjustmentByOvers: MatchLengthConfig<number>;
    maximumBowlingPerformanceBonus: number;
    maidensPerWicketEquivalentByOvers: MatchLengthConfig<number>;
  };
  fielding: {
    assistedDismissalPercentage: number;
    directHitRunOutPercentage: number;
    assistedRunOutPercentage: number;
    awardCaughtAndBowledFieldingCredit: boolean;
  };
  awards: {
    playerOfMatchWinningTeamTopRankLimit: number;
    fighterOfMatchTopRankLimit: number;
    awardPlayerOfMatchForCompletedTie: boolean;
  };
  tieBreakers: readonly MvpTieBreaker[];
  precisionDecimalPlaces: number;
}

export interface MvpParticipant {
  playerId: string;
  teamId: string;
  battingPosition: number;
  teamSize: number;
  isSubstitute?: boolean;
}

export interface MvpDelivery {
  inningsId: string;
  strikerId: string;
  bowlerId: string;
  runsBat: number;
  runsExtra: number;
  extraKind: 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | null;
  isLegal: boolean;
  wicket?: {
    kind: string;
    outPlayerId: string;
    creditedToBowler: boolean;
    fielders: readonly string[];
    directHit?: boolean;
  };
}

export interface MvpInningsInput {
  id: string;
  battingTeamId: string;
  bowlingTeamId: string;
  deliveries?: readonly MvpDelivery[];
  summary?: {
    batters: readonly { playerId: string; runs: number; legalBalls: number }[];
    bowlers: readonly {
      playerId: string;
      legalBalls: number;
      runsConceded: number;
      wickets: number;
      maidens?: number;
    }[];
  };
  isSuperOver?: boolean;
}

export interface MatchMvpInput {
  matchId: string;
  tournamentId?: string;
  format: MatchFormat;
  scheduledOvers: number;
  ballsPerOver?: number;
  status: MatchStatus;
  result?: MatchResult;
  participants: readonly MvpParticipant[];
  innings: readonly MvpInningsInput[];
  calculatedAt?: string;
}

export interface BattingMvpBreakdown {
  runs: number;
  legalBalls: number;
  teamBatRuns: number;
  teamLegalBalls: number;
  basePoints: number;
  strikeRateBonus: number;
  strikeRateAdjustmentAvailable: boolean;
}

export interface BowlingMvpBreakdown {
  wickets: number;
  legalBalls: number;
  runsConceded: number;
  wicketPoints: number;
  wicketHaulBonus: number;
  performanceBonus: number;
  maidenOvers: number;
  maidenBonus: number;
  performanceAdjustmentAvailable: boolean;
}

export interface FieldingMvpBreakdown {
  catches: number;
  stumpings: number;
  directHitRunOuts: number;
  assistedRunOuts: number;
  catchPoints: number;
  stumpingPoints: number;
  directHitRunOutPoints: number;
  assistedRunOutPoints: number;
}

export interface PlayerMvpResult {
  matchId: string;
  playerId: string;
  teamId: string;
  battingPoints: number;
  bowlingPoints: number;
  fieldingPoints: number;
  totalPoints: number;
  rank: number | null;
  order: number;
  battingBreakdown: BattingMvpBreakdown;
  bowlingBreakdown: BowlingMvpBreakdown;
  fieldingBreakdown: FieldingMvpBreakdown;
  explanations: readonly MvpExplanationItem[];
  isPlayerOfTheMatch: boolean;
  isFighterOfTheMatch: boolean;
  algorithmVersion: string;
  calculatedAt: string;
}

export interface MatchMvpResult {
  matchId: string;
  algorithmVersion: string;
  calculatedAt: string;
  playerOfTheMatchId?: string;
  fighterOfTheMatchId?: string;
  rankings: readonly PlayerMvpResult[];
}

export interface TournamentMvpRow {
  playerId: string;
  teamIds: readonly string[];
  matchesPlayed: number;
  battingPoints: number;
  bowlingPoints: number;
  fieldingPoints: number;
  totalPoints: number;
  playerOfTheMatchCount: number;
  fighterOfTheMatchCount: number;
  topThreeCount: number;
  runs: number;
  wickets: number;
  fieldingDismissals: number;
  algorithmVersions: readonly string[];
  rank: number;
}
