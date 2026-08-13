import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listCloudTeamPlayers, listCloudTeams } from './wricketSync';

const client = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('./client', () => ({
  getSupabaseClient: () => client,
}));

describe('Wricket team sync queries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hydrates tournament participation teams but not standalone reusable entities', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const not = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ not });
    client.from.mockReturnValue({ select });

    await expect(listCloudTeams()).resolves.toEqual([]);

    expect(client.from).toHaveBeenCalledWith('teams');
    expect(not).toHaveBeenCalledWith('tournament_id', 'is', null);
  });

  it('hydrates rosters only for the tournament teams being downloaded', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const inFilter = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ in: inFilter });
    client.from.mockReturnValue({ select });

    await expect(listCloudTeamPlayers(['team-a', 'team-b'])).resolves.toEqual([]);

    expect(inFilter).toHaveBeenCalledWith('team_id', ['team-a', 'team-b']);
  });

  it('skips the roster query when no tournament teams were downloaded', async () => {
    await expect(listCloudTeamPlayers([])).resolves.toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
});
