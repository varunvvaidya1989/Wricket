export type Side = 0 | 1;

export type MatchFormat = 'SINGLES' | 'DOUBLES';

export type Score = readonly [number, number];

export type MatchOptionValue = boolean | number | string | undefined;

export type MatchOptions = Readonly<Record<string, MatchOptionValue>>;

export interface ChildSelectionContext {
  readonly parent: UnitState;
  readonly options: MatchOptions;
}

/**
 * One node in the scoring hierarchy. A point is the only atomic leaf; every
 * other unit counts resolved children using the same target-and-margin rule.
 */
export interface UnitConfig {
  readonly key: string;
  readonly level: string;
  readonly target: number;
  readonly winBy: number;
  readonly cap?: number;
  readonly variant?: string;
  readonly child?: UnitConfig;
  readonly selectChild?: (context: ChildSelectionContext) => UnitConfig;
}

export interface UnitState {
  readonly configKey: string;
  readonly level: string;
  readonly variant?: string;
  readonly score: Score;
  readonly isComplete: boolean;
  readonly winner?: Side;
  readonly children: readonly UnitState[];
}

export interface AncestorSnapshot {
  readonly unit: UnitConfig;
  readonly score: Score;
}

export interface UnitEvaluation {
  readonly isComplete: boolean;
  readonly winner?: Side;
  readonly resolvedBy?: 'target_margin' | 'cap' | string;
}

export interface UnitEvaluationContext {
  readonly options?: MatchOptions;
  readonly specialRules?: readonly SpecialRule[];
  readonly ancestors?: readonly AncestorSnapshot[];
}

export interface SpecialRuleResolutionContext {
  readonly unit: UnitConfig;
  readonly score: Score;
  readonly options: MatchOptions;
  readonly ancestors: readonly AncestorSnapshot[];
}

export interface UnitTransition {
  readonly unit: UnitConfig;
  readonly previousScore: Score;
  readonly score: Score;
  readonly evaluation: UnitEvaluation;
  readonly ancestors: readonly AncestorSnapshot[];
}

export interface PointEvent {
  readonly type: 'POINT';
  readonly sequence: number;
  readonly winner: Side;
  readonly occurredAt?: number;
}

export interface ScoringEffect {
  readonly type: string;
  readonly ruleId: string;
  readonly sequence: number;
  readonly unit: string;
  readonly side?: Side;
}

export interface SpecialRuleEffectContext {
  readonly event: PointEvent;
  readonly options: MatchOptions;
  readonly before: MatchState;
  readonly root: UnitState;
  readonly transitions: readonly UnitTransition[];
}

/** A hook supplied by configuration, never selected by a sport branch. */
export interface SpecialRule {
  readonly id: string;
  readonly resolve?: (context: SpecialRuleResolutionContext) => Side | undefined;
  readonly effects?: (context: SpecialRuleEffectContext) => readonly ScoringEffect[];
}

export interface ServeState {
  readonly servingSide: Side;
  readonly serverNumber?: 1 | 2;
}

export interface InitialServeContext {
  readonly initialServer: Side;
  readonly options: MatchOptions;
}

export interface ServeAwardContext {
  readonly event: PointEvent;
  readonly state: MatchState;
  readonly options: MatchOptions;
}

export interface ServeUpdateContext {
  readonly event: PointEvent;
  readonly scoringSide: Side | undefined;
  readonly previousState: MatchState;
  readonly root: UnitState;
  readonly transitions: readonly UnitTransition[];
  readonly options: MatchOptions;
}

export interface ServiceCourtContext {
  readonly state: MatchState;
  readonly options: MatchOptions;
}

export type ServiceCourt = 'left' | 'right';

export interface ServeModel {
  readonly id: string;
  readonly initialize: (context: InitialServeContext) => ServeState;
  readonly awardPoint?: (context: ServeAwardContext) => Side | undefined;
  readonly update: (context: ServeUpdateContext) => ServeState;
  readonly deriveServiceCourt?: (context: ServiceCourtContext) => ServiceCourt;
}

export interface NotationContext {
  readonly score: number;
  readonly opponentScore: number;
  readonly side: Side;
  readonly unit: UnitState;
  readonly options: MatchOptions;
}

export type NotationFormatter = (context: NotationContext) => string;

export interface SportConfig {
  readonly id: string;
  readonly name: string;
  readonly equipment: 'strung_racquet' | 'solid_paddle';
  readonly matchFormats: readonly MatchFormat[];
  readonly root: UnitConfig;
  readonly serveModel: ServeModel;
  readonly notation: NotationFormatter;
  readonly specialRules?: readonly SpecialRule[];
  readonly defaultOptions?: MatchOptions;
}

export interface MatchState {
  readonly sportId: string;
  readonly root: UnitState;
  readonly serve: ServeState;
  readonly options: MatchOptions;
  readonly eventCount: number;
  readonly isComplete: boolean;
  readonly winner?: Side;
  readonly effects: readonly ScoringEffect[];
  readonly effectsByEvent: readonly (readonly ScoringEffect[])[];
}

export interface ReplaySettings {
  readonly initialServer?: Side;
  readonly options?: MatchOptions;
}

export interface UndoResult {
  readonly events: readonly PointEvent[];
  readonly state: MatchState;
}
