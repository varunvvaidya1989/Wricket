import { describe, expect, it } from 'vitest';

import { comparePlayerMatches, playerMatchCategory, PlayerMatchItem } from './player-matches';

describe('player matches', () => {
  it('groups match lifecycle states for the My Wricket filters', () => {
    expect(playerMatchCategory('IN_PROGRESS')).toBe('LIVE');
    expect(playerMatchCategory('SCHEDULED')).toBe('UPCOMING');
    expect(playerMatchCategory('COMPLETED')).toBe('COMPLETED');
    expect(playerMatchCategory('ABANDONED')).toBe('COMPLETED');
  });

  it('puts live first, upcoming chronologically, and completed most recent first', () => {
    const match = (id: string, status: string, scheduledAt: string): PlayerMatchItem => ({
      id,
      status,
      scheduledAt,
      format: 'T20',
      tournamentName: 'League',
      ownTeamName: 'Mine',
      opponentName: 'Opponent',
    });
    const sorted = [
      match('completed-old', 'COMPLETED', '2026-01-01'),
      match('upcoming-later', 'SCHEDULED', '2026-08-20'),
      match('live', 'IN_PROGRESS', '2026-08-13'),
      match('completed-new', 'COMPLETED', '2026-08-10'),
      match('upcoming-next', 'SETUP', '2026-08-14'),
    ].sort(comparePlayerMatches);
    expect(sorted.map(item => item.id)).toEqual([
      'live',
      'upcoming-next',
      'upcoming-later',
      'completed-new',
      'completed-old',
    ]);
  });
});
