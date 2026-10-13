import { describe, expect, it } from 'vitest';
import type { SportCloudMatchFeed, SportCloudScoringEvent } from '@/lib/supabase/sportScoringApi';
import { analyzePlayer, rateLabel } from './analyze';
import { ANALYTICS_MODULES, readObservation } from './modules';

function point(sequence: number, winner: 0 | 1, payload: Record<string, unknown> = {}): SportCloudScoringEvent {
  return { sequence, clientEventId: `point-${sequence}`, kind: 'POINT', payload: { winner, ...payload }, createdAt: '2026-10-13T10:00:00Z' };
}
function match(events: SportCloudScoringEvent[], overrides: Partial<SportCloudMatchFeed> = {}): SportCloudMatchFeed {
  return {
    id: 'match-1', sportId: 'sport', competitionName: 'Club cup', participantA: 'Alex', participantB: 'Sam',
    matchFormat: 'SINGLES', status: 'LIVE', headlineScore: '', currentSequence: events.length,
    updatedAt: '2026-10-13T10:00:00Z', sideAPlayers: ['Alex'], sideBPlayers: ['Sam'],
    sideAProfileIds: ['alex'], sideBProfileIds: ['sam'], rulesSnapshot: { initial_server: 0 }, createdBy: 'official', events, ...overrides,
  };
}

describe('racquet player analytics', () => {
  it('excludes undone points and assigns an error to the losing player', () => {
    const events = [point(1, 0, { point_type: 'ACE' }), point(2, 1, { point_type: 'DOUBLE_FAULT' }), {
      sequence: 3, kind: 'UNDO' as const, clientEventId: 'undo', reversesClientEventId: 'point-1', payload: {}, createdAt: '',
    }];
    const stats = analyzePlayer('tennis', [match(events)], 'alex');
    expect(stats.rallies).toEqual({ won: 0, total: 1 });
    expect(stats.trend[0].timeline).toEqual([{ sequence: 2, won: false, wonSoFar: 0, serving: true }]);
    expect(stats.errors).toBe(1);
    expect(stats.signature.find(row => row.label === 'Aces')?.count).toBe(0);
    expect(stats.signature.find(row => row.label === 'Double faults')?.count).toBe(1);
  });

  it('keeps doubles pair performance separate from player shot attribution', () => {
    const stats = analyzePlayer('padel', [match([
      point(1, 0, { point_type: 'WINNER', analytics: { version: 1, stroke: 'Bandeja', zone: 'Net' } }),
      point(2, 0, { point_type: 'WINNER', analytics: { version: 1, stroke: 'Bandeja', zone: 'Net', actorProfileId: 'alex' } }),
      point(3, 0, { point_type: 'WINNER', analytics: { version: 1, stroke: 'Bandeja', actorProfileId: 'sam' } }),
    ], { matchFormat: 'DOUBLES', sideAProfileIds: ['alex', 'pat'], sideAPlayers: ['Alex', 'Pat'] })], 'alex');
    expect(stats.rallies).toEqual({ won: 3, total: 3 });
    expect(stats.winners).toBe(1);
    expect(stats.signature[0].count).toBe(1);
    expect(stats.zones.find(row => row.label === 'Net')?.count).toBe(1);
  });

  it('never imputes missing rally lengths or service attempts', () => {
    const stats = analyzePlayer('tennis', [match([
      point(1, 0),
      point(2, 0, { analytics: { version: 1, rallyLength: 3, serveAttempt: 1 } }),
      point(3, 1, { analytics: { version: 1, rallyLength: 12, serveAttempt: 2 } }),
    ])], 'alex');
    expect(stats.rallyLengthSamples).toBe(2);
    expect(stats.rallyLengthTotal).toBe(15);
    expect(stats.shortRallies).toEqual({ won: 1, total: 1 });
    expect(stats.longRallies).toEqual({ won: 0, total: 1 });
    expect(stats.firstServe).toEqual({ won: 1, total: 1 });
    expect(stats.secondServe).toEqual({ won: 0, total: 1 });
    expect(rateLabel({ won: 0, total: 0 })).toBe('—');
  });

  it('calculates break points using the pre-point server and handles no-ad', () => {
    const stats = analyzePlayer('tennis', [match([point(1, 1), point(2, 1), point(3, 1), point(4, 1)])], 'sam');
    expect(stats.breakPoints).toEqual({ won: 1, total: 1 });
    const golden = analyzePlayer('padel', [match([point(1, 0), point(2, 0), point(3, 0), point(4, 1), point(5, 1), point(6, 1), point(7, 1)], { rulesSnapshot: { options: { goldenPoint: true } } })], 'sam');
    expect(golden.breakPoints).toEqual({ won: 1, total: 1 });
  });

  it('uses badminton cap rules for pressure and counts pickleball side-outs as rallies', () => {
    const badmintonPoints = Array.from({ length: 58 }, (_, index) => point(index + 1, index % 2 === 0 ? 0 : 1));
    const badminton = analyzePlayer('badminton', [match([...badmintonPoints, point(59, 0)])], 'alex');
    expect(badminton.pressure.total).toBeGreaterThan(0);
    const pickleball = analyzePlayer('pickleball', [match([point(1, 1), point(2, 0), point(3, 0)])], 'alex');
    expect(pickleball.rallies).toEqual({ won: 2, total: 3 });
    expect(pickleball.returns).toEqual({ won: 2, total: 2 });
  });

  it('only counts verified completed matches and uses IDs for head-to-head records', () => {
    const events = Array.from({ length: 11 }, (_, index) => point(index + 1, 0));
    const settings = { options: { matchUnitsToWin: 1 } };
    const stats = analyzePlayer('table_tennis', [
      match(events, { status: 'COMPLETED', rulesSnapshot: settings }),
      match([], { id: 'walkover', status: 'COMPLETED', rulesSnapshot: settings }),
    ], 'alex');
    expect(stats.completed).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.opponents).toEqual([{ name: 'Sam', record: { won: 1, total: 1 } }]);
  });

  it('excludes an invalid match entirely rather than accumulating a partial replay', () => {
    const events = Array.from({ length: 12 }, (_, index) => point(index + 1, 0));
    const stats = analyzePlayer('table_tennis', [match(events, { rulesSnapshot: { options: { matchUnitsToWin: 1 } } })], 'alex');
    expect(stats.excluded).toBe(1);
    expect(stats.matches).toBe(0);
    expect(stats.rallies.total).toBe(0);
    expect(analyzePlayer('tennis', [match([point(1, 0)])], 'unrelated').matches).toBe(0);
  });

  it('validates optional observations with sport-specific vocabularies and versions', () => {
    expect(readObservation({ version: 1, rallyLength: -1, stroke: 'Bandeja', serveAttempt: 2 }, 'badminton')).toEqual({ version: 1, rallyLength: undefined, stroke: undefined, zone: undefined, serveAttempt: undefined, actorProfileId: undefined });
    expect(readObservation({ version: 2, rallyLength: 4 }, 'tennis')).toEqual({ version: 1 });
    expect(Object.keys(ANALYTICS_MODULES)).toHaveLength(5);
  });
});
