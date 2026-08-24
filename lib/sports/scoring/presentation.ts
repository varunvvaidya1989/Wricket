import { SPORT_CONFIGS } from './configs';
import { colors } from '../../theme/colors';

export type ScoringSportId = keyof typeof SPORT_CONFIGS;

export interface MatchOptionPresentation {
  readonly key: string;
  readonly label: string;
  readonly description: string;
}

export interface SportPresentation {
  readonly id: ScoringSportId;
  readonly catalogCode: string;
  readonly routeSegment: string;
  readonly tagline: string;
  readonly rulesSummary: string;
  readonly accent: string;
  readonly option?: MatchOptionPresentation;
}

export const SCORING_SPORT_IDS: readonly ScoringSportId[] = Object.freeze([
  'tennis',
  'badminton',
  'padel',
  'table_tennis',
  'pickleball',
]);

export const SPORT_PRESENTATION: Readonly<Record<ScoringSportId, SportPresentation>> = Object.freeze({
  tennis: Object.freeze({
    id: 'tennis',
    catalogCode: 'TENNIS',
    routeSegment: 'tennis',
    tagline: 'Classic sets, deuce and advantage.',
    rulesSummary: 'Best of 3 sets · first to 6 games · tie-break at 6–6',
    accent: colors.accent,
    option: Object.freeze({
      key: 'noAd',
      label: 'No-ad scoring',
      description: 'At deuce, the next point wins the game.',
    }),
  }),
  badminton: Object.freeze({
    id: 'badminton',
    catalogCode: 'BADMINTON',
    routeSegment: 'badminton',
    tagline: 'Rally scoring with service-court guidance.',
    rulesSummary: 'Best of 3 games · first to 21 · win by 2 · cap at 30',
    accent: colors.accent,
  }),
  padel: Object.freeze({
    id: 'padel',
    catalogCode: 'PADEL',
    routeSegment: 'padel',
    tagline: 'Team scoring with familiar tennis notation.',
    rulesSummary: 'Best of 3 sets · first to 6 games · tie-break at 6–6',
    accent: colors.accent,
    option: Object.freeze({
      key: 'goldenPoint',
      label: 'Golden point',
      description: 'At deuce, the next point wins the game.',
    }),
  }),
  table_tennis: Object.freeze({
    id: 'table_tennis',
    catalogCode: 'TABLE_TENNIS',
    routeSegment: 'table-tennis',
    tagline: 'Fast games with automatic serve rotation.',
    rulesSummary: 'Best of 3 games · first to 11 · win by 2',
    accent: colors.accent,
  }),
  pickleball: Object.freeze({
    id: 'pickleball',
    catalogCode: 'PICKLEBALL',
    routeSegment: 'pickleball',
    tagline: 'Side-outs, server numbers and rally scoring.',
    rulesSummary: 'Best of 3 games · first to 11 · win by 2',
    accent: colors.accent,
    option: Object.freeze({
      key: 'rallyScoring',
      label: 'Rally scoring',
      description: 'Every rally awards a point, whether serving or receiving.',
    }),
  }),
});

export function isScoringSportId(value: string | undefined): value is ScoringSportId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(SPORT_CONFIGS, value));
}

export function scoringSportIdForCode(code: string): ScoringSportId | undefined {
  return SCORING_SPORT_IDS.find((id) => SPORT_PRESENTATION[id].catalogCode === code);
}
