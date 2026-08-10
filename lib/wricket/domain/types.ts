export type MatchFormat = 'BOX' | 'TURF' | 'TURF_TEST' | 'T20' | 'T10' | 'ODI';

export type DismissalKind =
  | 'BOWLED'
  | 'CAUGHT'
  | 'LBW'
  | 'RUN_OUT'
  | 'STUMPED'
  | 'HIT_WICKET'
  | 'RETIRED_OUT';

export type ExtraKind = 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | null;
export type ScoreAdjustmentKind = 'PENALTY' | 'BONUS';
export type RetirementKind = 'RETIRED_HURT' | 'RETIRED_OUT';

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
  | 'DRAW'
  | 'NO_RESULT'
  | 'WALKOVER'
  | 'CANCELLED';

export type TossChoice = 'BAT' | 'BOWL';

export type PlayerRole = 'BAT' | 'BOWL' | 'AR' | 'WK';
export type SyncStatus = 'LOCAL' | 'PENDING' | 'SYNCED' | 'FAILED';

export interface User {
  id: string;
  name: string;
  role: PlayerRole;
  battingHand?: 'RIGHT' | 'LEFT';
  bowlingStyle?: string;
  createdAt: number;
  cloudId?: string;
  syncStatus: SyncStatus;
  syncError?: string;
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
  organizerProfileId?: string;
  organizerPhone?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  plannedTeamCount: number;
  playersPerTeam: number;
  oversPerMatch: number;
  description?: string;
  rewards?: string;
  socialMediaUrl?: string;
  bannerLocalUri?: string;
  logoLocalUri?: string;
  bannerUrl?: string;
  logoUrl?: string;
  cloudId?: string;
  syncStatus: SyncStatus;
  syncError?: string;
}

export interface Team {
  id: string;
  tournamentId: string | null;
  name: string;
  shortName: string;
  colorHex: string;
  logoUrl?: string;
  createdAt: number;
  cloudId?: string;
  syncStatus: SyncStatus;
  syncError?: string;
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
    assistantFielderId?: string;
  };
  createdAt: number;
}

export interface ScoreAdjustment {
  id: string;
  inningsId: string;
  kind: ScoreAdjustmentKind;
  runs: number;
  note?: string;
  createdAt: number;
}

export interface BatterRetirement {
  id: string;
  inningsId: string;
  playerId: string;
  kind: RetirementKind;
  createdAt: number;
}

export type PendingScoringPrompt = 'NEXT_BATTER' | 'NEXT_BOWLER' | 'INNINGS_BREAK' | null;

export interface ScoringSession {
  matchId: string;
  inningsId: string;
  strikerId?: string;
  nonStrikerId?: string;
  bowlerId?: string;
  pendingPrompt: PendingScoringPrompt;
  pendingPlayerId?: string;
  completedOver?: number;
  lastCommittedEventSequence: number;
  updatedAt: number;
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
    oversPerInnings: 90,
    inningsPerTeam: 2,
    playersPerSide: 11,
    maxOversPerBowler: 90,
    followOnEnabled: true,
    followOnThreshold: 200,
    lbwEnabled: true,
    powerPlayOvers: 0,
  },
  T20: {
    oversPerInnings: 20,
    inningsPerTeam: 1,
    playersPerSide: 11,
    maxOversPerBowler: 4,
    followOnEnabled: false,
    followOnThreshold: 0,
    lbwEnabled: true,
    powerPlayOvers: 6,
  },
  T10: {
    oversPerInnings: 10,
    inningsPerTeam: 1,
    playersPerSide: 11,
    maxOversPerBowler: 2,
    followOnEnabled: false,
    followOnThreshold: 0,
    lbwEnabled: true,
    powerPlayOvers: 3,
  },
  ODI: {
    oversPerInnings: 50,
    inningsPerTeam: 1,
    playersPerSide: 11,
    maxOversPerBowler: 10,
    followOnEnabled: false,
    followOnThreshold: 0,
    lbwEnabled: true,
    powerPlayOvers: 10,
  },
};

export const FORMAT_LABEL: Record<MatchFormat, string> = {
  BOX: 'Box Cricket',
  TURF: 'Turf cricket',
  TURF_TEST: 'Test',
  T20: 'T20',
  T10: 'T10',
  ODI: 'ODI',
};
