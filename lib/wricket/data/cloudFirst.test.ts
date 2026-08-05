import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnlineTeam, createOnlineTournament } from './cloudFirst';

const cloud = vi.hoisted(() => ({
  createCloudTournament: vi.fn(),
  createCloudTeam: vi.fn(),
  createCloudPlayer: vi.fn(),
  upsertCloudTeamPlayer: vi.fn(),
}));
const cache = vi.hoisted(() => ({
  mergeCloudTournament: vi.fn(),
  mergeCloudTeam: vi.fn(),
  mergeCloudPlayer: vi.fn(),
  mergeCloudTeamPlayer: vi.fn(),
}));
const repo = vi.hoisted(() => ({
  getTournament: vi.fn(),
  getTeam: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/lib/supabase/wricketSync', () => cloud);
vi.mock('@/lib/wricket/db/syncRepo', () => cache);
vi.mock('@/lib/wricket/db/repo', () => repo);

describe('cloud-first entity creation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a tournament remotely before caching it with the cloud UUID', async () => {
    const createdAt = Date.now();
    const input = {
      name: 'Summer Cup',
      format: 'T20' as const,
      startDate: createdAt,
      plannedTeamCount: 8,
      playersPerTeam: 11,
    };
    const cached = {
      id: 'cloud-tournament-id',
      cloudId: 'cloud-tournament-id',
      name: input.name,
    };
    cloud.createCloudTournament.mockResolvedValue({
      cloudId: 'cloud-tournament-id',
      createdAt,
    });
    repo.getTournament.mockResolvedValue(cached);

    await expect(createOnlineTournament(input, 'owner-id')).resolves.toBe(cached);
    expect(cloud.createCloudTournament).toHaveBeenCalledWith(input, 'owner-id');
    expect(cache.mergeCloudTournament).toHaveBeenCalledWith(expect.objectContaining({
      cloudId: 'cloud-tournament-id',
      sourceLocalId: 'cloud-tournament-id',
      organizerProfileId: 'owner-id',
    }));
    expect(cloud.createCloudTournament.mock.invocationCallOrder[0])
      .toBeLessThan(cache.mergeCloudTournament.mock.invocationCallOrder[0]);
  });

  it('does not create a local team when the tournament has no canonical cloud ID', async () => {
    await expect(createOnlineTeam({
      tournament: { id: 'legacy-local-id' } as never,
      name: 'Falcons',
      shortName: 'FAL',
      colorHex: '#fff000',
      userId: 'owner-id',
    })).rejects.toThrow('Tournament is not available online');
    expect(cloud.createCloudTeam).not.toHaveBeenCalled();
    expect(cache.mergeCloudTeam).not.toHaveBeenCalled();
  });
});
