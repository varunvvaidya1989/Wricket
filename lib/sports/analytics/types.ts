import type { ScoringSportId } from '../scoring/presentation';

export interface AnalyticsModule {
  sportId: ScoringSportId;
  focus: string;
  strokes: readonly string[];
  zones: readonly string[];
  shortRally: number;
  longRally: number;
  signature: readonly { label: string; stroke?: string; outcome?: string }[];
}

/** Optional observations. Absence means unknown, never zero. */
export interface RallyObservation {
  version: 1;
  rallyLength?: number;
  stroke?: string;
  zone?: string;
  serveAttempt?: 1 | 2;
  actorProfileId?: string;
}

export interface Rate {
  won: number;
  total: number;
}

export interface PlayerAnalytics {
  matches: number;
  completed: number;
  wins: number;
  doubles: number;
  rallies: Rate;
  serve: Rate;
  returns: Rate;
  pressure: Rate;
  breakPoints: Rate;
  shortRallies: Rate;
  longRallies: Rate;
  firstServe: Rate;
  secondServe: Rate;
  rallyLengthTotal: number;
  rallyLengthSamples: number;
  detailSamples: number;
  individualSamples: number;
  winners: number;
  errors: number;
  bestRun: number;
  signature: { label: string; count: number }[];
  strokes: { label: string; count: number }[];
  zones: { label: string; count: number }[];
  opponents: { name: string; record: Rate }[];
  partners: { name: string; record: Rate }[];
  trend: { id: string; date: string; opponent: string; result: string; points: Rate; timeline: { sequence: number; won: boolean; wonSoFar: number; serving: boolean }[] }[];
  excluded: number;
}
