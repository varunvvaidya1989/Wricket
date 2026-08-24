import { describe, expect, it } from 'vitest';

import type { SportUpcomingSnapshot } from '@/lib/supabase/sportDiscoveryApi';
import { selectFollowedUpcoming } from './followedUpcoming';

describe('followed upcoming insights', () => {
  it('includes followed cricket tournaments, direct matches, and sport competitions in date order', () => {
    const selected = selectFollowedUpcoming([
      upcoming('sport-late', 'TENNIS', 'fixture-2', 'tennis-competition', '2026-09-04T09:00:00.000Z'),
      upcoming('cricket-tournament', 'CRICKET', 'match-2', 'cricket-tournament', '2026-09-02T09:00:00.000Z'),
      upcoming('unfollowed', 'CRICKET', 'match-3', 'other-tournament', '2026-09-01T09:00:00.000Z'),
      upcoming('cricket-direct', 'CRICKET', 'match-1', 'another-tournament', '2026-09-03T09:00:00.000Z'),
    ], {
      cricketMatchIds: new Set(['match-1']),
      cricketTournamentIds: new Set(['cricket-tournament']),
      sportMatchIds: new Set(),
      sportCompetitionIds: new Set(['tennis-competition']),
    });

    expect(selected.map(item => item.discoveryId)).toEqual([
      'cricket-tournament',
      'cricket-direct',
      'sport-late',
    ]);
  });

  it('supports a directly followed non-cricket match', () => {
    const selected = selectFollowedUpcoming([
      upcoming('padel-fixture', 'PADEL', 'fixture-9', 'padel-cup', '2026-09-02T09:00:00.000Z'),
    ], {
      cricketMatchIds: new Set(),
      cricketTournamentIds: new Set(),
      sportMatchIds: new Set(['fixture-9']),
      sportCompetitionIds: new Set(),
    });

    expect(selected).toHaveLength(1);
  });
});

function upcoming(discoveryId: string, sportCode: string, sourceId: string, competitionId: string, scheduledAt: string): SportUpcomingSnapshot {
  return {
    discoveryId,
    sourceKind: sportCode === 'CRICKET' ? 'CRICKET_MATCH' : 'SPORT_FIXTURE',
    sourceId,
    sportId: `${sportCode.toLowerCase()}-id`,
    sportCode,
    competitionId,
    competitionName: 'Competition',
    participantA: 'A',
    participantB: 'B',
    matchFormat: 'FORMAT',
    scheduledAt,
    shareSlug: discoveryId,
  };
}
