import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), eventRange: vi.fn() }));
vi.mock('./client', () => ({ getSupabaseClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

import { sportScoringApi } from './sportScoringApi';

describe('sport scoring analytical observations', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('passes the versioned observations intact to the existing authorized append command', async () => {
    mocks.rpc.mockResolvedValue({ data: { duplicate: false, sequence: 1 }, error: null });
    const payload = { winner: 0, point_type: 'WINNER', analytics: { version: 1, rallyLength: 9, stroke: 'Bandeja', zone: 'Net', actorProfileId: 'linked-player' } };
    await sportScoringApi.append({ scoringMatchId: 'match', clientEventId: 'event', expectedSequence: 0, leaseToken: 'lease', kind: 'POINT', payload });
    expect(mocks.rpc).toHaveBeenCalledWith('append_sport_scoring_event', expect.objectContaining({ p_payload: payload, p_lease_token: 'lease', p_expected_sequence: 0 }));
  });

  it('loads more than 1000 rallies without truncation and preserves account/player alignment', async () => {
    const events = Array.from({ length: 1002 }, (_, index) => ({ sequence: index + 1, client_event_id: `point-${index}`, kind: 'POINT', payload: { winner: 0, analytics: { version: 1, rallyLength: 4 } }, created_at: '' }));
    mocks.eventRange.mockImplementation((start: number, end: number) => Promise.resolve({ data: events.slice(start, end + 1), error: null }));
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query),
        range: mocks.eventRange,
        single: vi.fn(async () => ({ data: { id: 'match', side_a_players: ['Alex'], side_b_players: ['Sam'], rules_snapshot: {} }, error: null })),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'sport_scoring_match_players' ? [
          { side: 0, player_order: 0, sport_profile_id: 'alex', account_id: 'alex-account' },
          { side: 1, player_order: 0, sport_profile_id: 'sam', account_id: 'sam-account' },
        ] : [], error: null }).then(resolve),
      };
      return query;
    });
    const feed = await sportScoringApi.feed('match');
    expect(feed.events).toHaveLength(1002);
    expect(feed.events[1001].payload.analytics).toEqual({ version: 1, rallyLength: 4 });
    expect(mocks.eventRange.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(feed.sideAProfileIds).toEqual(['alex']);
    expect(feed.sideAAccountIds).toEqual(['alex-account']);
  });
});
