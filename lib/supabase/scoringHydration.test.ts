import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateScoringMatch } from './scoringHydration';

const state = vi.hoisted(() => ({ result: { data: null as null | { status: string }, error: null as null | Error }, from: vi.fn(), getDb: vi.fn() }));
vi.mock('./client', () => ({ getSupabaseClient: () => ({ from: state.from }) }));
vi.mock('@/lib/wricket/db/client', () => ({ getDb: state.getDb }));
vi.mock('@/lib/wricket/db/syncRepo', () => ({ mergeCloudTeam: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks(); state.result = { data: null, error: null };
  state.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ single: async () => state.result }) }) }));
});

describe('cold scoring hydration boundaries', () => {
  it.each(['COMPLETED','ABANDONED'])('returns %s as terminal without scoring history or cache writes', async status => {
    state.result.data = { status };
    await expect(hydrateScoringMatch('canonical-match')).resolves.toBe('TERMINAL');
    expect(state.from.mock.calls).toEqual([['matches']]); expect(state.getDb).not.toHaveBeenCalled();
  });
  it('does not treat an unstarted match as terminal', async () => {
    state.result.data = { status: 'SCHEDULED' };
    await expect(hydrateScoringMatch('canonical-match')).rejects.toThrow('no longer open for scoring');
    expect(state.getDb).not.toHaveBeenCalled();
  });
  it('preserves an authoritative permission error instead of redirecting', async () => {
    state.result.error = new Error('Match unavailable to this account');
    await expect(hydrateScoringMatch('canonical-match')).rejects.toThrow('Match unavailable to this account');
    expect(state.from).toHaveBeenCalledTimes(1); expect(state.getDb).not.toHaveBeenCalled();
  });
});
