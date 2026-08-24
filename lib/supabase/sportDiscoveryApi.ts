import { isSportReleased } from '@/lib/sports/platform/sportRelease';
import { selectFollowedUpcoming } from '@/lib/sports/platform/followedUpcoming';

import { getSupabaseClient } from './client';

export interface SportPublicLiveSnapshot {
  scoringMatchId: string; sportId: string; sportCode: string; competitionId?: string; competitionName: string;
  participantA: string; participantB: string; status: string; headlineScore: string;
  refreshedAt: string; staleAfter: string; shareSlug: string;
}

export interface SportLiveCursor {
  refreshedAt: string;
  scoringMatchId: string;
}

export interface SportLivePage {
  items: SportPublicLiveSnapshot[];
  nextCursor?: SportLiveCursor;
  hasMore: boolean;
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

export interface CricketTournamentInsight {
  id: string;
  name: string;
  startAt: string;
  location?: string;
  logoUrl?: string;
  relationship: 'OWNER' | 'MY_TEAM' | 'TOURNAMENT_MEMBER' | 'FOLLOWING';
}

const mapSnapshot = (row: Record<string, unknown>): SportPublicLiveSnapshot => ({
  scoringMatchId: String(row.scoring_match_id), sportId: String(row.sport_id), sportCode: String(row.sport_code),
  competitionId: row.competition_id ? String(row.competition_id) : undefined,
  competitionName: String(row.competition_name),
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
  async cricketTournamentInsights(limit = 8): Promise<CricketTournamentInsight[]> {
    const client = getSupabaseClient();
    const { data: relevant, error: relevantError } = await client.rpc('list_relevant_tournament_ids');
    if (relevantError) throw relevantError;
    const rows = (relevant ?? []) as Record<string, unknown>[];
    const ids = rows.map(row => String(row.tournament_id));
    if (!ids.length) return [];
    const { data, error } = await client.from('tournaments')
      .select('id, name, start_at, location, logo_url')
      .in('id', ids)
      .order('start_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const relationshipById = new Map(rows.map(row => [String(row.tournament_id), String(row.eligibility_reason)]));
    return (data ?? []).map(row => ({
      id: String(row.id),
      name: String(row.name),
      startAt: String(row.start_at),
      location: row.location ? String(row.location) : undefined,
      logoUrl: row.logo_url ? String(row.logo_url) : undefined,
      relationship: relationshipLabel(relationshipById.get(String(row.id))),
    }));
  },
  async discover(_clientKey: string, before?: string, limit = 20): Promise<SportPublicLiveSnapshot[]> {
    const page = await this.discoverPage(before ? { refreshedAt: before, scoringMatchId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' } : undefined, limit);
    return page.items;
  },
  async discoverPage(cursor?: SportLiveCursor, limit = 8): Promise<SportLivePage> {
    const requestedLimit = Math.min(Math.max(limit, 1), 49);
    const { data, error } = await getSupabaseClient().rpc('discover_sportstage_live', {
      p_limit: requestedLimit + 1,
      p_before: cursor?.refreshedAt ?? null,
      p_before_match_id: cursor?.scoringMatchId ?? null,
    });
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    const pageRows = rows.slice(0, requestedLimit);
    const lastRow = pageRows.at(-1);
    return {
      items: pageRows.map(mapSnapshot).filter(snapshot => isSportReleased(snapshot.sportCode)),
      nextCursor: lastRow ? {
        refreshedAt: String(lastRow.refreshed_at),
        scoringMatchId: String(lastRow.scoring_match_id),
      } : undefined,
      hasMore: rows.length > requestedLimit,
    };
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

    const [{ data: matchFollows, error: matchFollowError }, { data: relevantTournaments, error: relevantTournamentError }] = await Promise.all([
      client.from('match_follows').select('match_id').eq('account_id', accountId).eq('status', 'ACTIVE'),
      client.rpc('list_relevant_tournament_ids'),
    ]);
    if (matchFollowError) throw matchFollowError;
    if (relevantTournamentError) throw relevantTournamentError;
    const matchIds = (matchFollows ?? []).map(follow => follow.match_id);
    const tournamentIds = (relevantTournaments ?? []).map((tournament: Record<string, unknown>) => String(tournament.tournament_id));
    const cricketQueries = [
      matchIds.length ? client.from('cricket_live_snapshots').select(CRICKET_SNAPSHOT_FIELDS).in('match_id', matchIds) : Promise.resolve({ data: [], error: null }),
      tournamentIds.length ? client.from('cricket_live_snapshots').select(CRICKET_SNAPSHOT_FIELDS).in('competition_id', tournamentIds) : Promise.resolve({ data: [], error: null }),
    ];
    const cricketResults = await Promise.all(cricketQueries);
    const cricket = cricketResults.flatMap((result) => {
      if (result.error) throw result.error;
      return result.data ?? [];
    });
    return dedupeSnapshots([...snapshots, ...cricket.map((row) => mapSnapshot({ ...row, scoring_match_id: row.match_id }))])
      .sort((left, right) => Date.parse(right.refreshedAt) - Date.parse(left.refreshedAt))
      .slice(0, limit);
  },
  async followedUpcoming(snapshots: readonly SportUpcomingSnapshot[]): Promise<SportUpcomingSnapshot[]> {
    if (!snapshots.length) return [];
    const client = getSupabaseClient();
    const { data: sessionData } = await client.auth.getSession();
    const accountId = sessionData.session?.user.id;
    if (!accountId) return [];
    const [matches, tournaments, sports] = await Promise.all([
      client.from('match_follows').select('match_id').eq('account_id', accountId).eq('status', 'ACTIVE'),
      client.rpc('list_relevant_tournament_ids'),
      client.from('sport_follows').select('resource_type, resource_id').eq('account_id', accountId).in('resource_type', ['MATCH', 'COMPETITION']),
    ]);
    if (matches.error) throw matches.error;
    if (tournaments.error) throw tournaments.error;
    if (sports.error) throw sports.error;
    return selectFollowedUpcoming(snapshots, {
      cricketMatchIds: new Set((matches.data ?? []).map(row => String(row.match_id))),
      cricketTournamentIds: new Set((tournaments.data ?? []).map((row: Record<string, unknown>) => String(row.tournament_id))),
      sportMatchIds: new Set((sports.data ?? []).filter(row => row.resource_type === 'MATCH').map(row => String(row.resource_id))),
      sportCompetitionIds: new Set((sports.data ?? []).filter(row => row.resource_type === 'COMPETITION').map(row => String(row.resource_id))),
    });
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

const CRICKET_SNAPSHOT_FIELDS = 'match_id, sport_id, sport_code, competition_id, competition_name, participant_a, participant_b, status, headline_score, refreshed_at, stale_after, share_slug';

function dedupeSnapshots(snapshots: readonly SportPublicLiveSnapshot[]): SportPublicLiveSnapshot[] {
  return [...new Map(snapshots.map(snapshot => [`${snapshot.sportCode}:${snapshot.scoringMatchId}`, snapshot])).values()];
}

function relationshipLabel(value?: string): CricketTournamentInsight['relationship'] {
  return value === 'OWNER' || value === 'MY_TEAM' || value === 'TOURNAMENT_MEMBER' ? value : 'FOLLOWING';
}
