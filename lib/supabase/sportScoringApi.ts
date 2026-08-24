import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSupabaseClient } from './client';

let channelInstance = 0;
const DEVICE_ID_KEY = 'sportstage.sport-scoring-device-id';

export type SportScoringEventKind =
  | 'POINT' | 'SERVICE_CHANGED' | 'END_CHANGED' | 'OPTION_SET'
  | 'RETIREMENT' | 'WALKOVER' | 'ABANDONED' | 'CORRECTION' | 'UNDO' | 'COMPLETED';

export interface SportScoringLease {
  leaseToken: string;
  expiresAt: string;
}

export interface SportCloudScoringEvent {
  sequence: number;
  clientEventId: string;
  kind: SportScoringEventKind;
  payload: Record<string, unknown>;
  reversesClientEventId?: string;
  createdAt: string;
}

export interface SportCloudMatchFeed {
  id: string;
  sportId: string;
  competitionId?: string;
  entrantAId?: string;
  entrantBId?: string;
  competitionName: string;
  participantA: string;
  participantB: string;
  matchFormat: string;
  status: string;
  headlineScore: string;
  currentSequence: number;
  updatedAt: string;
  sideAPlayers: string[];
  sideBPlayers: string[];
  sideAProfileIds: string[];
  sideBProfileIds: string[];
  rulesSnapshot: Record<string, unknown>;
  createdBy: string;
  events: SportCloudScoringEvent[];
}

