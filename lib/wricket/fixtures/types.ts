export type TournamentFormatType = 'GROUPS_ONLY' | 'GROUPS_THEN_KNOCKOUT' | 'KNOCKOUT_ONLY';
export type StageType = 'GROUP' | 'KNOCKOUT';
export type StageStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type FixtureStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'WALKOVER';
export type PairingAlgorithm =
  | 'ROUND_ROBIN'
  | 'DOUBLE_ROUND_ROBIN'
  | 'WEIGHTED_ROUND_ROBIN'
  | 'SWISS'
  | 'RANDOM_PAIRS';
export type Tiebreaker = 'HEAD_TO_HEAD' | 'GOAL_DIFF' | 'GOALS_FOR';
export type KOSeeding = 'TOP_VS_BOTTOM' | 'GROUP_WINNERS_PROTECTED' | 'RANDOM' | 'MANUAL';
export type KORoundName = 'R128' | 'R64' | 'R32' | 'R16' | 'QF' | 'SF' | 'F' | '3RD_PLACE' | string;

export interface FixtureGroup {
  id: string;
  stageId: string;
  name: string;
  teamIds: string[];
  seedByTeamId?: Record<string, number>;
}

export interface FixtureMatch {
  id: string;
  canonicalMatchId?: string;
  stageId: string;
  groupId?: string;
  roundId?: string;
  teamA: string;
  teamB?: string;
  round: number;
  leg: number;
  weight?: number;
  status: FixtureStatus;
  scoreA?: number;
  scoreB?: number;
  scheduledAt?: string;
  venue?: string;
  liveScore?: { runs: number; wickets: number; legalBalls: number; battingTeamId?: string; target?: number };
  result?: Record<string, unknown>;
  teamInningsStats?: Record<string, { runs: number; wickets: number; legalBalls: number }>;
}

export interface PairingConfig {
  idFactory?: () => string;
  random?: () => number;
  maxPairs?: number;
  swissPoints?: Record<string, number>;
  priorMatches?: FixtureMatch[];
}

export interface PairingStrategy {
  generate(group: FixtureGroup, config?: PairingConfig): FixtureMatch[];
  nextRound?(group: FixtureGroup, priorMatches: FixtureMatch[], config?: PairingConfig): FixtureMatch[];
}

export interface PointsRule {
  win: number;
  draw: number;
  loss: number;
}

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  rank: number;
  unresolved: boolean;
  tiebreakerTrace: string[];
}

export interface FormatRecommendation {
  formatType: TournamentFormatType;
  numberOfGroups: number;
  teamsPerGroup: number[];
  advancePerGroup: number;
  knockoutRounds: KORoundName[];
  byes: number;
  pairingAlgorithm: PairingAlgorithm;
  rationale: string;
  alternatives: Omit<FormatRecommendation, 'alternatives'>[];
}

export interface CustomFormat {
  id: string;
  name: string;
  ownerId: string;
  isReusableTemplate: boolean;
  stages: CustomStageDef[];
}

export interface CustomStageDef {
  type: StageType;
  order: number;
  dependsOnStageOrder?: number;
  groupCount?: number;
  groupSizes?: number[];
  pairingAlgorithm?: PairingAlgorithm;
  legs?: number;
  advancePerGroup?: number;
  pointsRule?: PointsRule;
  tiebreakers?: Tiebreaker[];
  knockoutRounds?: KORoundName[];
  seeding?: KOSeeding;
  legsPerTie?: number;
  qualifiersFrom?: string;
}

export interface SlotMapEntry {
  slot: number;
  sourceRef: string;
}

export interface KORound {
  id: string;
  name: KORoundName;
  matches: FixtureMatch[];
  slotMap: SlotMapEntry[];
}

export interface KnockoutBracket {
  id: string;
  stageId: string;
  rounds: KORound[];
  seedingSource: KOSeeding;
  bracketSize: number;
  byes: number;
}

export interface KnockoutConfig {
  rounds: KORoundName[];
  includeThirdPlacePlayoff?: boolean;
  seeding: KOSeeding;
  crossGroupPairingAvoidance?: boolean;
  manualOrder?: string[];
  idFactory?: () => string;
  random?: () => number;
}
