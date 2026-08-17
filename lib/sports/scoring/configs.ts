import { numericNotation, tennisNotation } from './formatters';
import {
  alternatePerGameServeModel,
  rotateEveryNPointsServeModel,
  serverNumberSideOutServeModel,
  winnerServesNextServeModel,
} from './serve';
import {
  decidingUnitThresholdEffectRule,
  suddenDeathAfterTieRule,
} from './specialRules';
import type { SportConfig, UnitConfig } from './types';

const RACQUET_MATCH_FORMATS = Object.freeze(['SINGLES', 'DOUBLES'] as const);

const tennisPoint = unit('tennis-point', 'point', 1, 1);
const tennisGame = unit('tennis-game', 'game', 4, 2, { child: tennisPoint });
const tennisTieBreak = unit('tennis-tie-break', 'game', 7, 2, {
  child: tennisPoint,
  variant: 'tie_break',
});
const tennisSet = unit('tennis-set', 'set', 6, 2, {
  cap: 7,
  child: tennisGame,
  selectChild: ({ parent }) => parent.score[0] === 6 && parent.score[1] === 6
    ? tennisTieBreak
    : tennisGame,
});
const tennisMatch = unit('tennis-match', 'match', 2, 1, { child: tennisSet });

const padelPoint = unit('padel-point', 'point', 1, 1);
const padelGame = unit('padel-game', 'game', 4, 2, { child: padelPoint });
const padelTieBreak = unit('padel-tie-break', 'game', 7, 2, {
  child: padelPoint,
  variant: 'tie_break',
});
const padelSet = unit('padel-set', 'set', 6, 2, {
  cap: 7,
  child: padelGame,
  selectChild: ({ parent }) => parent.score[0] === 6 && parent.score[1] === 6
    ? padelTieBreak
    : padelGame,
});
const padelMatch = unit('padel-match', 'match', 2, 1, { child: padelSet });

const badmintonPoint = unit('badminton-point', 'point', 1, 1);
const badmintonGame = unit('badminton-game', 'game', 21, 2, {
  cap: 30,
  child: badmintonPoint,
});
const badmintonMatch = unit('badminton-match', 'match', 2, 1, { child: badmintonGame });

const tableTennisPoint = unit('table-tennis-point', 'point', 1, 1);
const tableTennisGame = unit('table-tennis-game', 'game', 11, 2, { child: tableTennisPoint });
const tableTennisMatch = unit('table-tennis-match', 'match', 2, 1, { child: tableTennisGame });

const pickleballPoint = unit('pickleball-point', 'point', 1, 1);
const pickleballGame = unit('pickleball-game', 'game', 11, 2, { child: pickleballPoint });
const pickleballMatch = unit('pickleball-match', 'match', 2, 1, { child: pickleballGame });

const tennisNoAd = suddenDeathAfterTieRule({
  id: 'tennis_no_ad',
  unitLevel: 'game',
  tiedAt: 3,
  enabledBy: 'noAd',
});

const padelGoldenPoint = suddenDeathAfterTieRule({
  id: 'padel_golden_point',
  unitLevel: 'game',
  tiedAt: 3,
  enabledBy: 'goldenPoint',
});

const tableTennisEndSwitch = decidingUnitThresholdEffectRule({
  id: 'table_tennis_final_game_end_switch',
  unitLevel: 'game',
  decidingAncestorLevel: 'match',
  threshold: 5,
  effectType: 'SWITCH_ENDS',
});

export const TENNIS_CONFIG: SportConfig = Object.freeze({
  id: 'tennis',
  name: 'Tennis',
  equipment: 'strung_racquet',
  matchFormats: RACQUET_MATCH_FORMATS,
  root: tennisMatch,
  serveModel: alternatePerGameServeModel({ rotatingVariant: 'tie_break' }),
  notation: tennisNotation,
  specialRules: Object.freeze([tennisNoAd]),
  defaultOptions: Object.freeze({ noAd: false }),
});

export const PADEL_CONFIG: SportConfig = Object.freeze({
  id: 'padel',
  name: 'Padel',
  equipment: 'solid_paddle',
  matchFormats: RACQUET_MATCH_FORMATS,
  root: padelMatch,
  serveModel: alternatePerGameServeModel({ rotatingVariant: 'tie_break' }),
  notation: tennisNotation,
  specialRules: Object.freeze([padelGoldenPoint]),
  defaultOptions: Object.freeze({ goldenPoint: false }),
});

export const BADMINTON_CONFIG: SportConfig = Object.freeze({
  id: 'badminton',
  name: 'Badminton',
  equipment: 'strung_racquet',
  matchFormats: RACQUET_MATCH_FORMATS,
  root: badmintonMatch,
  serveModel: winnerServesNextServeModel(),
  notation: numericNotation,
});

export const TABLE_TENNIS_CONFIG: SportConfig = Object.freeze({
  id: 'table_tennis',
  name: 'Table Tennis',
  equipment: 'solid_paddle',
  matchFormats: RACQUET_MATCH_FORMATS,
  root: tableTennisMatch,
  serveModel: rotateEveryNPointsServeModel({ pointsPerTurn: 2, suddenDeathAt: 10 }),
  notation: numericNotation,
  specialRules: Object.freeze([tableTennisEndSwitch]),
});

export const PICKLEBALL_CONFIG: SportConfig = Object.freeze({
  id: 'pickleball',
  name: 'Pickleball',
  equipment: 'solid_paddle',
  matchFormats: RACQUET_MATCH_FORMATS,
  root: pickleballMatch,
  serveModel: serverNumberSideOutServeModel({
    rallyScoringOption: 'rallyScoring',
    initialServerNumber: 2,
  }),
  notation: numericNotation,
  defaultOptions: Object.freeze({ rallyScoring: false }),
});

export const SPORT_CONFIGS = Object.freeze({
  tennis: TENNIS_CONFIG,
  badminton: BADMINTON_CONFIG,
  padel: PADEL_CONFIG,
  table_tennis: TABLE_TENNIS_CONFIG,
  pickleball: PICKLEBALL_CONFIG,
});

interface UnitOptions {
  readonly cap?: number;
  readonly child?: UnitConfig;
  readonly variant?: string;
  readonly selectChild?: UnitConfig['selectChild'];
}

function unit(
  key: string,
  level: string,
  target: number,
  winBy: number,
  options: UnitOptions = {},
): UnitConfig {
  return Object.freeze({ key, level, target, winBy, ...options });
}
