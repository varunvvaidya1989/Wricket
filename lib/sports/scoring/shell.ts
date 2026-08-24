import { replay } from './engine';
import type { ScoringSessionRecord } from './sessionStorage';
import type { ScoringSportId } from './presentation';
import { SPORT_CONFIGS } from './configs';

export interface SportShellConfig {
  readonly sportId: ScoringSportId;
  readonly displayName: string;
  readonly icon: string;
  readonly tagline: string;
  readonly defaultFormatSummary: string;
  readonly secondaryStatLabel: string;
  readonly getSecondaryStatValue: (sessions: readonly ScoringSessionRecord[]) => number;
}

const pointCount = (sessions: readonly ScoringSessionRecord[]) => sessions.reduce(
  (total, session) => total + session.events.length,
  0,
);

const sideOutCount = (sessions: readonly ScoringSessionRecord[]) => sessions.reduce(
  (total, session) => total + session.events.reduce((sessionTotal, event, index) => {
    const beforePoint = replay(SPORT_CONFIGS.pickleball, session.events.slice(0, index), {
      initialServer: session.initialServer,
      options: session.options,
    });
    return sessionTotal + (event.winner !== beforePoint.serve.servingSide ? 1 : 0);
  }, 0),
  0,
);

export const SPORT_SHELL_CONFIGS: Readonly<Record<ScoringSportId, SportShellConfig>> = Object.freeze({
  badminton: Object.freeze({
    sportId: 'badminton',
    displayName: 'Badminton',
    icon: '🏸',
    tagline: 'Rally scoring with service-court guidance built in.',
    defaultFormatSummary: 'Best of 3 · first to 21 · win by 2 · cap at 30',
    secondaryStatLabel: 'Rallies',
    getSecondaryStatValue: pointCount,
  }),
  tennis: Object.freeze({
    sportId: 'tennis',
    displayName: 'Tennis',
    icon: '🎾',
    tagline: 'Sets, games, and points — scored solo or with a partner.',
    defaultFormatSummary: 'Best of 3 sets · tiebreak at 6-6',
    secondaryStatLabel: 'Points won',
    getSecondaryStatValue: pointCount,
  }),
  padel: Object.freeze({
    sportId: 'padel',
    displayName: 'Padel',
    icon: '🎾',
    tagline: 'Doubles court sport with optional golden point.',
    defaultFormatSummary: 'Best of 3 sets · golden point available',
    secondaryStatLabel: 'Points won',
    getSecondaryStatValue: pointCount,
  }),
  table_tennis: Object.freeze({
    sportId: 'table_tennis',
    displayName: 'Table Tennis',
    icon: '🏓',
    tagline: 'Fast games to 11, serve rotates every two points.',
    defaultFormatSummary: 'Best of 5 games · first to 11 · win by 2',
    secondaryStatLabel: 'Points won',
    getSecondaryStatValue: pointCount,
  }),
  pickleball: Object.freeze({
    sportId: 'pickleball',
    displayName: 'Pickleball',
    icon: '🏓',
    tagline: 'Games to 11 or 15, server-number scoring.',
    defaultFormatSummary: 'First to 11 · win by 2',
    secondaryStatLabel: 'Side-outs forced',
    getSecondaryStatValue: sideOutCount,
  }),
});
