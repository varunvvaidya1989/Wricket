import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  closeInnings: vi.fn(),
  createInnings: vi.fn(),
  getMatch: vi.fn(),
  getTeam: vi.fn(),
  listInningsForMatch: vi.fn(),
  setMatchResult: vi.fn(),
  setMatchStatus: vi.fn(),
  queueCloudScoringEvent: vi.fn(),
}));

vi.mock('../db/repo', () => ({
  closeInnings: mocks.closeInnings,
  createInnings: mocks.createInnings,
  getMatch: mocks.getMatch,
  getTeam: mocks.getTeam,
  listInningsForMatch: mocks.listInningsForMatch,
  setMatchResult: mocks.setMatchResult,
  setMatchStatus: mocks.setMatchStatus,
}));

vi.mock('@/lib/supabase/cloudScoringApi', () => ({
  queueCloudScoringEvent: mocks.queueCloudScoringEvent,
}));

vi.mock('../db/client', () => ({
  newId: () => 'local-innings-id',
  newUuid: () => '33333333-3333-4333-8333-333333333333',
}));

// Mocks must be declared before this module is evaluated.
// eslint-disable-next-line import/first
import { startNextInnings } from './innings-flow';

describe('startNextInnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the innings before queuing its foreign-keyed cloud event', async () => {
    const callOrder: string[] = [];
    mocks.createInnings.mockImplementation(async input => {
      callOrder.push('create');
      return {
        ...input,
        id: '22222222-2222-4222-8222-222222222222',
        totalRuns: 0,
        totalWickets: 0,
        totalBalls: 0,
        isClosed: false,
        isFollowOn: false,
      };
    });
    mocks.queueCloudScoringEvent.mockImplementation(async () => {
      callOrder.push('queue');
    });
    mocks.getTeam.mockImplementation(async (teamId: string) => ({
      id: teamId,
      cloudId: teamId === 'team-a'
        ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }));

    await startNextInnings('11111111-1111-4111-8111-111111111111', {
      sequence: 2,
      battingTeamId: 'team-b',
      bowlingTeamId: 'team-a',
      target: 101,
    });

    expect(callOrder).toEqual(['create', 'queue']);
    expect(mocks.queueCloudScoringEvent).toHaveBeenCalledWith(expect.objectContaining({
      inningsId: '22222222-2222-4222-8222-222222222222',
      clientEventId: 'start-innings-22222222-2222-4222-8222-222222222222',
      kind: 'INNINGS_STARTED',
      payload: expect.objectContaining({
        batting_team_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        bowling_team_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    }));
    expect(mocks.setMatchStatus).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'IN_PROGRESS',
    );
  });
});
