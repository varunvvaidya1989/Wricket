import { getSupabaseClient } from './client';

export type SportScoringEventKind =
  | 'POINT' | 'SERVICE_CHANGED' | 'END_CHANGED' | 'OPTION_SET'
  | 'RETIREMENT' | 'WALKOVER' | 'ABANDONED' | 'CORRECTION' | 'UNDO' | 'COMPLETED';

export interface SportScoringLease {
  leaseToken: string;
  expiresAt: string;
}

export const sportScoringApi = {
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
