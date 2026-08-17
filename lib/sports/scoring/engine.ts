import type {
  AncestorSnapshot,
  MatchOptions,
  MatchState,
  PointEvent,
  ReplaySettings,
  Score,
  ScoringEffect,
  Side,
  SportConfig,
  UndoResult,
  UnitConfig,
  UnitEvaluation,
  UnitEvaluationContext,
  UnitState,
  UnitTransition,
} from './types';

export type ScoringEngineErrorCode =
  | 'INVALID_CONFIG'
  | 'INVALID_EVENT'
  | 'MATCH_COMPLETE';

export class ScoringEngineError extends Error {
  readonly code: ScoringEngineErrorCode;
  readonly eventIndex?: number;

  constructor(code: ScoringEngineErrorCode, message: string, eventIndex?: number) {
    super(message);
    this.name = 'ScoringEngineError';
    this.code = code;
    this.eventIndex = eventIndex;
  }
}

interface UnitUpdate {
  readonly state: UnitState;
  readonly transitions: readonly UnitTransition[];
}

/**
 * The one win evaluator used at point, game, set, and match level.
 * Special rules can resolve a unit first; otherwise target/margin/cap wins.
 */
export function evaluateUnit(
  unit: UnitConfig,
  score: Score,
  context: UnitEvaluationContext = {},
): UnitEvaluation {
  assertScore(score);
  const options = context.options ?? Object.freeze({});
  const ancestors = context.ancestors ?? Object.freeze([]);

  for (const rule of context.specialRules ?? []) {
    const winner = rule.resolve?.({ unit, score, options, ancestors });
    if (winner !== undefined) {
      return Object.freeze({ isComplete: true, winner, resolvedBy: rule.id });
    }
  }

  const leadingSide = score[0] === score[1] ? undefined : score[0] > score[1] ? 0 : 1;
  if (leadingSide === undefined) return INCOMPLETE_EVALUATION;

  const highScore = score[leadingSide];
  const lowScore = score[opposite(leadingSide)];
  if (unit.cap !== undefined && highScore >= unit.cap) {
    return Object.freeze({ isComplete: true, winner: leadingSide, resolvedBy: 'cap' });
  }
  if (highScore >= unit.target && highScore - lowScore >= unit.winBy) {
    return Object.freeze({ isComplete: true, winner: leadingSide, resolvedBy: 'target_margin' });
  }
  return INCOMPLETE_EVALUATION;
}

export function createPointEvent(event: PointEvent): PointEvent {
  assertPointEvent(event);
  return Object.freeze({ ...event });
}

/** Returns a new immutable log. It never mutates the supplied history. */
export function appendPointEvent(
  events: readonly PointEvent[],
  event: PointEvent,
): readonly PointEvent[] {
  const next = createPointEvent(event);
  const previous = events.at(-1);
  if (previous && next.sequence <= previous.sequence) {
    throw new ScoringEngineError('INVALID_EVENT', 'Point event sequences must increase.');
  }
  return Object.freeze([...events, next]);
}

/** Drops one event and derives the replacement state entirely by replay. */
export function undoLastPoint(
  config: SportConfig,
  events: readonly PointEvent[],
  settings: ReplaySettings = {},
): UndoResult {
  const remaining = Object.freeze(events.slice(0, -1));
  return Object.freeze({ events: remaining, state: replay(config, remaining, settings) });
}

