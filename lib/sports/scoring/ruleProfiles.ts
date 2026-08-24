import type { MatchOptions } from './types';
import type { ScoringSportId } from './presentation';

export interface SportRuleProfile {
  unitName: 'sets' | 'games';
  unitsToWin: readonly number[];
  tiedScoreRule: 'ADVANTAGE_OPTIONAL' | 'WIN_BY_TWO' | 'BADMINTON_CAP';
  setTiebreak: boolean;
  pointTargets?: readonly number[];
}

const PROFILES: Readonly<Record<ScoringSportId, SportRuleProfile>> = Object.freeze({
  tennis: Object.freeze({ unitName: 'sets', unitsToWin: [1, 2, 3], tiedScoreRule: 'ADVANTAGE_OPTIONAL', setTiebreak: true }),
  padel: Object.freeze({ unitName: 'sets', unitsToWin: [1, 2], tiedScoreRule: 'ADVANTAGE_OPTIONAL', setTiebreak: true }),
  badminton: Object.freeze({ unitName: 'games', unitsToWin: [1, 2], tiedScoreRule: 'BADMINTON_CAP', setTiebreak: false }),
  table_tennis: Object.freeze({ unitName: 'games', unitsToWin: [1, 2, 3, 4], tiedScoreRule: 'WIN_BY_TWO', setTiebreak: false }),
  pickleball: Object.freeze({ unitName: 'games', unitsToWin: [1, 2, 3], tiedScoreRule: 'WIN_BY_TWO', setTiebreak: false, pointTargets: [11, 15, 21] }),
});

export function sportRuleProfile(sportId: ScoringSportId): SportRuleProfile {
  return PROFILES[sportId];
}

export function defaultSportRules(sportId: ScoringSportId): MatchOptions {
  const common: Record<string, boolean | number> = { matchUnitsToWin: 2 };
  if (sportId === 'tennis') return Object.freeze({ ...common, noAd: false, setTiebreak: true, setCap: 7, tieBreakPoints: 7 });
  if (sportId === 'padel') return Object.freeze({ ...common, goldenPoint: false, setTiebreak: true, setCap: 7, tieBreakPoints: 7 });
  if (sportId === 'pickleball') return Object.freeze({ ...common, rallyScoring: false, gamePointTarget: 11 });
  return Object.freeze(common);
}

export function normalizeSportRules(sportId: ScoringSportId, value: unknown): MatchOptions {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const defaults = defaultSportRules(sportId);
  const profile = sportRuleProfile(sportId);
  const requestedUnits = Number(source.matchUnitsToWin);
  const matchUnitsToWin = profile.unitsToWin.includes(requestedUnits) ? requestedUnits : Number(defaults.matchUnitsToWin);
  const next: Record<string, boolean | number> = { ...defaults, matchUnitsToWin };
  if (sportId === 'tennis') next.noAd = source.noAd === true;
  if (sportId === 'padel') next.goldenPoint = source.goldenPoint === true;
  if (profile.setTiebreak) {
    next.setTiebreak = source.setTiebreak !== false;
    next.setCap = next.setTiebreak ? 7 : 0;
    next.tieBreakPoints = 7;
  }
  if (sportId === 'pickleball') {
    const requestedTarget = Number(source.gamePointTarget);
    const target = profile.pointTargets?.includes(requestedTarget) ? requestedTarget : 11;
    next.gamePointTarget = target;
    next.matchUnitsToWin = target === 11 ? matchUnitsToWin : 1;
    next.rallyScoring = source.rallyScoring === true;
  }
  return Object.freeze(next);
}

export function sportRulesSummary(sportId: ScoringSportId, options: MatchOptions): string {
  const normalized = normalizeSportRules(sportId, options);
  const profile = sportRuleProfile(sportId);
  const toWin = Number(normalized.matchUnitsToWin);
  const bestOf = toWin * 2 - 1;
  const parts = [`Best of ${bestOf} ${profile.unitName}`];
  if (sportId === 'tennis') parts.push(normalized.noAd ? 'deciding point at deuce' : 'advantage scoring');
  else if (sportId === 'padel') parts.push(normalized.goldenPoint ? 'golden point at deuce' : 'advantage scoring');
  else if (sportId === 'badminton') parts.push('21 points, win by 2, cap 30');
  else if (sportId === 'table_tennis') parts.push('11 points, win by 2');
  else parts.push(`${normalized.gamePointTarget} points, win by 2`, normalized.rallyScoring ? 'rally scoring' : 'side-out scoring');
  if (profile.setTiebreak) parts.push(normalized.setTiebreak ? '7-point tie-break at 6-6' : 'advantage set');
  return parts.join(' · ');
}
