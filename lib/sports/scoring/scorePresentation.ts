import { getCurrentUnit, getUnits, replay } from './engine';
import { buildScoreboardView } from './viewModel';
import type { MatchState, PointEvent, Side, SportConfig } from './types';

/** Presentation only: the existing replay engine remains the scoring authority. */
export function buildRacketScorePresentation(config: SportConfig, state: MatchState, events: readonly PointEvent[], initialServer: Side) {
  const view = buildScoreboardView(config, state, ['Side A', 'Side B']);
  const level = config.root.child?.level === 'set' ? 'set' : 'game';
  const lastRound = state.root.children.at(-1);
  const currentIndex = state.isComplete ? Math.max(0, state.root.children.length - 1) : Math.max(0, state.root.children.length - (lastRound?.isComplete ? 0 : 1));
  const activeRound = lastRound && !lastRound.isComplete ? lastRound : undefined;
  const game = getCurrentUnit(state, 'game');
  const activeGame = game && !game.isComplete ? game : undefined;
  const configuredTarget = config.root.targetOption ? state.options[config.root.targetOption] : undefined;
  const target = typeof configuredTarget === 'number' && Number.isInteger(configuredTarget) && configuredTarget > 0 ? configuredTarget : config.root.target;
  const maximumRounds = Math.max(state.root.children.length, Math.min(15, target * 2 - 1));
  const rounds = Array.from({ length: maximumRounds }, (_, index) => ({
    index, label: `${level === 'set' ? 'S' : 'G'}${index + 1}`,
    score: state.root.children[index]?.score,
    complete: Boolean(state.root.children[index]?.isComplete),
    current: !state.isComplete && index === currentIndex,
    available: index === currentIndex || index < state.root.children.length,
  }));
  const gameNumber = level === 'set' ? (activeRound?.children.filter(child => child.isComplete).length ?? 0) + 1 : currentIndex + 1;
  const context = `${config.name.toUpperCase()} · ${level.toUpperCase()} ${currentIndex + 1} · ${level === 'set' ? `GAME ${gameNumber}` : config.id === 'table_tennis' ? `BEST OF ${target * 2 - 1}` : `RALLY ${state.eventCount + 1}`}`;
  const completed = (next: MatchState, unit: string) => getUnits(next, unit).filter(value => value.isComplete).length;
  const sides = ([0, 1] as const).map(side => {
    const serving = state.serve.servingSide === side;
    let service = view.sides[side].serviceDetail?.replace(' COURT', '');
    if (config.id === 'table_tennis' && serving) {
      const score = activeGame?.score ?? [0, 0];
      service = score[0] >= 10 && score[1] >= 10 ? 'EVERY POINT' : `${(score[0] + score[1]) % 2 + 1} OF 2`;
    }
    let hint = 'Tap to score +1';
    if (!state.isComplete) {
      const next = replay(config, [...events, { type: 'POINT', sequence: (events.at(-1)?.sequence ?? 0) + 1, winner: side }], { initialServer, options: state.options });
      if (next.isComplete) hint = 'Match point · +1';
      else if (completed(next, 'set') > completed(state, 'set')) hint = 'Set point · +1';
      else if (completed(next, 'game') > completed(state, 'game')) hint = 'Game point · +1';
      if (config.id === 'padel' && state.options.goldenPoint === true && activeGame?.score[0] === 3 && activeGame.score[1] === 3) hint = 'Golden point · +1';
      if (config.id === 'pickleball' && state.options.rallyScoring !== true && !serving) hint = 'Win rally · change serve';
    }
    return {
      side: side as Side, serving, service,
      score: view.sides[side].currentScore,
      summary: level === 'set' ? `GAMES ${activeRound?.score[side] ?? 0} · SETS ${state.root.score[side]}` : `GAMES WON · ${state.root.score[side]}`,
      hint: state.isComplete ? state.winner === side ? 'MATCH WINNER' : 'FINAL' : hint,
    };
  });
  return { context, level, rounds, sides, currentIndex };
}

