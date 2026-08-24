import { formatScore } from './formatters';
import { getCurrentUnit } from './engine';
import { deriveServiceCourt } from './serve';
import type {
  MatchState,
  Side,
  SportConfig,
  UnitConfig,
  UnitState,
} from './types';

export interface ScoreboardSideView {
  readonly side: Side;
  readonly name: string;
  readonly currentScore: string;
  readonly unitsWon: number;
  readonly isServing: boolean;
  readonly serviceDetail?: string;
}

export interface ScoreboardRoundView {
  readonly key: string;
  readonly score: readonly [number, number];
  readonly isComplete: boolean;
}

export interface ScoreboardView {
  readonly sides: readonly [ScoreboardSideView, ScoreboardSideView];
  readonly rounds: readonly ScoreboardRoundView[];
  readonly unitsLabel: string;
  readonly currentUnitLabel: string;
  readonly isComplete: boolean;
  readonly winnerName?: string;
}

/** Compact score used by live-match cards outside the full score screen. */
export function formatLiveHeadline(config: SportConfig, state: MatchState): string {
  const view = buildScoreboardView(config, state, ['Side A', 'Side B']);
  return `${view.sides[0].unitsWon}-${view.sides[1].unitsWon} · ${view.sides[0].currentScore}-${view.sides[1].currentScore}`;
}

export function buildScoreboardView(
  config: SportConfig,
  state: MatchState,
  sideNames: readonly [string, string],
): ScoreboardView {
  const latestGame = getCurrentUnit(state, 'game');
  const pendingGame = !state.isComplete && latestGame?.isComplete
    ? findPendingUnit(config.root, state.root, 'game', state.options)
    : undefined;
  const currentGame = pendingGame
    ? emptyUnit(pendingGame)
    : latestGame ?? emptyUnit(findUnit(config.root, 'game'));
  const serviceCourt = deriveServiceCourt(config, state);
  const childLevel = config.root.child?.level ?? 'unit';
  const unitsLabel = pluralize(childLevel).toUpperCase();
  const sides = [0, 1].map((sideValue): ScoreboardSideView => {
    const side = sideValue as Side;
    const isServing = state.serve.servingSide === side;
    const details: string[] = [];
    if (isServing && state.serve.serverNumber) details.push(`SERVER ${state.serve.serverNumber}`);
    if (isServing && serviceCourt) details.push(`${serviceCourt.toUpperCase()} COURT`);
    return Object.freeze({
      side,
      name: sideNames[side],
      currentScore: formatScore(config, currentGame, side, state.options),
      unitsWon: state.root.score[side],
      isServing,
      serviceDetail: details.length ? details.join(' · ') : undefined,
    });
  }) as unknown as readonly [ScoreboardSideView, ScoreboardSideView];

  const rounds = state.root.children.map((unit, index) => Object.freeze({
    key: `${unit.configKey}-${index}`,
    score: unit.score,
    isComplete: unit.isComplete,
  }));

  return Object.freeze({
    sides: Object.freeze(sides),
    rounds: Object.freeze(rounds),
    unitsLabel,
    currentUnitLabel: currentGame.variant === 'tie_break' ? 'TIE-BREAK' : 'CURRENT GAME',
    isComplete: state.isComplete,
    winnerName: state.winner === undefined ? undefined : sideNames[state.winner],
  });
}

function findUnit(config: UnitConfig, level: string): UnitConfig {
  if (config.level === level) return config;
  if (config.child) return findUnit(config.child, level);
  throw new Error(`The scoring hierarchy does not contain a ${level} unit.`);
}

function findPendingUnit(
  config: UnitConfig,
  state: UnitState,
  level: string,
  options: MatchState['options'],
): UnitConfig {
  if (config.level === level) return config;
  const child = config.selectChild?.({ parent: state, options }) ?? config.child;
  if (!child) throw new Error(`The scoring hierarchy does not contain a ${level} unit.`);
  const activeChild = state.children.at(-1);
  const childState = activeChild && !activeChild.isComplete
    ? activeChild
    : emptyUnit(child);
  return findPendingUnit(child, childState, level, options);
}

function emptyUnit(config: UnitConfig): UnitState {
  return Object.freeze({
    configKey: config.key,
    level: config.level,
    variant: config.variant,
    score: Object.freeze([0, 0] as [number, number]),
    isComplete: false,
    children: Object.freeze([]),
  });
}

function pluralize(value: string): string {
  return value.endsWith('s') ? value : `${value}s`;
}
