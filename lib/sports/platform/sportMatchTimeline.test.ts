import { describe, expect, it } from 'vitest';

import { PICKLEBALL_CONFIG, TENNIS_CONFIG } from '@/lib/sports/scoring';
import type { SportCloudScoringEvent } from '@/lib/supabase/sportScoringApi';

import { buildSportMatchTimeline, splitLiveHeadline } from './sportMatchTimeline';

const point = (
  sequence: number,
  winner: 0 | 1,
  pointType?: string,
): SportCloudScoringEvent => ({
  sequence,
  clientEventId: `point-${sequence}`,
  kind: 'POINT',
  payload: { winner, ...(pointType ? { point_type: pointType } : {}) },
  createdAt: `2026-08-24T09:00:${String(sequence).padStart(2, '0')}.000Z`,
});

describe('sport match viewer timeline', () => {
  it('reconstructs each score and uses player identities for historical points', () => {
    const timeline = buildSportMatchTimeline(
      TENNIS_CONFIG,
      [point(5, 1, 'ACE'), point(1, 0), point(2, 0), point(3, 0), point(4, 0)],
      ['Varun Vaidya', 'VarunV'],
      { initialServer: 0 },
    );

    expect(timeline[0]).toMatchObject({
      marker: '5',
      title: 'Ace',
      description: 'Point awarded to VarunV · Ace by VarunV · Score 0-0 · Love-15',
    });
    expect(timeline.at(-1)?.description).toBe(
      'Point awarded to Varun Vaidya · Rally won by Varun Vaidya · Score 0-0 · 15-Love',
    );
    expect(timeline.map((item) => item.description).join(' ')).not.toContain('side A');
  });

  it('promotes game, service-break, and set milestones', () => {
    const serviceBreak = buildSportMatchTimeline(
      TENNIS_CONFIG,
      [point(1, 1), point(2, 1), point(3, 1), point(4, 1)],
      ['Server', 'Receiver'],
      { initialServer: 0 },
    );
    expect(serviceBreak[0]).toMatchObject({
      title: 'Service break',
      description: "Receiver broke Server's serve · Score 0-0 · Love-Love",
    });

    const setWon = buildSportMatchTimeline(
      TENNIS_CONFIG,
      Array.from({ length: 24 }, (_, index) => point(index + 1, 0)),
      ['Player One', 'Player Two'],
      { initialServer: 0 },
    );
    expect(setWon[0]).toMatchObject({
      title: 'Set won',
      description: 'Player One won the set · Score 1-0 · Love-Love',
    });
  });

  it('separates match units from the current game score', () => {
    expect(splitLiveHeadline('1-0 · 15-Love')).toEqual({ match: '1-0', current: '15-Love' });
  });

  it('describes a traditional pickleball side-out without claiming a point was scored', () => {
    const timeline = buildSportMatchTimeline(
      PICKLEBALL_CONFIG,
      [point(1, 1)],
      ['Serving team', 'Receiving team'],
      { initialServer: 0, options: { rallyScoring: false } },
    );
    expect(timeline[0]).toMatchObject({
      title: 'Side out',
      description: 'Receiving team won the rally and gained serve · Score unchanged at 0-0 · 0-0',
    });
  });
});
