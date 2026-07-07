export type MatchFormat = 'BOX' | 'TURF' | 'TURF_TEST';

export type DismissalKind =
  | 'BOWLED'
  | 'CAUGHT'
  | 'LBW'
  | 'RUN_OUT'
  | 'STUMPED'
  | 'HIT_WICKET'
  | 'RETIRED';

export type ExtraKind = 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | null;

export type MatchStatus =
  | 'SETUP'
  | 'TOSS'
  | 'IN_PROGRESS'
  | 'INNINGS_BREAK'
  | 'FOLLOW_ON_DECISION'
  | 'COMPLETED'
  | 'ABANDONED';

export type ResultKind =
  | 'WIN_BY_RUNS'
  | 'WIN_BY_WICKETS'
  | 'WIN_BY_INNINGS'
  | 'TIE'
  | 'NO_RESULT';

export type TossChoice = 'BAT' | 'BOWL';

export type PlayerRole = 'BAT' | 'BOWL' | 'AR' | 'WK';

export interface User {
  id: string;
  name: string;
  role: PlayerRole;
  battingHand?: 'RIGHT' | 'LEFT';
  bowlingStyle?: string;
  createdAt: number;
}

export interface Tournament {
  id: string;
  name: string;
  format: MatchFormat;
  startDate: number;
  endDate?: number;
  pointsWin: number;
  pointsTie: number;
  pointsLoss: number;
  pointsNoResult: number;
  status: 'ACTIVE' | 'COMPLETED';
  createdAt: number;
}

export interface Team {
  id: string;
  tournamentId: string | null;
  name: string;
  shortName: string;
  colorHex: string;
  createdAt: number;
}

export interface TeamPlayer {
  teamId: string;
  userId: string;
  jerseyNo?: number;
  isCaptain: boolean;
  isKeeper: boolean;
}

export interface FormatRules {
  oversPerInnings: number;
  inningsPerTeam: 1 | 2;
  playersPerSide: number;
  maxOversPerBowler: number;
  followOnEnabled: boolean;
  followOnThreshold: number;
  lbwEnabled: boolean;
  powerPlayOvers: number;
}

export interface Match {
  id: string;
  tournamentId: string | null;
  format: MatchFormat;
  rules: FormatRules;
  teamAId: string;
  teamBId: string;
  venue?: string;
  scheduledAt?: number;
  tossWinnerTeamId?: string;
  tossChoice?: TossChoice;
  status: MatchStatus;
  result?: MatchResult;
  createdAt: number;
}

export interface MatchResult {
  kind: ResultKind;
  winnerTeamId?: string;
  margin?: number;
  marginUnit?: 'RUNS' | 'WICKETS';
}

export interface Innings {
  id: string;
  matchId: string;
  sequence: 1 | 2 | 3 | 4;
  battingTeamId: string;
  bowlingTeamId: string;
  totalRuns: number;
  totalWickets: number;
  totalBalls: number;
  isClosed: boolean;
  isFollowOn: boolean;
  target?: number;
}

export interface Ball {
  id: string;
  inningsId: string;
  overNo: number;
  ballInOver: number;
  legalBallInOver: number;
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  runsBat: number;
  runsExtra: number;
  extraKind: ExtraKind;
  isLegal: boolean;
  isWicket: boolean;
  dismissal?: {
    kind: DismissalKind;
    outPlayerId: string;
    fielderId?: string;
  };
  createdAt: number;
}

export const DEFAULT_RULES: Record<MatchFormat, FormatRules> = {
  BOX: {
    oversPerInnings: 5,
    inningsPerTeam: 1,
    playersPerSide: 6,
    maxOversPerBowler: 1,
    followOnEnabled: false,
    followOnThreshold: 0,
    lbwEnabled: false,
    powerPlayOvers: 0,
  },
  TURF: {
    oversPerInnings: 10,
    inningsPerTeam: 1,
    playersPerSide: 11,
    maxOversPerBowler: 2,
    followOnEnabled: false,
    followOnThreshold: 0,
    lbwEnabled: true,
    powerPlayOvers: 2,
  },
  TURF_TEST: {
    oversPerInnings: 5,
    inningsPerTeam: 2,
    playersPerSide: 11,
    maxOversPerBowler: 2,
    followOnEnabled: true,
    followOnThreshold: 25,
    lbwEnabled: true,
    powerPlayOvers: 0,
  },
};

export const FORMAT_LABEL: Record<MatchFormat, string> = {
  BOX: 'Box Cricket',
  TURF: 'Turf Cricket',
  TURF_TEST: 'Turf Test',
};