export const sportScoringApi = {
  async listOwned(input: { sportId: string; accountId: string; limit?: number }): Promise<SportCloudMatchFeed[]> {
    return listAccountMatches(input, true);
  },

  async listMine(input: { sportId: string; accountId: string; limit?: number }): Promise<SportCloudMatchFeed[]> {
    return listAccountMatches(input, false);
  },

  async feed(scoringMatchId: string): Promise<SportCloudMatchFeed> {
    const client = getSupabaseClient();
    const { data: match, error: matchError } = await client.from('sport_scoring_matches')
      .select('id, sport_id, competition_id, entrant_a_id, entrant_b_id, match_format, status, current_sequence, updated_at, side_a_players, side_b_players, rules_snapshot, created_by')
      .eq('id', scoringMatchId).single();
    if (matchError) throw matchError;

    const [snapshotResult, eventResult, playerResult] = await Promise.all([
      client.from('sport_public_live_snapshots')
        .select('competition_name, participant_a, participant_b, headline_score')
        .eq('scoring_match_id', scoringMatchId).maybeSingle(),
      client.from('sport_scoring_events')
        .select('sequence, client_event_id, kind, payload, reverses_client_event_id, created_at')
        .eq('scoring_match_id', scoringMatchId).order('sequence', { ascending: false }),
      client.from('sport_scoring_match_players')
        .select('side, player_order, sport_profile_id, display_name_snapshot')
        .eq('scoring_match_id', scoringMatchId).order('side').order('player_order'),
    ]);
    if (snapshotResult.error) throw snapshotResult.error;
    if (eventResult.error) throw eventResult.error;
    if (playerResult.error) throw playerResult.error;
    return toCloudFeed(match, snapshotResult.data, (eventResult.data ?? []).map(toCloudEvent), playerResult.data ?? []);
  },

  async createStandalone(input: {
    sportCode: string; matchFormat: 'SINGLES' | 'DOUBLES'; sideAProfileIds: readonly string[];
    sideBProfileIds: readonly string[]; rulesSnapshot: Record<string, unknown>;
  }): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('create_standalone_sport_scoring_match', {
      p_sport_code: input.sportCode,
      p_match_format: input.matchFormat,
      p_side_a_profile_ids: input.sideAProfileIds,
      p_side_b_profile_ids: input.sideBProfileIds,
      p_rules_snapshot: input.rulesSnapshot,
    });
    if (error) throw error;
    return String(data);
  },

  async prepareFixture(input: {
    fixtureId: string; fixtureMatchId?: string; rulesSnapshot: Record<string, unknown>;
  }): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('prepare_sport_fixture_scoring', {
      p_fixture_id: input.fixtureId,
      p_fixture_match_id: input.fixtureMatchId ?? null,
      p_rules_snapshot: input.rulesSnapshot,
    });
    if (error) throw error;
    return String(data);
  },

  async create(input: {
    fixtureId: string; fixtureMatchId?: string; matchFormat: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
    sideAPlayers: string[]; sideBPlayers: string[]; rulesSnapshot: Record<string, unknown>;
  }): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('create_sport_scoring_match', {
      p_fixture_id: input.fixtureId, p_fixture_match_id: input.fixtureMatchId ?? null,
      p_match_format: input.matchFormat, p_side_a_players: input.sideAPlayers,
      p_side_b_players: input.sideBPlayers, p_rules_snapshot: input.rulesSnapshot,
    });
    if (error) throw error;
    return String(data);
  },

  async acquireLease(scoringMatchId: string): Promise<SportScoringLease> {
    const deviceId = await getDeviceId();
    const { data, error } = await getSupabaseClient().rpc('acquire_sport_scoring_lease', {
      p_scoring_match_id: scoringMatchId, p_device_id: deviceId,
    });
    if (error) throw error;
    const lease = data as Record<string, unknown>;
    return { leaseToken: String(lease.lease_token), expiresAt: String(lease.expires_at) };
  },

  async append(input: {
    scoringMatchId: string; clientEventId: string; expectedSequence: number; leaseToken: string;
    kind: SportScoringEventKind; payload: Record<string, unknown>; reversesClientEventId?: string;
  }): Promise<{ duplicate: boolean; sequence: number }> {
    const { data, error } = await getSupabaseClient().rpc('append_sport_scoring_event', {
      p_scoring_match_id: input.scoringMatchId, p_client_event_id: input.clientEventId,
      p_expected_sequence: input.expectedSequence, p_lease_token: input.leaseToken,
      p_kind: input.kind, p_payload: input.payload,
      p_reverses_client_event_id: input.reversesClientEventId ?? null,
    });
    if (error) throw error;
    const result = data as Record<string, unknown>;
    return { duplicate: Boolean(result.duplicate), sequence: Number(result.sequence) };
  },

  subscribe(
    scoringMatchId: string,
    onChange: () => void,
    onError?: (message: string) => void,
    onConnectionChange?: (connected: boolean) => void,
  ): () => void {
    const client = getSupabaseClient();
    channelInstance += 1;
    const channel = client
      .channel(`sport-scoring:${scoringMatchId}:${channelInstance}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'sport_scoring_events', filter: `scoring_match_id=eq.${scoringMatchId}`,
      }, onChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'sport_scoring_matches', filter: `id=eq.${scoringMatchId}`,
      }, onChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'sport_public_live_snapshots', filter: `scoring_match_id=eq.${scoringMatchId}`,
      }, onChange)
      .subscribe((status, error) => {
        onConnectionChange?.(status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError?.(error?.message ?? 'Live updates are temporarily unavailable.');
        }
      });
    return () => { onConnectionChange?.(false); void client.removeChannel(channel); };
  },

  subscribeSportLive(sportId: string, onChange: () => void, onError?: (message: string) => void): () => void {
    const client = getSupabaseClient();
    channelInstance += 1;
    const channel = client
      .channel(`sport-live:${sportId}:${channelInstance}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'sport_public_live_snapshots', filter: `sport_id=eq.${sportId}`,
      }, onChange)
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError?.(error?.message ?? 'Live updates are temporarily unavailable.');
        }
      });
    return () => { void client.removeChannel(channel); };
  },
};

