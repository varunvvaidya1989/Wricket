import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchSetupApi } from './matchSetupApi';

const client = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('./client', () => ({
  getSupabaseClient: () => client,
}));

describe('matchSetupApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends cloud player IDs and toss details to the transactional setup RPC', async () => {
    client.rpc.mockResolvedValue({
      data: {
        match_id: 'match-id',
        innings_id: 'innings-id',
        status: 'IN_PROGRESS',
        batting_team_id: 'team-a',
        bowling_team_id: 'team-b',
      },
      error: null,
    });

    await expect(matchSetupApi.startMatch({
      matchId: 'match-id',
      teamAXI: [{
        playerId: 'player-a',
        battingOrder: 1,
        isCaptain: true,
        isKeeper: false,
      }],
      teamBXI: [{
        playerId: 'player-b',
        battingOrder: 1,
        isCaptain: true,
        isKeeper: false,
      }],
      tossWinnerTeamId: 'team-a',
      tossChoice: 'BAT',
    })).resolves.toEqual(expect.objectContaining({
      matchId: 'match-id',
      inningsId: 'innings-id',
    }));

    expect(client.rpc).toHaveBeenCalledWith('start_match_setup', {
      p_match_id: 'match-id',
      p_team_a_xi: [{
        player_id: 'player-a',
        batting_order: 1,
        is_captain: true,
        is_keeper: false,
      }],
      p_team_b_xi: [{
        player_id: 'player-b',
        batting_order: 1,
        is_captain: true,
        is_keeper: false,
      }],
      p_toss_winner_team_id: 'team-a',
      p_toss_choice: 'BAT',
    });
  });

  it('does not hide server validation failures', async () => {
    const error = new Error('Every selected player must belong to the corresponding team');
    client.rpc.mockResolvedValue({ data: null, error });

    await expect(matchSetupApi.startMatch({
      matchId: 'match-id',
      teamAXI: [],
      teamBXI: [],
      tossWinnerTeamId: 'team-a',
      tossChoice: 'BAT',
    })).rejects.toBe(error);
  });
});
