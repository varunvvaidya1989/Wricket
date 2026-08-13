import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSupabaseClient } from './client';
import {
  enqueueScoringEvent,
  listPendingScoringEvents,
  markScoringEventFailed,
  markScoringEventSent,
} from '@/lib/wricket/db/scoringEventOutbox';
import type { PendingScoringEvent } from '@/lib/wricket/db/scoringEventOutbox';
import { getTeam } from '@/lib/wricket/db/repo';
import { fixturesApi } from './fixturesApi';

const DEVICE_ID_KEY = 'wricket.scoring-device-id';
const activeFlushes = new Map<string, Promise<void>>();
const syncStates = new Map<string, CloudScoringSyncState>();
const syncListeners = new Map<string, Set<(state: CloudScoringSyncState) => void>>();

export interface CloudScoringSyncState {
  status: 'PENDING' | 'SYNCING' | 'LIVE' | 'ERROR';
  pending: number;
  error?: string;
}

export interface CloudBallPayload extends Record<string, unknown> {
  innings_id: string;
  over_no: number;
  ball_in_over: number;
  legal_ball_in_over: number;
  striker_id: string;
  non_striker_id: string;
  bowler_id: string;
  runs_bat: number;
  runs_extra: number;
  extra_kind: string | null;
  rotate_strike?: boolean;
  is_legal: boolean;
  is_wicket: boolean;
  dismissal_kind?: string;
  out_player_id?: string;
  fielder_id?: string;
  assistant_fielder_id?: string;
}

export async function queueCloudBall(input: {
  clientEventId: string;
  matchId: string;
  inningsId: string;
  payload: CloudBallPayload;
}): Promise<void> {
  return queueCloudScoringEvent({
    ...input,
    kind: 'BALL_RECORDED',
  });
}

export async function queueCloudScoringEvent(input: {
  clientEventId: string;
  matchId: string;
  inningsId: string;
  kind: PendingScoringEvent['kind'];
  payload: Record<string, unknown>;
}): Promise<void> {
  await enqueueScoringEvent({
    clientEventId: input.clientEventId,
    matchId: input.matchId,
    inningsId: input.inningsId,
    kind: input.kind,
    payload: input.payload,
  });
  const pending = await listPendingScoringEvents(input.matchId);
  setSyncState(input.matchId, { status: 'PENDING', pending: pending.length });
  void flushScoringEvents(input.matchId);
}

export function getCloudScoringSyncState(matchId: string): CloudScoringSyncState {
  return syncStates.get(matchId) ?? { status: 'LIVE', pending: 0 };
}

export function subscribeToCloudScoringSync(
  matchId: string,
  listener: (state: CloudScoringSyncState) => void,
): () => void {
  const listeners = syncListeners.get(matchId) ?? new Set();
  listeners.add(listener);
  syncListeners.set(matchId, listeners);
  listener(getCloudScoringSyncState(matchId));
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) syncListeners.delete(matchId);
  };
}

export function flushScoringEvents(matchId: string): Promise<void> {
  const existing = activeFlushes.get(matchId);
  if (existing) return existing;
  const flush = runFlush(matchId).finally(() => activeFlushes.delete(matchId));
  activeFlushes.set(matchId, flush);
  return flush;
}