export function replay(
  config: SportConfig,
  events: readonly PointEvent[],
  settings: ReplaySettings = {},
): MatchState {
  validateConfig(config.root);
  const options = freezeOptions({ ...config.defaultOptions, ...settings.options });
  const initialServer = settings.initialServer ?? 0;
  assertSide(initialServer, 'initial server');

  let state = freezeMatchState({
    sportId: config.id,
    root: createUnitState(config.root),
    serve: config.serveModel.initialize({ initialServer, options }),
    options,
    eventCount: 0,
    isComplete: false,
    effects: [],
    effectsByEvent: [],
  });
  let previousSequence = 0;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    try {
      assertPointEvent(event);
    } catch (error) {
      throw withEventIndex(error, index);
    }
    if (event.sequence <= previousSequence) {
      throw new ScoringEngineError(
        'INVALID_EVENT',
        'Point event sequences must increase.',
        index,
      );
    }
    if (state.isComplete) {
      throw new ScoringEngineError(
        'MATCH_COMPLETE',
        'A point cannot be recorded after the match is complete.',
        index,
      );
    }
    previousSequence = event.sequence;

    const scoringSide = config.serveModel.awardPoint
      ? config.serveModel.awardPoint({ event, state, options })
      : event.winner;
    if (scoringSide !== undefined) assertSide(scoringSide, 'scoring side');

    const update = scoringSide === undefined
      ? { state: state.root, transitions: Object.freeze([]) }
      : updateUnit(
          state.root,
          config.root,
          scoringSide,
          options,
          config.specialRules ?? [],
          [],
        );

    const serve = config.serveModel.update({
      event,
      scoringSide,
      previousState: state,
      root: update.state,
      transitions: update.transitions,
      options,
    });
    const eventEffects = (config.specialRules ?? []).flatMap((rule) =>
      rule.effects?.({
        event,
        options,
        before: state,
        root: update.state,
        transitions: update.transitions,
      }) ?? [],
    );
    const frozenEventEffects = freezeEffects(eventEffects);

    state = freezeMatchState({
      sportId: config.id,
      root: update.state,
      serve,
      options,
      eventCount: state.eventCount + 1,
      isComplete: update.state.isComplete,
      winner: update.state.winner,
      effects: [...state.effects, ...frozenEventEffects],
      effectsByEvent: [...state.effectsByEvent, frozenEventEffects],
    });
  }

  return state;
}

export function getCurrentUnit(
  state: MatchState | UnitState,
  level: string,
): UnitState | undefined {
  let unit = 'root' in state ? state.root : state;
  let match = unit.level === level ? unit : undefined;
  while (unit.children.length > 0) {
    unit = unit.children[unit.children.length - 1];
    if (unit.level === level) match = unit;
  }
  return match;
}

export function getUnits(state: MatchState | UnitState, level: string): readonly UnitState[] {
  const root = 'root' in state ? state.root : state;
  const matches: UnitState[] = [];
  visitUnit(root, (unit) => {
    if (unit.level === level) matches.push(unit);
  });
  return Object.freeze(matches);
}

function updateUnit(
  current: UnitState,
  config: UnitConfig,
  scoringSide: Side,
  options: MatchOptions,
  specialRules: SportConfig['specialRules'],
  ancestors: readonly AncestorSnapshot[],
): UnitUpdate {
  if (!config.child && !config.selectChild) {
    return incrementUnit(current, config, scoringSide, options, specialRules, ancestors);
  }

  const childConfig = selectChild(config, current, options);
  const lastChild = current.children.at(-1);
  const child = lastChild && !lastChild.isComplete
    ? lastChild
    : createUnitState(childConfig);
  if (child.configKey !== childConfig.key) {
    throw new ScoringEngineError(
      'INVALID_CONFIG',
      `Child selector changed while ${child.level} was in progress.`,
    );
  }

  const childUpdate = updateUnit(
    child,
    childConfig,
    scoringSide,
    options,
    specialRules,
    [...ancestors, { unit: config, score: current.score }],
  );
  const children = lastChild && !lastChild.isComplete
    ? [...current.children.slice(0, -1), childUpdate.state]
    : [...current.children, childUpdate.state];

  const withChild = freezeUnitState({ ...current, children });
  if (!child.isComplete && childUpdate.state.isComplete) {
    const parentUpdate = incrementUnit(
      withChild,
      config,
      childUpdate.state.winner as Side,
      options,
      specialRules,
      ancestors,
    );
    return {
      state: parentUpdate.state,
      transitions: Object.freeze([...childUpdate.transitions, ...parentUpdate.transitions]),
    };
  }

  return { state: withChild, transitions: childUpdate.transitions };
}

function incrementUnit(
  current: UnitState,
  config: UnitConfig,
  scoringSide: Side,
  options: MatchOptions,
  specialRules: SportConfig['specialRules'],
  ancestors: readonly AncestorSnapshot[],
): UnitUpdate {
  const score: Score = scoringSide === 0
    ? Object.freeze([current.score[0] + 1, current.score[1]])
    : Object.freeze([current.score[0], current.score[1] + 1]);
  const evaluation = evaluateUnit(config, score, {
    options,
    specialRules,
    ancestors,
  });
  const state = freezeUnitState({
    ...current,
    score,
    isComplete: evaluation.isComplete,
    winner: evaluation.winner,
  });
  const transition: UnitTransition = Object.freeze({
    unit: config,
    previousScore: current.score,
    score,
    evaluation,
    ancestors: Object.freeze([...ancestors]),
  });
  return { state, transitions: Object.freeze([transition]) };
}

