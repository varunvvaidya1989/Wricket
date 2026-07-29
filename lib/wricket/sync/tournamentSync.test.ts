import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTournament: vi.fn(),
  getTeam: vi.fn(),
  getUser: vi.fn(),
  seedSyncOutbox: vi.fn(),
  listPendingSyncItems: vi.fn(),
  markSyncComplete: vi.fn(),
  markSyncFailed: vi.fn(),
  mergeCloudTournament: vi.fn(),
  mergeCloudTeam: vi.fn(),
  retryFailedSyncItems: vi.fn(),
  updateTournamentCloudMedia: vi.fn(),
  getTeamPlayerForSync: vi.fn(),
  mergeCloudPlayer: vi.fn(),
  mergeCloudTeamPlayer: vi.fn(),
  splitMembershipId: vi.fn((value: string) => value.split(':')),
  upsertCloudTournament: vi.fn(),
  upsertCloudTeam: vi.fn(),
  listCloudTournaments: vi.fn(),
  listCloudTeams: vi.fn(),
  upsertCloudPlayer: vi.fn(),
  upsertCloudTeamPlayer: vi.fn(),
  listCloudPlayers: vi.fn(),
  listCloudTeamPlayers: vi.fn(),
}));

vi.mock('@/lib/wricket/db/repo', () => ({
  getTournament: mocks.getTournament,
  getTeam: mocks.getTeam,
  getUser: mocks.getUser,
}));
vi.mock('@/lib/wricket/db/syncRepo', () => ({
  seedSyncOutbox: mocks.seedSyncOutbox,
  listPendingSyncItems: mocks.listPendingSyncItems,
  markSyncComplete: mocks.markSyncComplete,
  markSyncFailed: mocks.markSyncFailed,
  mergeCloudTournament: mocks.mergeCloudTournament,
  mergeCloudTeam: mocks.mergeCloudTeam,
  retryFailedSyncItems: mocks.retryFailedSyncItems,
  updateTournamentCloudMedia: mocks.updateTournamentCloudMedia,
  getTeamPlayerForSync: mocks.getTeamPlayerForSync,
  mergeCloudPlayer: mocks.mergeCloudPlayer,
  mergeCloudTeamPlayer: mocks.mergeCloudTeamPlayer,
  splitMembershipId: mocks.splitMembershipId,
}));
vi.mock('@/lib/supabase/wricketSync', () => ({
  upsertCloudTournament: mocks.upsertCloudTournament,
  upsertCloudTeam: mocks.upsertCloudTeam,
  listCloudTournaments: mocks.listCloudTournaments,
  listCloudTeams: mocks.listCloudTeams,
  upsertCloudPlayer: mocks.upsertCloudPlayer,
  upsertCloudTeamPlayer: mocks.upsertCloudTeamPlayer,
  listCloudPlayers: mocks.listCloudPlayers,
  listCloudTeamPlayers: mocks.listCloudTeamPlayers,
}));

import { syncTournamentData } from './tournamentSync';

describe('tournament cloud sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCloudTournaments.mockResolvedValue([]);
    mocks.listCloudTeams.mockResolvedValue([]);
    mocks.listCloudPlayers.mockResolvedValue([]);
    mocks.listCloudTeamPlayers.mockResolvedValue([]);
  });

  it('uploads a tournament before its dependent team', async () => {
    const tournamentItem = { id: 'out-1', entityType: 'TOURNAMENT', entityId: 't-1', attempts: 0 };
    const teamItem = { id: 'out-2', entityType: 'TEAM', entityId: 'team-1', attempts: 0 };
    mocks.listPendingSyncItems.mockResolvedValue([tournamentItem, teamItem]);
    mocks.getTournament.mockImplementation(async (id: string) => id === 't-1' ? tournament('cloud-t-1') : null);
    mocks.getTeam.mockResolvedValue(team());
    mocks.upsertCloudTournament.mockResolvedValue({ cloudId: 'cloud-t-1' });
    mocks.upsertCloudTeam.mockResolvedValue('cloud-team-1');

    const result = await syncTournamentData('user-1');

    expect(result).toEqual({ uploaded: 2, downloaded: 0, failed: 0 });
    expect(mocks.upsertCloudTournament).toHaveBeenCalledBefore(mocks.upsertCloudTeam);
    expect(mocks.markSyncComplete).toHaveBeenNthCalledWith(1, tournamentItem, 'cloud-t-1');
    expect(mocks.markSyncComplete).toHaveBeenNthCalledWith(2, teamItem, 'cloud-team-1');
  });

  it('persists failures and releases them only for a forced retry', async () => {
    const item = { id: 'out-1', entityType: 'TOURNAMENT', entityId: 't-1', attempts: 1 };
    mocks.listPendingSyncItems.mockResolvedValue([item]);
    mocks.getTournament.mockResolvedValue(tournament());
    mocks.upsertCloudTournament.mockRejectedValue(new Error('offline'));

    const result = await syncTournamentData('user-1', { forceRetry: true });

    expect(mocks.retryFailedSyncItems).toHaveBeenCalledOnce();
    expect(mocks.markSyncFailed).toHaveBeenCalledWith(item, 'offline');
    expect(result.failed).toBe(1);
  });

  it('uploads a player before its team membership', async () => {
    const playerItem = { id: 'out-p', entityType: 'PLAYER', entityId: 'player-1', attempts: 0 };
    const membershipItem = {
      id: 'out-m',
      entityType: 'TEAM_PLAYER',
      entityId: 'team-1:player-1',
      attempts: 0,
    };
    mocks.listPendingSyncItems.mockResolvedValue([playerItem, membershipItem]);
    mocks.getUser.mockResolvedValue({
      id: 'player-1', name: 'Player', role: 'AR', createdAt: 1, syncStatus: 'PENDING',
    });
    mocks.upsertCloudPlayer.mockResolvedValue('cloud-player-1');
    mocks.getTeamPlayerForSync.mockResolvedValue({
      team_cloud_id: 'cloud-team-1',
      player_cloud_id: 'cloud-player-1',
      jersey_no: 7,
      is_captain: 0,
      is_keeper: 1,
    });

    const result = await syncTournamentData('user-1');

    expect(result.uploaded).toBe(2);
    expect(mocks.upsertCloudPlayer).toHaveBeenCalledBefore(mocks.upsertCloudTeamPlayer);
    expect(mocks.upsertCloudTeamPlayer).toHaveBeenCalledWith({
      teamCloudId: 'cloud-team-1',
      playerCloudId: 'cloud-player-1',
      jerseyNo: 7,
      isCaptain: false,
      isKeeper: true,
    });
  });
});

function tournament(cloudId?: string) {
  return {
    id: 't-1', name: 'League', format: 'TURF' as const, startDate: 1,
    pointsWin: 2, pointsTie: 1, pointsLoss: 0, pointsNoResult: 1,
    status: 'ACTIVE' as const, createdAt: 1, plannedTeamCount: 2, playersPerTeam: 11,
    cloudId, syncStatus: 'PENDING' as const,
  };
}

function team() {
  return {
    id: 'team-1', tournamentId: 't-1', name: 'Team', shortName: 'TM',
    colorHex: '#fff', createdAt: 1, syncStatus: 'PENDING' as const,
  };
}