async function runFlush(matchId: string): Promise<void> {
  try {
    const initiallyPending = await listPendingScoringEvents(matchId);
    if (initiallyPending.length === 0) {
      setSyncState(matchId, { status: 'LIVE', pending: 0 });
      return;
    }
    setSyncState(matchId, { status: 'SYNCING', pending: initiallyPending.length });
    const deviceId = await getDeviceId();
    const { data: lease, error: leaseError } = await getSupabaseClient().rpc(
      'acquire_scoring_lease',
      { p_match_id: matchId, p_device_id: deviceId },
    );
    if (leaseError) throw leaseError;
    const { data: match, error: matchError } = await getSupabaseClient()
      .from('matches')
      .select('current_sequence')
      .eq('id', matchId)
      .single();
    if (matchError) throw matchError;
    let expectedSequence = Number(match.current_sequence);

    while (true) {
      const pending = await listPendingScoringEvents(matchId);
      if (pending.length === 0) {
        setSyncState(matchId, { status: 'LIVE', pending: 0 });
        return;
      }
      setSyncState(matchId, { status: 'SYNCING', pending: pending.length });
      for (const [index, event] of pending.entries()) {
        const lifecycleEvent = [
          'INNINGS_CLOSED',
          'INNINGS_STARTED',
          'MATCH_COMPLETED',
          'MATCH_ABANDONED',
        ].includes(event.kind);
        const payload = await normalizeLifecyclePayload(event);
        const { data, error } = await getSupabaseClient().rpc(
          lifecycleEvent ? 'append_match_lifecycle_event' : 'append_match_event',
          {
            p_match_id: matchId,
            p_client_event_id: event.clientEventId,
            p_expected_sequence: expectedSequence,
            p_lease_token: lease.lease_token,
            p_kind: event.kind,
            p_payload: payload,
          },
        );
        if (error) {
          await markScoringEventFailed(event.clientEventId, error);
          const message = describeSupabaseError(error);
          console.error('[Wricket scoring sync]', {
            matchId,
            eventKind: event.kind,
            clientEventId: event.clientEventId,
            message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          });
          throw new Error(`${event.kind}: ${message}`);
        }
        if (!data.duplicate) expectedSequence = Number(data.sequence);
        await markScoringEventSent(event.clientEventId);
        if (event.kind === 'MATCH_COMPLETED') {
          // Advancement is idempotent. Run it at the authoritative completion
          // boundary instead of depending on an organiser opening the fixture screen.
          void advanceCompletedTournament(matchId);
        }
        setSyncState(matchId, {
          status: 'SYNCING',
          pending: Math.max(0, pending.length - index - 1),
        });
      }
    }
  } catch (cause) {
    // The durable outbox is intentionally retained for the next reconnect/app resume.
    const pending = await listPendingScoringEvents(matchId);
    setSyncState(matchId, {
      status: 'ERROR',
      pending: pending.length,
      error: describeSupabaseError(cause),
    });
  }
}

async function advanceCompletedTournament(matchId: string): Promise<void> {
  try {
    const { data, error } = await getSupabaseClient().from('matches')
      .select('tournament_id').eq('id', matchId).single();
    if (error) throw error;
    if (data.tournament_id) await fixturesApi.advanceTournamentIfReady(data.tournament_id);
  } catch (cause) {
    // Match completion remains authoritative. Owners get another idempotent
    // advancement attempt from tournament Realtime/focus if this caller lacks permission.
    console.warn('[Wricket fixture advancement]', describeSupabaseError(cause));
  }
}

function describeSupabaseError(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === 'object') {
    const error = cause as Record<string, unknown>;
    const parts = [error.message, error.details, error.hint]
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (parts.length > 0) return [...new Set(parts)].join(' — ');
  }
  return String(cause);
}

async function normalizeLifecyclePayload(
  event: PendingScoringEvent,
): Promise<Record<string, unknown>> {
  if (event.kind !== 'INNINGS_STARTED' && event.kind !== 'MATCH_COMPLETED') {
    return event.payload;
  }

  const cloudTeamId = async (value: unknown): Promise<unknown> => {
    if (typeof value !== 'string') return value;
    const team = await getTeam(value);
    return team?.cloudId ?? value;
  };

  if (event.kind === 'INNINGS_STARTED') {
    return {
      ...event.payload,
      batting_team_id: await cloudTeamId(event.payload.batting_team_id),
      bowling_team_id: await cloudTeamId(event.payload.bowling_team_id),
    };
  }

  const result = event.payload.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return event.payload;
  const typedResult = result as Record<string, unknown>;
  return {
    ...event.payload,
    result: {
      ...typedResult,
      winnerTeamId: await cloudTeamId(typedResult.winnerTeamId),
    },
  };
}

function setSyncState(matchId: string, state: CloudScoringSyncState): void {
  syncStates.set(matchId, state);
  syncListeners.get(matchId)?.forEach(listener => listener(state));
}

async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
