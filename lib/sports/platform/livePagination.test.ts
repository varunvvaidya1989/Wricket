import { describe, expect, it } from 'vitest';

import type { SportPublicLiveSnapshot } from '@/lib/supabase/sportDiscoveryApi';

import { appendLiveSnapshots } from './livePagination';

const snapshot = (id: string, score: string): SportPublicLiveSnapshot => ({
  scoringMatchId: id,
  sportId: 'sport-cricket',
  sportCode: 'CRICKET',
  competitionId: 'tournament-1',
  competitionName: 'Premier Cup',
  participantA: 'Team A',
  participantB: 'Team B',
  status: 'LIVE',
  headlineScore: score,
  refreshedAt: '2026-08-24T05:00:00.000Z',
  staleAfter: '2026-08-24T05:02:00.000Z',
  shareSlug: id,
});

describe('live discovery pagination', () => {
  it('appends later pages in discovery order', () => {
    expect(appendLiveSnapshots([snapshot('one', '10/0')], [snapshot('two', '20/1')]).map(item => item.scoringMatchId))
      .toEqual(['one', 'two']);
  });

  it('deduplicates page boundaries and keeps the freshest incoming snapshot', () => {
    const items = appendLiveSnapshots(
      [snapshot('one', '10/0'), snapshot('two', '20/1')],
      [snapshot('two', '24/1'), snapshot('three', '30/2')],
    );
    expect(items).toHaveLength(3);
    expect(items[1].headlineScore).toBe('24/1');
  });
});