function selectChild(
  config: UnitConfig,
  state: UnitState,
  options: MatchOptions,
): UnitConfig {
  const child = config.selectChild?.({ parent: state, options }) ?? config.child;
  if (!child) {
    throw new ScoringEngineError('INVALID_CONFIG', `${config.key} has no child configuration.`);
  }
  return child;
}

function createUnitState(config: UnitConfig): UnitState {
  return freezeUnitState({
    configKey: config.key,
    level: config.level,
    variant: config.variant,
    score: [0, 0],
    isComplete: false,
    children: [],
  });
}

function validateConfig(config: UnitConfig, seen = new Set<UnitConfig>()): void {
  if (seen.has(config)) {
    throw new ScoringEngineError('INVALID_CONFIG', 'The static unit hierarchy contains a cycle.');
  }
  if (!config.key || !config.level || !Number.isInteger(config.target) || config.target < 1) {
    throw new ScoringEngineError('INVALID_CONFIG', 'Every unit needs a key, level, and positive target.');
  }
  if (!Number.isInteger(config.winBy) || config.winBy < 1) {
    throw new ScoringEngineError('INVALID_CONFIG', `${config.key} needs a positive winBy margin.`);
  }
  if (config.cap !== undefined && (!Number.isInteger(config.cap) || config.cap < config.target)) {
    throw new ScoringEngineError('INVALID_CONFIG', `${config.key} has an invalid cap.`);
  }
  if (config.child) validateConfig(config.child, new Set([...seen, config]));
}

function assertPointEvent(event: PointEvent): void {
  if (event.type !== 'POINT' || !Number.isInteger(event.sequence) || event.sequence < 1) {
    throw new ScoringEngineError('INVALID_EVENT', 'A point needs type POINT and a positive sequence.');
  }
  assertSide(event.winner, 'point winner');
}

function assertSide(value: number, label: string): asserts value is Side {
  if (value !== 0 && value !== 1) {
    throw new ScoringEngineError('INVALID_EVENT', `${label} must be side 0 or 1.`);
  }
}

function assertScore(score: Score): void {
  if (
    score.length !== 2
    || score.some((value) => !Number.isInteger(value) || value < 0)
  ) {
    throw new ScoringEngineError('INVALID_EVENT', 'Scores must contain two non-negative integers.');
  }
}

function opposite(side: Side): Side {
  return side === 0 ? 1 : 0;
}

function withEventIndex(error: unknown, eventIndex: number): ScoringEngineError {
  if (error instanceof ScoringEngineError) {
    return new ScoringEngineError(error.code, error.message, eventIndex);
  }
  throw error;
}

function visitUnit(unit: UnitState, visitor: (unit: UnitState) => void): void {
  visitor(unit);
  unit.children.forEach((child) => visitUnit(child, visitor));
}

function freezeOptions(options: Record<string, MatchOptions[string]>): MatchOptions {
  return Object.freeze({ ...options });
}

function freezeEffects(effects: readonly ScoringEffect[]): readonly ScoringEffect[] {
  return Object.freeze(effects.map((effect) => Object.freeze({ ...effect })));
}

function freezeUnitState(state: UnitState): UnitState {
  const score = Object.freeze([...state.score]) as Score;
  const children = Object.freeze([...state.children]);
  return Object.freeze({ ...state, score, children });
}

function freezeMatchState(state: MatchState): MatchState {
  const serve = Object.freeze({ ...state.serve });
  const effects = Object.freeze([...state.effects]);
  const effectsByEvent = Object.freeze(
    state.effectsByEvent.map((eventEffects) => Object.freeze([...eventEffects])),
  );
  return Object.freeze({ ...state, serve, effects, effectsByEvent });
}

const INCOMPLETE_EVALUATION: UnitEvaluation = Object.freeze({ isComplete: false });