async function listAccountMatches(
  input: { sportId: string; accountId: string; limit?: number },
  creatorOnly: boolean,
): Promise<SportCloudMatchFeed[]> {
  const client = getSupabaseClient();
  let participantMatchIds: string[] = [];
  if (!creatorOnly) {
    const { data, error } = await client.from('sport_scoring_match_players')
      .select('scoring_match_id').eq('account_id', input.accountId);
    if (error) throw error;
    participantMatchIds = [...new Set((data ?? []).map((row) => String(row.scoring_match_id)))];
  }
  let matchQuery = client.from('sport_scoring_matches')
    .select('id, sport_id, competition_id, entrant_a_id, entrant_b_id, match_format, status, current_sequence, updated_at, side_a_players, side_b_players, rules_snapshot, created_by')
    .eq('sport_id', input.sportId);
  matchQuery = creatorOnly || !participantMatchIds.length
    ? matchQuery.eq('created_by', input.accountId)
    : matchQuery.or(`created_by.eq.${input.accountId},id.in.(${participantMatchIds.join(',')})`);
  const { data: matches, error: matchError } = await matchQuery
    .order('updated_at', { ascending: false }).limit(input.limit ?? 100);
  if (matchError) throw matchError;
  const matchIds = (matches ?? []).map((match) => String(match.id));
  if (!matchIds.length) return [];
  const [eventResult, playerResult, snapshotResult] = await Promise.all([
    client.from('sport_scoring_events')
      .select('scoring_match_id, sequence, client_event_id, kind, payload, reverses_client_event_id, created_at')
      .in('scoring_match_id', matchIds).order('sequence', { ascending: false }),
    client.from('sport_scoring_match_players')
      .select('scoring_match_id, side, player_order, sport_profile_id, display_name_snapshot')
      .in('scoring_match_id', matchIds).order('side').order('player_order'),
    client.from('sport_public_live_snapshots')
      .select('scoring_match_id, competition_name, participant_a, participant_b, headline_score')
      .in('scoring_match_id', matchIds),
  ]);
  if (eventResult.error) throw eventResult.error;
  if (playerResult.error) throw playerResult.error;
  if (snapshotResult.error) throw snapshotResult.error;
  const eventsByMatch = new Map<string, SportCloudScoringEvent[]>();
  (eventResult.data ?? []).forEach((event) => {
    const matchId = String(event.scoring_match_id);
    const current = eventsByMatch.get(matchId) ?? [];
    current.push(toCloudEvent(event));
    eventsByMatch.set(matchId, current);
  });
  return (matches ?? []).map((match) => {
    const matchId = String(match.id);
    return toCloudFeed(
      match,
      (snapshotResult.data ?? []).find((snapshot) => String(snapshot.scoring_match_id) === matchId),
      eventsByMatch.get(matchId) ?? [],
      (playerResult.data ?? []).filter((player) => String(player.scoring_match_id) === matchId),
    );
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toCloudEvent(event: Record<string, unknown>): SportCloudScoringEvent {
  return {
    sequence: Number(event.sequence),
    clientEventId: String(event.client_event_id),
    kind: event.kind as SportScoringEventKind,
    payload: objectValue(event.payload),
    reversesClientEventId: event.reverses_client_event_id ? String(event.reverses_client_event_id) : undefined,
    createdAt: String(event.created_at),
  };
}

function toCloudFeed(
  match: Record<string, unknown>,
  snapshot: Record<string, unknown> | null | undefined,
  events: SportCloudScoringEvent[],
  players: readonly Record<string, unknown>[],
): SportCloudMatchFeed {
  const sideAPlayers = stringArray(match.side_a_players);
  const sideBPlayers = stringArray(match.side_b_players);
  return {
    id: String(match.id),
    sportId: String(match.sport_id),
    competitionId: match.competition_id ? String(match.competition_id) : undefined,
    entrantAId: match.entrant_a_id ? String(match.entrant_a_id) : undefined,
    entrantBId: match.entrant_b_id ? String(match.entrant_b_id) : undefined,
    competitionName: snapshot?.competition_name ? String(snapshot.competition_name) : 'SportStage match',
    participantA: snapshot?.participant_a ? String(snapshot.participant_a) : sideAPlayers.join(' / ') || 'Entrant A',
    participantB: snapshot?.participant_b ? String(snapshot.participant_b) : sideBPlayers.join(' / ') || 'Entrant B',
    matchFormat: String(match.match_format),
    status: String(match.status),
    headlineScore: snapshot?.headline_score ? String(snapshot.headline_score) : '0-0',
    currentSequence: Number(match.current_sequence),
    updatedAt: String(match.updated_at),
    sideAPlayers,
    sideBPlayers,
    sideAProfileIds: players.filter((player) => Number(player.side) === 0)
      .sort((left, right) => Number(left.player_order) - Number(right.player_order))
      .map((player) => String(player.sport_profile_id)),
    sideBProfileIds: players.filter((player) => Number(player.side) === 1)
      .sort((left, right) => Number(left.player_order) - Number(right.player_order))
      .map((player) => String(player.sport_profile_id)),
    rulesSnapshot: objectValue(match.rules_snapshot),
    createdBy: String(match.created_by),
    events,
  };
}

async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `sport-${createSportScoringClientEventId()}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function randomHex(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function createSportScoringClientEventId(): string {
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-8${randomHex(3)}-${randomHex(12)}`;
}
