import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { SportSummary } from '@/lib/supabase/globalProfileApi';
import type { SportPublicLiveSnapshot } from '@/lib/supabase/sportDiscoveryApi';

import {
  countLiveSnapshots,
  orderSportSummaries,
  SPORT_LAUNCH_DESCRIPTIONS,
  sportLaunchDescription,
} from './sportDashboard';

const dashboard = readFileSync(resolve(__dirname, '../../../app/index.tsx'), 'utf8');
const liveScreen = readFileSync(
  resolve(__dirname, '../../../components/sports/platform/SportStageLiveScreen.tsx'),
  'utf8',
);

describe('SportStage sport launcher', () => {
  it('requires bespoke launch copy for every shipped sport', () => {
    expect(SPORT_LAUNCH_DESCRIPTIONS).toEqual({
      CRICKET: 'Wricket \u00B7 tournaments, live scoring and scorecards',
      BADMINTON: 'Singles and doubles, rally scoring to 21',
      TENNIS: 'Sets, games, and points \u2014 solo or with a partner',
      PADEL: 'Doubles court sport with optional golden point',
      TABLE_TENNIS: 'Fast games to 11, serve rotates every two points',
      PICKLEBALL: 'Games to 11 or 15, server-number scoring',
    });
    expect(sportLaunchDescription('SEVENTH_SPORT')).toBeUndefined();
    expect(dashboard).not.toContain('Your SportStage app is ready');
  });

  it('promotes the sport with the strongest match history', () => {
    const badminton = summary('BADMINTON', true, 2);
    const cricket = summary('CRICKET', false, 30);
    const tennis = summary('TENNIS', false, 8);
    const ordered = orderSportSummaries([badminton, cricket, tennis], new Map());

    expect(ordered.primarySportId).toBe(cricket.sport.id);
    expect(ordered.sports.map((item) => item.sport.code)).toEqual([
      'CRICKET',
      'BADMINTON',
      'TENNIS',
    ]);
  });

  it('uses cross-sport profile stats and the chosen primary sport as a tie-breaker', () => {
    const tennis = summary('TENNIS', false);
    const padel = summary('PADEL', true);
    const ordered = orderSportSummaries(
      [tennis, padel],
      new Map([['TENNIS', 12], ['PADEL', 12]]),
    );

    expect(ordered.primarySportId).toBe(padel.sport.id);
    expect(ordered.sports[0]).toBe(padel);
  });

  it('counts only currently live snapshots per sport', () => {
    const counts = countLiveSnapshots([
      snapshot('TENNIS', 'LIVE', 'tennis-live'),
      snapshot('TENNIS', 'COMPLETED', 'tennis-complete'),
      snapshot('CRICKET', 'LIVE', 'cricket-live'),
    ]);

    expect(counts.get('TENNIS')).toBe(1);
    expect(counts.get('CRICKET')).toBe(1);
  });

  it('reuses one live badge and renders unread and responsive grid states', () => {
    expect(dashboard).toContain("SportLiveActivityBadge count={liveCount} appearance=\"card\"");
    expect(liveScreen).toContain('<SportLiveActivityBadge count={count} />');
    expect(dashboard).toContain('activity.unreadCount > 0 ?');
    expect(dashboard).toContain("const columnCount = width < 350 ? 1 : 2");
    expect(dashboard).toContain('paddingHorizontal: 16');
    expect(dashboard).toContain('<Text style={styles.sportDescription}>{description}</Text>');
    expect(dashboard).not.toMatch(/sportDescription[^\n]*numberOfLines/);
    expect(dashboard).not.toMatch(/READY|LOCKED/);
  });
});

function summary(code: string, isPrimary: boolean, matches?: number): SportSummary {
  return {
    sport: {
      id: `${code.toLowerCase()}-id`,
      code,
      name: code,
      status: 'AVAILABLE',
      appRoute: `/${code.toLowerCase()}`,
      accessStatus: 'ACTIVE',
      isPrimary,
    },
    available: true,
    headlineStats: [],
    matches,
  };
}

function snapshot(sportCode: string, status: string, id: string): SportPublicLiveSnapshot {
  return {
    scoringMatchId: id,
    sportId: `${sportCode.toLowerCase()}-id`,
    sportCode,
    competitionId: 'competition-id',
    competitionName: 'Competition',
    participantA: 'A',
    participantB: 'B',
    status,
    headlineScore: '0-0',
    refreshedAt: '2026-08-21T00:00:00.000Z',
    staleAfter: '2026-08-21T00:01:00.000Z',
    shareSlug: id,
  };
}
