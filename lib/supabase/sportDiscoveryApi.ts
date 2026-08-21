import { isSportReleased } from '@/lib/sports/platform/sportRelease';

import { getSupabaseClient } from './client';

export interface SportPublicLiveSnapshot {
  scoringMatchId: string; sportId: string; sportCode: string; competitionId: string; competitionName: string;
  participantA: string; participantB: string; status: string; headlineScore: string;
  refreshedAt: string; staleAfter: string; shareSlug: string;
}

export interface SportPublicPlayerCard {
  sportProfileId: string; sportCode: string; displayName: string; avatarUrl?: string; headline?: string; updatedAt: string;
}

export interface SportUpcomingSnapshot {
  discoveryId: string; sourceKind: 'CRICKET_MATCH' | 'SPORT_FIXTURE'; sourceId: string;
  sportId: string; sportCode: string; competitionId: string; competitionName: string;
  participantA: string; participantB: string; matchFormat: string; scheduledAt: string;
  venue?: string; shareSlug: string;
}

const mapSnapshot = (row: Record<string, unknown>): SportPublicLiveSnapshot => ({
  scoringMatchId: String(row.scoring_match_id), sportId: String(row.sport_id), sportCode: String(row.sport_code),
  competitionId: String(row.competition_id), competitionName: String(row.competition_name),
  participantA: String(row.participant_a), participantB: String(row.participant_b),
  status: String(row.status), headlineScore: String(row.headline_score),
  refreshedAt: String(row.refreshed_at), staleAfter: String(row.stale_after), shareSlug: String(row.share_slug),
});

const mapUpcoming = (row: Record<string, unknown>): SportUpcomingSnapshot => ({
  discoveryId: String(row.discovery_id),
  sourceKind: String(row.source_kind) as SportUpcomingSnapshot['sourceKind'],
  sourceId: String(row.source_id),
  sportId: String(row.sport_id),
  sportCode: String(row.sport_code),
  competitionId: String(row.competition_id),
  competitionName: String(row.competition_name),
  participantA: String(row.participant_a),
  participantB: String(row.participant_b),
  matchFormat: String(row.match_format),
  scheduledAt: String(row.scheduled_at),
  venue: row.venue ? String(row.venue) : undefined,
  shareSlug: String(row.share_slug),
});

export const sportDiscoveryApi = {
  async discover(clientKey: string, before?: string, limit = 20): Promise<SportPublicLiveSnapshot[]> {
    const client = getSupabaseClient();
    const [sports, cricket] = await Promise.all([
      client.rpc('discover_sport_public_live', {
        p_client_key: clientKey, p_limit: limit, p_before: before ?? null,
      }),
      client.rpc('discover_cricket_live', { p_limit: limit, p_before: before ?? null }),
    ]);
    if (sports.error) throw sports.error;
    if (cricket.error) throw cricket.error;
    const snapshots = [...(sports.data ?? []), ...(cricket.data ?? [])]
      .map((row: Record<string, unknown>) => mapSnapshot(row))
      .filter((snapshot) => isSportReleased(snapshot.sportCode));
    return snapshots
      .sort((left, right) => Date.parse(right.refreshedAt) - Date.parse(left.refreshedAt))
      .slice(0, limit);
  },
  async follow(resourceType: 'MATCH' | 'PLAYER' | 'TEAM' | 'CLUB' | 'COMPETITION', resourceId: string, sportId: string, follow: boolean): Promise<void> {
    const { error } = await getSupabaseClient().rpc('set_sport_follow', {
      p_resource_type: resourceType, p_resource_id: resourceId, p_sport_id: sportId, p_follow: follow,
    });
    if (error) throw error;
  },
  async feed(before?: string, limit = 30): Promise<SportPublicLiveSnapshot[]> {
    const client = getSupabaseClient();
    const [{ data, error }, { data: sessionData }] = await Promise.all([
      client.rpc('list_my_sport_following_feed', { p_limit: limit, p_before: before ?? null }),
      client.auth.getSession(),
    ]);
    if (error) throw error;
    const snapshots = (data ?? [])
      .map((row: Record<string, unknown>) => mapSnapshot(row))
      .filter((snapshot: SportPublicLiveSnapshot) => isSportReleased(snapshot.sportCode));
    const accountId = sessionData.session?.user.id;
    if (!accountId) return snapshots;

    const { data: follows, error: followError } = await client.from('match_follows')
      .select('match_id')
      .eq('account_id', accountId)
      .eq('status', 'ACTIVE');
    if (followError) throw followError;
    const cricketIds = (follows ?? []).map((follow) => follow.match_id);
    if (!cricketIds.length) return snapshots;

    const { data: cricket, error: cricketError } = await client.from('cricket_live_snapshots')
      .select('match_id, sport_id, sport_code, competition_id, competition_name, participant_a, participant_b, status, headline_score, refreshed_at, stale_after, share_slug')
      .in('match_id', cricketIds);
    if (cricketError) throw cricketError;
    return [...snapshots, ...(cricket ?? []).map((row) => mapSnapshot({ ...row, scoring_match_id: row.match_id }))]
      .sort((left, right) => Date.parse(right.refreshedAt) - Date.parse(left.refreshedAt))
      .slice(0, limit);
  },
  async upcoming(limit = 30, sportCode?: string): Promise<SportUpcomingSnapshot[]> {
    const { data, error } = await getSupabaseClient().rpc('discover_sportstage_upcoming', {
      p_limit: limit,
      p_sport_code: sportCode ?? null,
    });
    if (error) throw error;
    return (data ?? [])
      .map((row: Record<string, unknown>) => mapUpcoming(row))
      .filter((snapshot: SportUpcomingSnapshot) => isSportReleased(snapshot.sportCode));
  },
  async publicPlayerCard(sportProfileId: string): Promise<SportPublicPlayerCard | undefined> {
    const { data, error } = await getSupabaseClient().from('sport_public_player_cards')
      .select('sport_profile_id, sport_code, display_name, avatar_url, headline, updated_at')
      .eq('sport_profile_id', sportProfileId).eq('is_public', true).maybeSingle();
    if (error) throw error;
    if (!data || !isSportReleased(String(data.sport_code))) return undefined;
    return {
      sportProfileId: String(data.sport_profile_id), sportCode: String(data.sport_code),
      displayName: String(data.display_name), avatarUrl: data.avatar_url ? String(data.avatar_url) : undefined,
      headline: data.headline ? String(data.headline) : undefined, updatedAt: String(data.updated_at),
    };
  },
};
