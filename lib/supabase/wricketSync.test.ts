import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listCloudTeamPlayers, listCloudTeams, listCloudTournaments, upsertCloudTournament } from './wricketSync';
import type { Tournament } from '@/lib/wricket/domain/types';

const client = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
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

describe('tournament publication during legacy synchronization', () => {
  it('does not reset an already published tournament when uploading local edits', async () => {
    const row = { id: 'cloud-tour', visibility: 'PUBLIC', name: 'Published league' };
    client.from.mockReturnValue({ upsert: (payload: object) => {
      Object.assign(row, payload);
      return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) };
    } });
    const tournament: Tournament = {
      id: 'local-tour', cloudId: 'cloud-tour', name: 'Updated league', format: 'T10',
      startDate: Date.UTC(2026, 10, 10), pointsWin: 2, pointsTie: 1, pointsLoss: 0, pointsNoResult: 1,
      status: 'ACTIVE', createdAt: Date.UTC(2026, 9, 10), plannedTeamCount: 2, playersPerTeam: 11,
      oversPerMatch: 10, syncStatus: 'PENDING',
    };
    await upsertCloudTournament(tournament, 'organiser');
    expect(row).toMatchObject({ name: 'Updated league', visibility: 'PUBLIC' });
  });
});

describe('tournament contact projection', () => {
  beforeEach(() => vi.clearAllMocks());
  it('reads contact only for owned tournaments and clears it for other cached tournaments', async () => {
    const select = vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [
      { id: 'owned', created_by: 'me' }, { id: 'public', created_by: 'someone-else' },
    ], error: null }) });
    client.from.mockReturnValue({ select });
    client.rpc.mockResolvedValue({ data: [{ phone: '+12025550123' }], error: null });
    const result = await listCloudTournaments('me');
    expect(select.mock.calls[0][0]).not.toContain('organizer_phone');
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith('get_tournament_organizer_contact', { p_tournament_id: 'owned' });
    expect(result.map(item => item.organizer_phone)).toEqual(['+12025550123', null]);
  });
  it('does not report a successful contact sync after an RPC failure', async () => {
    client.from.mockReturnValue({ select: () => ({ order: () => Promise.resolve({ data: [{ id: 'owned', created_by: 'me' }], error: null }) }) });
    client.rpc.mockResolvedValue({ data: null, error: new Error('Contact unavailable') });
    await expect(listCloudTournaments('me')).rejects.toThrow('Contact unavailable');
  });
});
