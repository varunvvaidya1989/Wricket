import { getSupabaseClient } from './client';

export type SportScoringEventKind =
  | 'POINT' | 'SERVICE_CHANGED' | 'END_CHANGED' | 'OPTION_SET'
  | 'RETIREMENT' | 'WALKOVER' | 'ABANDONED' | 'CORRECTION' | 'UNDO' | 'COMPLETED';

export interface SportScoringLease {
  leaseToken: string;
  expiresAt: string;
}

export interface SportCloudScoringEvent {
  sequence: number;
  kind: SportScoringEventKind;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SportCloudMatchFeed {
  id: string;
  sportId: string;
  competitionId?: string;
  competitionName: string;
  participantA: string;
  participantB: string;
  matchFormat: string;
  status: string;
  headlineScore: string;
  currentSequence: number;
  updatedAt: string;
  events: SportCloudScoringEvent[];
}

export const sportScoringApi = {
  async feed(scoringMatchId: string): Promise<SportCloudMatchFeed> {
    const client = getSupabaseClient();
    const { data: match, error: matchError } = await client.from('sport_scoring_matches')
      .select('id, sport_id, competition_id, match_format, status, current_sequence, updated_at')
      .eq('id', scoringMatchId).single();
    if (matchError) throw matchError;

    const [snapshotResult, eventResult] = await Promise.all([
      client.from('sport_public_live_snapshots')
        .select('competition_name, participant_a, participant_b, headline_score')
        .eq('scoring_match_id', scoringMatchId).maybeSingle(),
      client.from('sport_scoring_events')
        .select('sequence, kind, payload, created_at')
        .eq('scoring_match_id', scoringMatchId).order('sequence', { ascending: false }).limit(100),
    ]);
    if (snapshotResult.error) throw snapshotResult.error;
    if (eventResult.error) throw eventResult.error;
    const snapshot = snapshotResult.data;
    return {
      id: String(match.id), sportId: String(match.sport_id),
      competitionId: match.competition_id ? String(match.competition_id) : undefined,
      competitionName: snapshot?.competition_name ? String(snapshot.competition_name) : 'SportStage match',
      participantA: snapshot?.participant_a ? String(snapshot.participant_a) : 'Entrant A',
      participantB: snapshot?.participant_b ? String(snapshot.participant_b) : 'Entrant B',
      matchFormat: String(match.match_format), status: String(match.status),
      headlineScore: snapshot?.headline_score ? String(snapshot.headline_score) : '0-0',
      currentSequence: Number(match.current_sequence), updatedAt: String(match.updated_at),
      events: (eventResult.data ?? []).map((event) => ({
        sequence: Number(event.sequence), kind: event.kind as SportScoringEventKind,
        payload: event.payload as Record<string, unknown>, createdAt: String(event.created_at),
      })),
    };
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

  async acquireLease(scoringMatchId: string, deviceId: string): Promise<SportScoringLease> {
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
};
