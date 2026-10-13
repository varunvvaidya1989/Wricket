import { badmintonAnalytics } from './badminton';
import { padelAnalytics } from './padel';
import { pickleballAnalytics } from './pickleball';
import { tableTennisAnalytics } from './table-tennis';
import { tennisAnalytics } from './tennis';
import type { RallyObservation } from './types';
import type { ScoringSportId } from '../scoring/presentation';

export const ANALYTICS_MODULES = {
  tennis: tennisAnalytics, badminton: badmintonAnalytics, padel: padelAnalytics,
  table_tennis: tableTennisAnalytics, pickleball: pickleballAnalytics,
} as const;

export function readObservation(value: unknown, sportId: ScoringSportId): RallyObservation {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const module = ANALYTICS_MODULES[sportId];
  // Ignore unsupported future schemas rather than silently interpreting them as v1.
  if (raw.version !== 1) return { version: 1 };
  return {
    version: 1,
    rallyLength: typeof raw.rallyLength === 'number' && Number.isInteger(raw.rallyLength) && raw.rallyLength >= 0 && raw.rallyLength <= 999 ? raw.rallyLength : undefined,
    stroke: typeof raw.stroke === 'string' && module.strokes.includes(raw.stroke) ? raw.stroke : undefined,
    zone: typeof raw.zone === 'string' && module.zones.includes(raw.zone) ? raw.zone : undefined,
    serveAttempt: (sportId === 'tennis' || sportId === 'padel') && (raw.serveAttempt === 1 || raw.serveAttempt === 2) ? raw.serveAttempt : undefined,
    actorProfileId: typeof raw.actorProfileId === 'string' ? raw.actorProfileId : undefined,
  };
}

export const ERROR_OUTCOMES = new Set(['UNFORCED_ERROR', 'FORCED_ERROR', 'DOUBLE_FAULT', 'SERVICE_FAULT', 'FAULT']);
export const WINNER_OUTCOMES = new Set(['ACE', 'WINNER', 'SMASH_WINNER', 'SERVICE_WINNER']);
