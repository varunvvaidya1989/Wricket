import type {
  MatchState,
  Score,
  ServeModel,
  ServeState,
  ServiceCourt,
  Side,
  SportConfig,
  UnitState,
} from './types';

export interface AlternatePerGameServeOptions {
  readonly rotatingVariant?: string;
  readonly firstTurnPoints?: number;
  readonly pointsPerTurn?: number;
}

export function alternatePerGameServeModel(
  modelOptions: AlternatePerGameServeOptions = {},
): ServeModel {
  const rotatingVariant = modelOptions.rotatingVariant;
  const firstTurnPoints = modelOptions.firstTurnPoints ?? 1;
  const pointsPerTurn = modelOptions.pointsPerTurn ?? 2;
  if (!Number.isInteger(firstTurnPoints) || firstTurnPoints < 1) {
    throw new Error('firstTurnPoints must be a positive integer.');
  }
  if (!Number.isInteger(pointsPerTurn) || pointsPerTurn < 1) {
    throw new Error('pointsPerTurn must be a positive integer.');
  }

  const model: ServeModel = {
    id: 'alternate_per_game',
    initialize: ({ initialServer }) => freezeServe({ servingSide: initialServer }),
    update: ({ previousState, transitions }) => {
      const game = transitions.find(({ unit }) => unit.level === 'game');
      if (!game) return previousState.serve;

      if (rotatingVariant && game.unit.variant === rotatingVariant) {
        if (game.evaluation.isComplete) {
          const initialServer = recoverInitialServer(
            previousState.serve.servingSide,
            rotationCount(game.previousScore, firstTurnPoints, pointsPerTurn),
          );
          return freezeServe({ servingSide: opposite(initialServer) });
        }
        const rotations = rotationCount(game.score, firstTurnPoints, pointsPerTurn)
          - rotationCount(game.previousScore, firstTurnPoints, pointsPerTurn);
        return freezeServe({
          servingSide: rotations % 2 === 1
            ? opposite(previousState.serve.servingSide)
            : previousState.serve.servingSide,
        });
      }

      return freezeServe({
        servingSide: game.evaluation.isComplete
          ? opposite(previousState.serve.servingSide)
          : previousState.serve.servingSide,
      });
    },
  };
  return Object.freeze(model);
}

export function winnerServesNextServeModel(): ServeModel {
  const model: ServeModel = {
    id: 'winner_serves_next',
    initialize: ({ initialServer }) => freezeServe({ servingSide: initialServer }),
    update: ({ event }) => freezeServe({ servingSide: event.winner }),
    deriveServiceCourt: ({ state }) => serviceCourtFromOwnScore(state),
  };
  return Object.freeze(model);
}

export interface RotateEveryNPointsOptions {
  readonly pointsPerTurn: number;
  readonly suddenDeathAt: number;
}

export function rotateEveryNPointsServeModel(
  modelOptions: RotateEveryNPointsOptions,
): ServeModel {
  const { pointsPerTurn, suddenDeathAt } = modelOptions;
  if (!Number.isInteger(pointsPerTurn) || pointsPerTurn < 1) {
    throw new Error('pointsPerTurn must be a positive integer.');
  }
  if (!Number.isInteger(suddenDeathAt) || suddenDeathAt < 1) {
    throw new Error('suddenDeathAt must be a positive integer.');
  }

  const model: ServeModel = {
    id: 'rotate_every_n_points',
    initialize: ({ initialServer }) => freezeServe({ servingSide: initialServer }),
    update: ({ previousState, transitions }) => {
      const gameTransition = transitions.find(({ unit }) => unit.level === 'game');
      if (!gameTransition) return previousState.serve;

      if (gameTransition.evaluation.isComplete) {
        const initialServer = recoverInitialServer(
          previousState.serve.servingSide,
          tableTennisRotationCount(
            gameTransition.previousScore,
            pointsPerTurn,
            suddenDeathAt,
          ),
        );
        return freezeServe({ servingSide: opposite(initialServer) });
      }

      const [left, right] = gameTransition.score;
      const rotate = left >= suddenDeathAt && right >= suddenDeathAt
        ? true
        : (left + right) % pointsPerTurn === 0;
      return freezeServe({
        servingSide: rotate
          ? opposite(previousState.serve.servingSide)
          : previousState.serve.servingSide,
      });
    },
  };
  return Object.freeze(model);
}

export interface ServerNumberSideOutOptions {
  readonly rallyScoringOption?: string;
  readonly initialServerNumber?: 1 | 2;
}

export function serverNumberSideOutServeModel(
  modelOptions: ServerNumberSideOutOptions = {},
): ServeModel {
  const rallyScoringOption = modelOptions.rallyScoringOption ?? 'rallyScoring';
  const initialServerNumber = modelOptions.initialServerNumber ?? 2;

  const model: ServeModel = {
    id: 'server_number_side_out',
    initialize: ({ initialServer }) => freezeServe({
      servingSide: initialServer,
      serverNumber: initialServerNumber,
    }),
    awardPoint: ({ event, state, options }) => {
      if (options[rallyScoringOption] === true) return event.winner;
      return event.winner === state.serve.servingSide ? event.winner : undefined;
    },
    update: ({ event, previousState, options }) => {
      const previous = previousState.serve;
      if (options[rallyScoringOption] === true) {
        return freezeServe({
          servingSide: event.winner,
          serverNumber: event.winner === previous.servingSide
            ? previous.serverNumber ?? 1
            : 1,
        });
      }
      if (event.winner === previous.servingSide) return previous;
      if (previous.serverNumber === 1) {
        return freezeServe({ servingSide: previous.servingSide, serverNumber: 2 });
      }
      return freezeServe({ servingSide: opposite(previous.servingSide), serverNumber: 1 });
    },
  };
  return Object.freeze(model);
}

export function deriveServiceCourt(
  config: SportConfig,
  state: MatchState,
): ServiceCourt | undefined {
  return config.serveModel.deriveServiceCourt?.({ state, options: state.options });
}

function serviceCourtFromOwnScore(state: MatchState): ServiceCourt {
  const game = currentUnit(state.root, 'game');
  const ownScore = game && !game.isComplete
    ? game.score[state.serve.servingSide]
    : 0;
  return ownScore % 2 === 0 ? 'right' : 'left';
}

function currentUnit(root: UnitState, level: string): UnitState | undefined {
  let unit = root;
  let match = unit.level === level ? unit : undefined;
  while (unit.children.length > 0) {
    unit = unit.children[unit.children.length - 1];
    if (unit.level === level) match = unit;
  }
  return match;
}

function freezeServe(state: ServeState): ServeState {
  return Object.freeze({ ...state });
}

function opposite(side: Side): Side {
  return side === 0 ? 1 : 0;
}

function rotationCount(
  score: Score,
  firstTurnPoints: number,
  pointsPerTurn: number,
): number {
  const points = score[0] + score[1];
  if (points < firstTurnPoints) return 0;
  return 1 + Math.floor((points - firstTurnPoints) / pointsPerTurn);
}

function tableTennisRotationCount(
  score: Score,
  pointsPerTurn: number,
  suddenDeathAt: number,
): number {
  const points = score[0] + score[1];
  const suddenDeathStart = suddenDeathAt * 2;
  const regularRotations = Math.floor(Math.min(points, suddenDeathStart) / pointsPerTurn);
  return regularRotations + Math.max(0, points - suddenDeathStart);
}

function recoverInitialServer(currentServer: Side, rotations: number): Side {
  return rotations % 2 === 1 ? opposite(currentServer) : currentServer;
}
