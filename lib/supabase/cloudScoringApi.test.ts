import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingScoringEvent } from '@/lib/wricket/db/scoringEventOutbox';

const state = vi.hoisted(() => ({
  pending: new Map<string, PendingScoringEvent>(),
  accepted: new Map<string, number>(),
  sequence: 0, offline: false, lostAck: false, leaseError: false,
  list: vi.fn(), rpc: vi.fn(),
  storage: new Map<string,string>(), account: 'scorer-account',
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async (key: string) => state.storage.get(key) ?? null, setItem: async (key: string,value: string) => { state.storage.set(key,value); },removeItem: async (key: string) => { state.storage.delete(key); } } }));
vi.mock('@/lib/wricket/db/scoringEventOutbox', () => ({
  enqueueScoringEvent: async (event: Omit<PendingScoringEvent, 'attempts'>) => {
    if (!state.pending.has(event.clientEventId)) state.pending.set(event.clientEventId, { ...event, attempts: 0 });
  },
  listPendingScoringEvents: state.list,
  markScoringEventSent: async (id: string) => { state.pending.delete(id); },
  markScoringEventFailed: async (id: string) => { state.pending.get(id)!.attempts++; },
}));
vi.mock('@/lib/wricket/db/repo', () => ({ getTeam: async () => null }));
vi.mock('./fixturesApi', () => ({ fixturesApi: { advanceTournamentIfReady: vi.fn() } }));
vi.mock('./client', () => ({ getSupabaseClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: state.account } } },error: null }) },
  rpc: state.rpc,
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { current_sequence: state.sequence, tournament_id: null }, error: null }) }) }) }),
}) }));
import { ensureCloudScoringAccess, flushScoringEvents, getCloudScoringSyncState, queueCloudScoringEvent } from './cloudScoringApi';

const event = (id: string, kind: PendingScoringEvent['kind'] = 'BALL_RECORDED') => ({ clientEventId: id, matchId: 'test-match', inningsId: 'test-innings', kind, payload: { innings_id: 'test-innings', runs_bat: 1 } });
beforeEach(() => {
  state.pending.clear(); state.accepted.clear(); state.sequence = 0;
  state.offline = false; state.lostAck = false; state.leaseError = false;
  state.storage.clear(); state.storage.set('wricket.scoring-device-id','test-device'); state.account = 'scorer-account';
  state.list.mockReset().mockImplementation(async () => [...state.pending.values()].map(row => ({ ...row })));
  state.rpc.mockReset().mockImplementation(async (name: string, input: Record<string, unknown>) => {
    if (state.offline) return { data: null, error: { message: 'Offline' } };
    if (name === 'acquire_scoring_lease') return state.leaseError ? { data: null, error: { message: 'Another scorer owns this match' } } : { data: { lease_token: 'test-lease' }, error: null };
    const id = String(input.p_client_event_id);
    const previous = state.accepted.get(id);
    if (previous) return { data: { duplicate: true, sequence: previous }, error: null };
    if (input.p_expected_sequence !== state.sequence) return { data: null, error: { message: 'Sequence conflict' } };
    state.sequence++; state.accepted.set(id, state.sequence);
    if (state.lostAck) { state.lostAck = false; return { data: null, error: { message: 'Connection lost after acceptance' } }; }
    return { data: { duplicate: false, sequence: state.sequence }, error: null };
  });
});

describe('cloud outbox reconnect and acknowledgements', () => {
  it('keeps offline event recovery usable without exposing a transport stack trace',async () => {
    state.rpc.mockResolvedValue({ data: null,error: { message: 'TypeError: Network request failed',details: 'at anonymous (http://local-bundler/private-source-path)' } });
    await queueCloudScoringEvent(event('offline-ball')); await flushScoringEvents('test-match');
    expect(getCloudScoringSyncState('test-match')).toEqual({ status: 'ERROR',pending: 1,error: 'Offline. Updates are saved on this device.' });
    expect(state.pending.has('offline-ball')).toBe(true);
  });
  it('retains offline events and uploads delivery/lifecycle events in their original order on reconnect', async () => {
    state.offline = true;
    for (const row of [event('ball'),event('close','INNINGS_CLOSED'),event('start','INNINGS_STARTED')]) {
      await queueCloudScoringEvent(row); await flushScoringEvents('test-match');
    }
    expect(state.pending.size).toBe(3); expect(state.accepted.size).toBe(0);
    expect(getCloudScoringSyncState('test-match')).toMatchObject({ status: 'ERROR', pending: 3 });
    state.offline = false; await flushScoringEvents('test-match');
    expect([...state.accepted.keys()]).toEqual(['ball','close','start']);
    expect(state.pending.size).toBe(0); expect(getCloudScoringSyncState('test-match')).toEqual({ status: 'LIVE', pending: 0 });
  });
  it('retries a lost acknowledgement using the same event ID without counting the ball twice or regressing the next sequence', async () => {
    state.lostAck = true; await queueCloudScoringEvent(event('ball-1'));
    // Let the automatic drain finish before explicitly requesting reconnect.
    await vi.waitFor(() => expect(getCloudScoringSyncState('test-match').status).toBe('ERROR'));
    expect(state.accepted.size).toBe(1); expect(state.pending.get('ball-1')?.attempts).toBe(1);
    await queueCloudScoringEvent(event('ball-2')); await flushScoringEvents('test-match');
    expect([...state.accepted.entries()]).toEqual([['ball-1',1],['ball-2',2]]);
    expect(state.pending.size).toBe(0);
    expect(state.rpc.mock.calls.filter(([name, args]) => name === 'append_match_event' && args.p_client_event_id === 'ball-1')).toHaveLength(2);
  });
  it('retains the outbox when another scorer owns the lease and succeeds after the lease becomes available', async () => {
    state.leaseError = true; await queueCloudScoringEvent(event('ball')); await flushScoringEvents('test-match');
    expect(state.pending.size).toBe(1); expect(state.accepted.size).toBe(0);
    state.leaseError = false; await flushScoringEvents('test-match');
    expect(state.accepted.size).toBe(1); expect(state.pending.size).toBe(0);
  });
  it('drains a command queued while an earlier flush is returning its empty snapshot', async () => {
    let release!: () => void;
    state.list.mockImplementationOnce(() => new Promise<PendingScoringEvent[]>(resolve => { release = () => resolve([]); }));
    const initial = flushScoringEvents('test-match');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await queueCloudScoringEvent(event('raced-ball'));
    release(); await initial;
    expect(state.pending.size).toBe(0); expect(state.accepted.size).toBe(1);
    expect(getCloudScoringSyncState('test-match').status).toBe('LIVE');
  });
  it('permits offline restoration only for the account previously authorised on this device', async () => {
    await ensureCloudScoringAccess('test-match'); state.offline = true;
    await expect(ensureCloudScoringAccess('test-match')).resolves.toBeUndefined();
    state.account = 'another-account'; await expect(ensureCloudScoringAccess('test-match')).rejects.toThrow('Offline');
  });
  it('does not fall back to a cached grant after an authoritative lease or role denial', async () => {
    await ensureCloudScoringAccess('test-match'); state.leaseError = true;
    await expect(ensureCloudScoringAccess('test-match')).rejects.toThrow('Another scorer');
    state.offline = true;
    await expect(ensureCloudScoringAccess('test-match')).rejects.toThrow('Offline');
  });
});
