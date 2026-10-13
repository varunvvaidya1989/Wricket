import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-linking', () => ({ createURL: vi.fn() }));
vi.mock('@/lib/wricket/db/repo', () => ({ getTeamByCloudId: vi.fn(), updateTeamLogoByCloudId: vi.fn() }));
vi.mock('@/lib/wricket/db/syncRepo', () => ({ mergeCloudPlayer: vi.fn(), mergeCloudTeam: vi.fn(), mergeCloudTeamPlayer: vi.fn() }));
vi.mock('./client', () => ({ getSupabaseClient: vi.fn() }));
vi.mock('./liveMatchApi', () => ({ liveMatchApi: { getSummary: vi.fn(), get: vi.fn() } }));
import { getSupabaseClient } from './client';
import { teamManagementApi } from './teamManagementApi';

describe('roster summaries', () => {
  beforeEach(() => vi.clearAllMocks());
  it('does not query when no cloud teams exist', async () => {
    expect(await teamManagementApi.listRosterSummaries([])).toEqual(new Map());
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });
  it('counts actual memberships and exposes captain readiness without account data', async () => {
    const inTeams = vi.fn().mockResolvedValue({ data: [{ team_id: 'a', is_captain: false }, { team_id: 'a', is_captain: true }, { team_id: 'b', is_captain: false }], error: null });
    const select = vi.fn().mockReturnValue({ in: inTeams });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn().mockReturnValue({ select }) } as unknown as ReturnType<typeof getSupabaseClient>);
    expect(await teamManagementApi.listRosterSummaries(['a', 'b', 'empty'])).toEqual(new Map([['a', { playerCount: 2, hasCaptain: true }], ['b', { playerCount: 1, hasCaptain: false }], ['empty', { playerCount: 0, hasCaptain: false }]]));
    expect(select).toHaveBeenCalledWith('team_id,is_captain');
  });
  it('propagates failure instead of presenting zero as a loaded roster', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({ from: () => ({ select: () => ({ in: async () => ({ error: new Error('Unavailable') }) }) }) } as unknown as ReturnType<typeof getSupabaseClient>);
    await expect(teamManagementApi.listRosterSummaries(['a'])).rejects.toThrow('Unavailable');
  });
});

describe('tournament team removal acknowledgement', () => {
  it('uses a tournament-scoped command and checks the returned team ID', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'team', error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof getSupabaseClient>);
    await teamManagementApi.removeTournamentTeam('tournament', 'team');
    expect(rpc).toHaveBeenCalledWith('remove_owned_tournament_team', { p_tournament_id: 'tournament', p_team_id: 'team' });
  });
  it('rejects an empty response instead of dropping the local entry', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: async () => ({ data: null, error: null }) } as unknown as ReturnType<typeof getSupabaseClient>);
    await expect(teamManagementApi.removeTournamentTeam('tournament', 'team')).rejects.toThrow('not confirmed');
  });
  it('propagates the server guard and retains the entry on failure', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: async () => ({ data: null, error: new Error('Team is used in fixtures') }) } as unknown as ReturnType<typeof getSupabaseClient>);
    await expect(teamManagementApi.removeTournamentTeam('tournament', 'team')).rejects.toThrow('used in fixtures');
  });
});

describe('authoritative cached team identities', () => {
  beforeEach(() => vi.clearAllMocks());
  it('skips empty reads and distinguishes an existing team with no logo from a missing entry', async () => {
    expect(await teamManagementApi.listTeamLogos([])).toEqual(new Map());
    expect(getSupabaseClient).not.toHaveBeenCalled();
    vi.mocked(getSupabaseClient).mockReturnValue({ from: () => ({ select: () => ({ in: async () => ({ data: [{ id: 'existing', logo_url: null }], error: null }) }) }) } as unknown as ReturnType<typeof getSupabaseClient>);
    const identities = await teamManagementApi.listTeamLogos(['existing', 'removed']);
    expect(identities.has('existing')).toBe(true);
    expect(identities.has('removed')).toBe(false);
  });
  it('batches large caches and keeps entries returned by every page', async () => {
    const ids = Array.from({ length: 205 }, (_, index) => String(index));
    const inIds = vi.fn(async (_column: string, batch: string[]) => ({ data: batch.map(id => ({ id, logo_url: null })), error: null }));
    vi.mocked(getSupabaseClient).mockReturnValue({ from: () => ({ select: () => ({ in: inIds }) }) } as unknown as ReturnType<typeof getSupabaseClient>);
    expect((await teamManagementApi.listTeamLogos(ids)).size).toBe(205);
    expect(inIds.mock.calls.map(([, batch]) => batch.length)).toEqual([100, 100, 5]);
  });
  it('throws on a failed page so a partial read cannot be used to purge the cache', async () => {
    const inIds = vi.fn().mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: null, error: new Error('Read failed') });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: () => ({ select: () => ({ in: inIds }) }) } as unknown as ReturnType<typeof getSupabaseClient>);
    await expect(teamManagementApi.listTeamLogos(Array.from({ length: 101 }, (_, index) => String(index)))).rejects.toThrow('Read failed');
  });
});
